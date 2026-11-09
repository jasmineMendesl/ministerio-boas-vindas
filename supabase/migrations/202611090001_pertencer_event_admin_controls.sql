begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.admin_update_pertencer_event(uuid,date,text)') is not null
    or pg_catalog.to_regprocedure('public.admin_delete_pertencer_event(uuid)') is not null then
    raise exception 'Pertencer event admin functions already exist; inspect the database before proceeding.';
  end if;
end;
$$;

create or replace function public.admin_close_pertencer_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_event public.pertencer_events%rowtype;
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_event_id is null then
    raise exception using errcode = '22023', message = 'Invalid edition';
  end if;

  select * into target_event
  from public.pertencer_events
  where id = p_event_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Edition not found';
  end if;
  if target_event.closed_at is not null then
    raise exception using errcode = '22023', message = 'Edition already closed';
  end if;

  update public.pertencer_events
  set closed_at = pg_catalog.now(),
      closed_by = current_user_id,
      updated_by = current_user_id
  where id = p_event_id;
end;
$$;

create function public.admin_update_pertencer_event(
  p_event_id uuid,
  p_event_date date,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_title text := pg_catalog.btrim(p_title);
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_event_id is null or p_event_date is null
    or normalized_title is null or pg_catalog.char_length(normalized_title) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Invalid edition details';
  end if;

  update public.pertencer_events
  set event_date = p_event_date,
      title = normalized_title,
      updated_by = current_user_id
  where id = p_event_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Edition not found';
  end if;
end;
$$;

create function public.admin_delete_pertencer_event(p_event_id uuid)
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
  if p_event_id is null then
    raise exception using errcode = '22023', message = 'Invalid edition';
  end if;

  perform 1 from public.pertencer_events where id = p_event_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Edition not found';
  end if;

  delete from public.event_invitations where event_id = p_event_id;
  delete from public.pertencer_events where id = p_event_id;
end;
$$;

revoke all on function public.admin_close_pertencer_event(uuid) from public, anon;
grant execute on function public.admin_close_pertencer_event(uuid) to authenticated;
revoke all on function public.admin_update_pertencer_event(uuid,date,text) from public, anon;
grant execute on function public.admin_update_pertencer_event(uuid,date,text) to authenticated;
revoke all on function public.admin_delete_pertencer_event(uuid) from public, anon;
grant execute on function public.admin_delete_pertencer_event(uuid) to authenticated;

commit;
