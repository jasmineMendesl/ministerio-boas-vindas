begin;

alter table public.ministry_extra_schedules
  add column event_time time,
  add column member_ids uuid[] not null default '{}',
  add column special_observation text check (char_length(special_observation) <= 1200),
  add constraint extra_schedule_member_limit check (cardinality(member_ids) <= members_needed);

-- Changes are validated together so that only active members can be assigned.
revoke insert on public.ministry_extra_schedules from authenticated;
drop policy extra_schedules_admin_insert on public.ministry_extra_schedules;

create function public.save_extra_schedule(
  p_title text,
  p_event_date date,
  p_event_time time,
  p_members_needed integer,
  p_member_ids uuid[],
  p_special_observation text default null,
  p_schedule_id uuid default null
)
returns public.ministry_extra_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_ids uuid[];
  saved public.ministry_extra_schedules;
begin
  if auth.uid() is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select coalesce(array_agg(distinct id), '{}') into selected_ids from unnest(p_member_ids) as id;
  if p_event_time is null or cardinality(selected_ids) = 0
    or cardinality(selected_ids) > p_members_needed
    or exists (select 1 from unnest(selected_ids) as selected(member_id) where selected.member_id is null or not exists (
      select 1 from public.profiles p where p.id = selected.member_id and p.active and p.role in ('admin', 'team')
    )) then
    raise exception using errcode = '22023', message = 'Select active members and a valid time';
  end if;
  if p_schedule_id is null then
    insert into public.ministry_extra_schedules(title, event_date, event_time, members_needed, member_ids, special_observation)
    values (btrim(p_title), p_event_date, p_event_time, p_members_needed, selected_ids, nullif(btrim(p_special_observation), ''))
    returning * into saved;
  else
    update public.ministry_extra_schedules set title = btrim(p_title), event_date = p_event_date,
      event_time = p_event_time, members_needed = p_members_needed, member_ids = selected_ids,
      special_observation = nullif(btrim(p_special_observation), '')
    where id = p_schedule_id returning * into saved;
    if not found then raise exception using errcode = 'P0002', message = 'Schedule not found'; end if;
  end if;
  return saved;
end;
$$;

revoke all on function public.save_extra_schedule(text, date, time, integer, uuid[], text, uuid) from public, anon;
grant execute on function public.save_extra_schedule(text, date, time, integer, uuid[], text, uuid) to authenticated;

commit;
