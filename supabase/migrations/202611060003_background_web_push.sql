begin;

alter table public.ministry_schedules
  add column published_at timestamptz,
  add column published_by uuid references public.profiles(id) on delete set null;

-- Existing schedules were already visible to staff before the publish workflow existed.
update public.ministry_schedules
set published_at = coalesce(updated_at, created_at, now()),
    published_by = coalesce(updated_by, created_by)
where published_at is null;

drop policy ministry_schedules_team_read on public.ministry_schedules;
create policy ministry_schedules_team_read on public.ministry_schedules
  for select to authenticated
  using (
    (select public.has_any_role(array['team']::public.app_role[]))
    and published_at is not null
  );

drop policy ministry_schedule_assignments_team_read on public.ministry_schedule_assignments;
create policy ministry_schedule_assignments_team_read on public.ministry_schedule_assignments
  for select to authenticated
  using (
    (select public.has_any_role(array['team']::public.app_role[]))
    and exists (
      select 1 from public.ministry_schedules s
      where s.id = schedule_id and s.published_at is not null
    )
  );

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 4096),
  p256dh text not null check (char_length(p256dh) between 1 and 256),
  auth text not null check (char_length(auth) between 1 and 256),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create trigger push_subscriptions_created_audit
  before insert on public.push_subscriptions
  for each row execute function public.set_created_audit_fields();
create trigger push_subscriptions_updated_audit
  before update on public.push_subscriptions
  for each row execute function public.set_updated_audit_fields();

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy push_subscriptions_own_read on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_own_update on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.push_subscriptions is 'Private Web Push endpoints owned by each authenticated user; service role reads them for delivery.';
comment on column public.ministry_schedules.published_at is 'Null while draft; team users can only read schedules after publication.';

commit;
