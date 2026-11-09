begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pertencer_events' and column_name = 'closed_at'
  ) or pg_catalog.to_regprocedure('public.admin_close_pertencer_event(uuid)') is not null then
    raise exception 'Pertencer edition closing schema already exists; inspect the database before proceeding.';
  end if;
end;
$$;

alter table public.pertencer_events
  add column closed_at timestamptz,
  add column closed_by uuid references auth.users (id) on delete set null;

create function public.admin_close_pertencer_event(p_event_id uuid)
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
  if target_event.event_date > (pg_catalog.now() at time zone 'America/Sao_Paulo')::date then
    raise exception using errcode = '22023', message = 'Cannot close a future edition';
  end if;

  update public.pertencer_events
  set closed_at = pg_catalog.now(),
      closed_by = current_user_id,
      updated_by = current_user_id
  where id = p_event_id;
end;
$$;

create or replace function public.invite_new_follow_up_to_upcoming_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_event_id uuid;
begin
  select e.id into next_event_id
  from public.pertencer_events e
  where e.event_date >= (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
    and e.closed_at is null
  order by e.event_date
  limit 1;

  if next_event_id is not null then
    insert into public.event_invitations (event_id, person_id, follow_up_id, attendance)
    values (next_event_id, new.person_id, new.id, 'pending')
    on conflict (event_id, person_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.admin_close_pertencer_event(uuid) from public, anon;
grant execute on function public.admin_close_pertencer_event(uuid) to authenticated;

commit;
