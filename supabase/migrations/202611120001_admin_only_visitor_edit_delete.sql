begin;

-- Team can read and register visitors. Only admins can change or remove visits.
drop policy visitors_staff_manage on public.visitors;
create policy visitors_staff_read on public.visitors
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy visitors_staff_insert on public.visitors
  for insert to authenticated
  with check ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy visitors_admin_manage on public.visitors
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));

-- Shared people records must also be protected against direct API writes.
-- Keep existing decision permissions for people without visitor records.
create policy people_visitor_admin_update on public.people
  as restrictive for update to authenticated
  using (
    (select public.has_any_role(array['admin']::public.app_role[]))
    or not exists (select 1 from public.visitors v where v.person_id = people.id)
  )
  with check (
    (select public.has_any_role(array['admin']::public.app_role[]))
    or not exists (select 1 from public.visitors v where v.person_id = people.id)
  );
create policy people_visitor_admin_delete on public.people
  as restrictive for delete to authenticated
  using (
    (select public.has_any_role(array['admin']::public.app_role[]))
    or not exists (select 1 from public.visitors v where v.person_id = people.id)
  );

-- SECURITY DEFINER functions need their own authorization checks.
create or replace function public.update_staff_visitor_details(
  p_person_id uuid,
  p_visit_id uuid,
  p_full_name text,
  p_phone_normalized text,
  p_visited_on date,
  p_contact_consent boolean,
  p_prayer_request text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  normalized_request text := nullif(pg_catalog.btrim(p_prayer_request), '');
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  if p_person_id is null or p_visit_id is null
    or normalized_name is null or pg_catalog.char_length(normalized_name) not between 2 and 120
    or p_phone_normalized is null or p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$'
    or p_visited_on is null
    or p_visited_on > (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
    or p_contact_consent is null
    or (normalized_request is not null and pg_catalog.char_length(normalized_request) > 2000) then
    raise exception using errcode = '22023', message = 'Invalid visitor details';
  end if;

  perform 1 from public.visitors v
  where v.id = p_visit_id and v.person_id = p_person_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Visitor record not found';
  end if;

  update public.people
  set full_name = normalized_name,
      phone_normalized = p_phone_normalized,
      updated_by = current_user_id
  where id = p_person_id;

  update public.visitors
  set visited_on = p_visited_on,
      contact_consent = p_contact_consent,
      contact_consent_at = case
        when p_contact_consent then coalesce(contact_consent_at, pg_catalog.now())
        else null
      end
  where id = p_visit_id and person_id = p_person_id;

  if normalized_request is null then
    delete from public.visitor_prayer_requests where visitor_id = p_visit_id;
  else
    insert into public.visitor_prayer_requests (visitor_id, request_text)
    values (p_visit_id, normalized_request)
    on conflict (visitor_id) do update
      set request_text = excluded.request_text,
          updated_at = pg_catalog.now();
  end if;
end;
$$;

create or replace function public.delete_staff_visitor(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  deleted_visits integer;
  removed_person boolean := false;
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_person_id is null then
    raise exception using errcode = '22023', message = 'Invalid visitor';
  end if;

  perform 1 from public.people where id = p_person_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Visitor not found';
  end if;

  delete from public.visitors where person_id = p_person_id;
  get diagnostics deleted_visits = row_count;
  if deleted_visits = 0 then
    raise exception using errcode = 'P0002', message = 'Visitor record not found';
  end if;

  if not exists (select 1 from public.decisions where person_id = p_person_id)
    and not exists (select 1 from public.follow_ups where person_id = p_person_id)
    and not exists (select 1 from public.event_invitations where person_id = p_person_id)
    and not exists (select 1 from public.gift_deliveries where person_id = p_person_id) then
    delete from public.people where id = p_person_id;
    removed_person := found;
  end if;

  return pg_catalog.jsonb_build_object('deleted_visits', deleted_visits, 'person_removed', removed_person);
end;
$$;

revoke all on function public.update_staff_visitor_details(uuid,uuid,text,text,date,boolean,text) from public, anon;
grant execute on function public.update_staff_visitor_details(uuid,uuid,text,text,date,boolean,text) to authenticated;
revoke all on function public.delete_staff_visitor(uuid) from public, anon;
grant execute on function public.delete_staff_visitor(uuid) to authenticated;


-- Registering a decision must not rename an existing visitor for team.
create or replace function public.register_staff_decision(
  p_full_name text,
  p_phone_normalized text,
  p_decision_type public.decision_kind,
  p_baptized boolean,
  p_interested_in_baptism boolean,
  p_accepts_messages boolean,
  p_decided_on date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  normalized_notes text := nullif(pg_catalog.btrim(p_notes), '');
  current_user_id uuid := (select auth.uid());
  person_uuid uuid;
  decision_uuid uuid;
begin
  if current_user_id is null or not public.has_any_role(array['admin', 'team']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if normalized_name is null or pg_catalog.char_length(normalized_name) not between 2 and 120
    or p_phone_normalized is null or p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$'
    or p_decision_type is null or p_baptized is null or p_interested_in_baptism is null
    or p_accepts_messages is null or p_decided_on is null
    or p_decided_on > (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
    or (normalized_notes is not null and pg_catalog.char_length(normalized_notes) > 4000) then
    raise exception using errcode = '22023', message = 'Invalid decision details';
  end if;

  insert into public.people (full_name, phone_normalized)
  values (normalized_name, p_phone_normalized)
  on conflict (phone_normalized) do update set full_name = case
    when public.has_any_role(array['admin']::public.app_role[])
      or not exists (select 1 from public.visitors v where v.person_id = people.id)
    then excluded.full_name
    else people.full_name
  end
  returning id into person_uuid;

  insert into public.decisions (
    person_id, decision_type, baptized, interested_in_baptism, accepts_messages,
    welcomed_by_user_id, decided_on, notes
  ) values (
    person_uuid, p_decision_type, p_baptized, p_interested_in_baptism, p_accepts_messages,
    current_user_id, p_decided_on, normalized_notes
  ) returning id into decision_uuid;

  insert into public.follow_ups (decision_id, person_id, status, responsible_user_id)
  values (decision_uuid, person_uuid, 'awaiting_first_contact', current_user_id);

  return decision_uuid;
end;
$$;

revoke all on function public.register_staff_decision(text, text, public.decision_kind, boolean, boolean, boolean, date, text) from public, anon;
grant execute on function public.register_staff_decision(text, text, public.decision_kind, boolean, boolean, boolean, date, text) to authenticated;


commit;
