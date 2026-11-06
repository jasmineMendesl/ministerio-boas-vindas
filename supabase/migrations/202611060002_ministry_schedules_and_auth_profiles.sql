begin;

-- Ensure existing authenticated staff have a profile; new accounts receive one automatically.
insert into public.profiles (id, display_name, role)
select u.id,
       coalesce(nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(u.email, 'Voluntário'), '@', 1)),
       'team'
from auth.users u
on conflict (id) do nothing;

create function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role, active)
  values (
    new.id,
    coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Voluntário'), '@', 1)),
    'team',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;
drop trigger if exists sync_profile_after_auth_user_write on auth.users;
create trigger sync_profile_after_auth_user_write
  after insert or update of email on auth.users
  for each row execute function public.sync_auth_user_profile();

create function public.admin_list_volunteer_profiles()
returns table (id uuid, display_name text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.active and public.has_any_role(array['admin']::public.app_role[])
  order by p.display_name;
$$;
revoke all on function public.admin_list_volunteer_profiles() from public, anon;
grant execute on function public.admin_list_volunteer_profiles() to authenticated;

create table public.ministry_schedules (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_label text not null check (service_label in ('Domingo às 10h', 'Domingo às 18h', 'Quinta às 19h15')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint ministry_schedules_date_check check (service_date >= date '2020-01-01'),
  constraint ministry_schedules_date_service_unique unique (service_date, service_label)
);

create table public.ministry_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.ministry_schedules(id) on delete cascade,
  volunteer_profile_id uuid not null references public.profiles(id) on delete restrict,
  ministry_role text not null check (ministry_role in (
    'leader', 'support', 'confession_prayer', 'reconciliation_word',
    'seat_direction', 'opening_prayer', 'closing_prayer'
  )),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint ministry_schedule_assignment_once unique (schedule_id, volunteer_profile_id, ministry_role)
);

create index ministry_schedules_service_date_idx on public.ministry_schedules(service_date);
create index ministry_schedule_assignments_schedule_idx on public.ministry_schedule_assignments(schedule_id);
create index ministry_schedule_assignments_volunteer_idx on public.ministry_schedule_assignments(volunteer_profile_id);

create trigger ministry_schedules_created_audit
  before insert on public.ministry_schedules
  for each row execute function public.set_created_audit_fields();
create trigger ministry_schedules_updated_audit
  before update on public.ministry_schedules
  for each row execute function public.set_updated_audit_fields();
create trigger ministry_schedule_assignments_created_audit
  before insert on public.ministry_schedule_assignments
  for each row execute function public.set_created_audit_fields();

alter table public.ministry_schedules enable row level security;
alter table public.ministry_schedule_assignments enable row level security;
revoke all on public.ministry_schedules, public.ministry_schedule_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.ministry_schedules, public.ministry_schedule_assignments to authenticated;

create policy ministry_schedules_admin_manage on public.ministry_schedules
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy ministry_schedules_team_read on public.ministry_schedules
  for select to authenticated
  using ((select public.has_any_role(array['team']::public.app_role[])));
create policy ministry_schedule_assignments_admin_manage on public.ministry_schedule_assignments
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy ministry_schedule_assignments_team_read on public.ministry_schedule_assignments
  for select to authenticated
  using ((select public.has_any_role(array['team']::public.app_role[])));

comment on table public.ministry_schedules is 'Ministry volunteer schedules by service date; editable only by admin.';
comment on table public.ministry_schedule_assignments is 'Assignments allow several volunteers per role and several roles per volunteer.';
comment on function public.admin_list_volunteer_profiles() is 'Returns volunteer login emails only to active administrators for name mapping.';

commit;
