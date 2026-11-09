begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.admin_update_staff_decision(uuid,text,text,public.decision_kind,boolean,boolean,date,text)') is not null
    or pg_catalog.to_regprocedure('public.admin_delete_staff_decision(uuid)') is not null then
    raise exception 'Admin decision functions already exist; inspect the database before applying this migration.';
  end if;
end;
$$;

drop policy if exists decisions_staff_manage on public.decisions;
drop policy if exists decisions_pastoral_manage on public.decisions;

create policy decisions_staff_read on public.decisions
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])));

create policy decisions_admin_manage on public.decisions
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));

create function public.admin_update_staff_decision(
  p_decision_id uuid,
  p_full_name text,
  p_phone_normalized text,
  p_decision_type public.decision_kind,
  p_baptized boolean,
  p_accepts_messages boolean,
  p_decided_on date,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  normalized_notes text := nullif(pg_catalog.btrim(p_notes), '');
  person_uuid uuid;
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  if p_decision_id is null
    or normalized_name is null or pg_catalog.char_length(normalized_name) not between 2 and 120
    or p_phone_normalized is null or p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$'
    or p_decision_type is null or p_baptized is null or p_accepts_messages is null
    or p_decided_on is null
    or p_decided_on > (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
    or (normalized_notes is not null and pg_catalog.char_length(normalized_notes) > 4000) then
    raise exception using errcode = '22023', message = 'Invalid decision details';
  end if;

  select d.person_id into person_uuid
  from public.decisions d
  where d.id = p_decision_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Decision not found';
  end if;

  update public.people
  set full_name = normalized_name,
      phone_normalized = p_phone_normalized,
      updated_by = current_user_id
  where id = person_uuid;

  update public.decisions
  set decision_type = p_decision_type,
      baptized = p_baptized,
      accepts_messages = p_accepts_messages,
      decided_on = p_decided_on,
      notes = normalized_notes,
      updated_by = current_user_id
  where id = p_decision_id;
end;
$$;

create function public.admin_delete_staff_decision(p_decision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_decision_id is null then
    raise exception using errcode = '22023', message = 'Invalid decision';
  end if;

  delete from public.decisions where id = p_decision_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Decision not found';
  end if;
end;
$$;

revoke all on function public.admin_update_staff_decision(uuid,text,text,public.decision_kind,boolean,boolean,date,text) from public, anon;
grant execute on function public.admin_update_staff_decision(uuid,text,text,public.decision_kind,boolean,boolean,date,text) to authenticated;
revoke all on function public.admin_delete_staff_decision(uuid) from public, anon;
grant execute on function public.admin_delete_staff_decision(uuid) to authenticated;

commit;
