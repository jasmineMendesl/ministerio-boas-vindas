begin;

alter table public.ministry_schedule_assignments
  drop constraint ministry_schedule_assignments_ministry_role_check;
drop trigger ministry_schedule_role_assignment_guard on public.ministry_schedule_assignments;
drop index public.ministry_schedule_one_primary_role_per_volunteer;

update public.ministry_schedule_assignments
set ministry_role = 'portaria'
where ministry_role in ('portaria_01', 'portaria_02');

alter table public.ministry_schedule_assignments
  add constraint ministry_schedule_assignments_ministry_role_check
  check (ministry_role in (
    'portaria', 'seat_direction',
    'leader', 'support', 'media', 'opening_prayer',
    'male_welcoming', 'female_welcoming', 'equipment_check', 'app_closing',
    'confession_prayer', 'reconciliation_word', 'closing_prayer'
  ));

create unique index ministry_schedule_one_primary_role_per_volunteer
  on public.ministry_schedule_assignments (schedule_id, volunteer_profile_id)
  where ministry_role in ('portaria', 'seat_direction');

create or replace function public.enforce_ministry_schedule_role_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  portaria_count integer;
begin
  if tg_op = 'DELETE' then
    if old.ministry_role in ('portaria', 'seat_direction')
      and exists (
        select 1 from public.ministry_schedule_assignments a
        where a.schedule_id = old.schedule_id
          and a.volunteer_profile_id = old.volunteer_profile_id
          and a.id <> old.id
          and a.ministry_role in ('leader', 'support', 'media', 'opening_prayer', 'male_welcoming', 'female_welcoming', 'equipment_check', 'app_closing')
      ) then
      raise exception using errcode = '23514', message = 'Remove complementary responsibilities before removing the primary role';
    end if;
    return old;
  end if;

  if new.ministry_role in ('portaria', 'seat_direction') then
    perform 1 from public.ministry_schedules where id = new.schedule_id for update;
    if not found then
      raise exception using errcode = '23503', message = 'Schedule not found';
    end if;
    if new.ministry_role = 'portaria' then
      select pg_catalog.count(*) into portaria_count
      from public.ministry_schedule_assignments a
      where a.schedule_id = new.schedule_id
        and a.ministry_role = 'portaria'
        and (tg_op <> 'UPDATE' or a.id <> new.id);
      if portaria_count >= 4 then
        raise exception using errcode = '23514', message = 'Portaria allows at most four volunteers per schedule';
      end if;
    end if;
  end if;

  if new.ministry_role in ('leader', 'support', 'media', 'opening_prayer', 'male_welcoming', 'female_welcoming', 'equipment_check', 'app_closing')
    and not exists (
      select 1 from public.ministry_schedule_assignments a
      where a.schedule_id = new.schedule_id
        and a.volunteer_profile_id = new.volunteer_profile_id
        and a.ministry_role in ('portaria', 'seat_direction')
        and (tg_op <> 'UPDATE' or a.id <> new.id)
    ) then
    raise exception using errcode = '23514', message = 'A complementary responsibility requires a primary role';
  end if;

  if tg_op = 'UPDATE'
    and old.ministry_role in ('portaria', 'seat_direction')
    and (new.schedule_id <> old.schedule_id or new.volunteer_profile_id <> old.volunteer_profile_id or new.ministry_role not in ('portaria', 'seat_direction'))
    and exists (
      select 1 from public.ministry_schedule_assignments a
      where a.schedule_id = old.schedule_id
        and a.volunteer_profile_id = old.volunteer_profile_id
        and a.id <> old.id
        and a.ministry_role in ('leader', 'support', 'media', 'opening_prayer', 'male_welcoming', 'female_welcoming', 'equipment_check', 'app_closing')
    ) then
    raise exception using errcode = '23514', message = 'Remove complementary responsibilities before changing the primary role';
  end if;

  return new;
end;
$$;

create trigger ministry_schedule_role_assignment_guard
  before insert or update or delete on public.ministry_schedule_assignments
  for each row execute function public.enforce_ministry_schedule_role_assignment();

revoke all on function public.enforce_ministry_schedule_role_assignment() from public, anon, authenticated;
comment on column public.ministry_schedule_assignments.ministry_role is
  'Primary roles: portaria (maximum 4 volunteers), seat_direction. Complementary roles can be accumulated.';

commit;
