begin;

create table public.ministry_schedule_attendance (
  schedule_id uuid not null references public.ministry_schedules(id) on delete cascade,
  volunteer_profile_id uuid not null references public.profiles(id) on delete restrict,
  was_absent boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint ministry_schedule_attendance_pkey primary key (schedule_id, volunteer_profile_id)
);

create index ministry_schedule_attendance_volunteer_schedule_idx
  on public.ministry_schedule_attendance (volunteer_profile_id, schedule_id);

create trigger ministry_schedule_attendance_created_audit
  before insert on public.ministry_schedule_attendance
  for each row execute function public.set_created_audit_fields();

create trigger ministry_schedule_attendance_updated_audit
  before update on public.ministry_schedule_attendance
  for each row execute function public.set_updated_audit_fields();

alter table public.ministry_schedule_attendance enable row level security;
revoke all on public.ministry_schedule_attendance from public, anon, authenticated;
grant select, insert, update, delete on public.ministry_schedule_attendance to authenticated;

create policy ministry_schedule_attendance_admin_manage
  on public.ministry_schedule_attendance
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));

create policy ministry_schedule_attendance_team_read_published
  on public.ministry_schedule_attendance
  for select to authenticated
  using (
    (select public.has_any_role(array['team']::public.app_role[]))
    and exists (
      select 1
      from public.ministry_schedules s
      where s.id = ministry_schedule_attendance.schedule_id
        and s.published_at is not null
    )
  );

-- Every assigned volunteer starts as present (was_absent = false), including
-- assignments that already existed when this migration is applied.
insert into public.ministry_schedule_attendance (schedule_id, volunteer_profile_id)
select distinct a.schedule_id, a.volunteer_profile_id
from public.ministry_schedule_assignments a
on conflict (schedule_id, volunteer_profile_id) do nothing;

create function public.sync_ministry_schedule_attendance_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ministry_schedule_attendance (schedule_id, volunteer_profile_id)
    values (new.schedule_id, new.volunteer_profile_id)
    on conflict (schedule_id, volunteer_profile_id) do nothing;
    return new;
  end if;

  if not exists (
    select 1
    from public.ministry_schedule_assignments a
    where a.schedule_id = old.schedule_id
      and a.volunteer_profile_id = old.volunteer_profile_id
  ) then
    delete from public.ministry_schedule_attendance
    where schedule_id = old.schedule_id
      and volunteer_profile_id = old.volunteer_profile_id;
  end if;

  return old;
end;
$$;

revoke all on function public.sync_ministry_schedule_attendance_assignment() from public, anon, authenticated;

create trigger ministry_schedule_attendance_assignment_sync
  after insert or delete on public.ministry_schedule_assignments
  for each row execute function public.sync_ministry_schedule_attendance_assignment();

comment on table public.ministry_schedule_attendance is
  'One boolean absence record per volunteer and service. Absence is false (present) unless an admin marks the volunteer absent.';

commit;
