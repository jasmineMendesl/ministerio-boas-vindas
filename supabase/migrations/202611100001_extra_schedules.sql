begin;

create table public.ministry_extra_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  event_date date not null check (event_date >= date '2020-01-01'),
  members_needed integer not null check (members_needed between 1 and 1000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create index ministry_extra_schedules_date_idx on public.ministry_extra_schedules(event_date);
create trigger ministry_extra_schedules_created_audit
  before insert on public.ministry_extra_schedules
  for each row execute function public.set_created_audit_fields();

alter table public.ministry_extra_schedules enable row level security;
revoke all on public.ministry_extra_schedules from public, anon, authenticated;
grant select, insert on public.ministry_extra_schedules to authenticated;
grant all on public.ministry_extra_schedules to service_role;

create policy extra_schedules_staff_read on public.ministry_extra_schedules
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy extra_schedules_admin_insert on public.ministry_extra_schedules
  for insert to authenticated
  with check ((select public.has_any_role(array['admin']::public.app_role[])));

commit;
