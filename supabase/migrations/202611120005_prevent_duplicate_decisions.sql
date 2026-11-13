begin;

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

  -- The people upsert holds a row lock until commit, serializing registrations
  -- for this phone even when separate clients submit at the same time.
  if exists (
    select 1 from public.decisions d
    where d.person_id = person_uuid
      and d.decision_type = p_decision_type
      and d.decided_on = p_decided_on
  ) then
    raise exception using errcode = '23505', message = 'Decision already registered for this person, type and date';
  end if;

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
