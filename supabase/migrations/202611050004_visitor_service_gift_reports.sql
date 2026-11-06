begin;

do $$
begin
  if pg_catalog.to_regclass('public.visitor_service_gift_reports') is not null then
    raise exception 'Migration stopped: public.visitor_service_gift_reports already exists; inspect the table before proceeding.';
  end if;
end;
$$;

create table public.visitor_service_gift_reports (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_label text not null check (char_length(btrim(service_label)) between 2 and 100),
  gifts_delivered integer not null check (gifts_delivered between 0 and 1000),
  responsible_user_id uuid not null references public.profiles (id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (service_date, service_label)
);

create index visitor_service_gift_reports_date_idx
  on public.visitor_service_gift_reports (service_date desc);

comment on table public.visitor_service_gift_reports is
  'Per-service count of welcome gifts reported by the serving team leader; separate from per-person gift deliveries.';

create trigger visitor_service_gift_reports_created_audit
  before insert on public.visitor_service_gift_reports
  for each row execute function public.set_created_audit_fields();
create trigger visitor_service_gift_reports_updated_audit
  before update on public.visitor_service_gift_reports
  for each row execute function public.set_updated_audit_fields();

alter table public.visitor_service_gift_reports enable row level security;
revoke all on public.visitor_service_gift_reports from public, anon, authenticated;
grant select, insert, update, delete on public.visitor_service_gift_reports to authenticated;

create policy visitor_gift_reports_admin_manage on public.visitor_service_gift_reports
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy visitor_gift_reports_team_read on public.visitor_service_gift_reports
  for select to authenticated
  using ((select public.has_any_role(array['team']::public.app_role[])));
create policy visitor_gift_reports_team_insert_as_self on public.visitor_service_gift_reports
  for insert to authenticated
  with check (
    (select public.has_any_role(array['team']::public.app_role[]))
    and responsible_user_id = (select auth.uid())
  );
create policy visitor_gift_reports_team_update_own on public.visitor_service_gift_reports
  for update to authenticated
  using (
    (select public.has_any_role(array['team']::public.app_role[]))
    and responsible_user_id = (select auth.uid())
  )
  with check (
    (select public.has_any_role(array['team']::public.app_role[]))
    and responsible_user_id = (select auth.uid())
  );

commit;
