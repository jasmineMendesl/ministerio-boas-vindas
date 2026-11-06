begin;

do $$
begin
  if pg_catalog.to_regclass('public.pertencer_volunteers') is not null
    or pg_catalog.to_regclass('public.pertencer_agenda_items') is not null then
    raise exception 'Migration stopped: Projeto Pertencer volunteer or agenda tables already exist; inspect the schema before proceeding.';
  end if;
end;
$$;

create table public.pertencer_volunteers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null
);

create unique index pertencer_volunteers_active_name_idx
  on public.pertencer_volunteers (pg_catalog.lower(pg_catalog.btrim(display_name)))
  where active;

create table public.pertencer_agenda_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pertencer_events (id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 7),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  volunteer_id uuid references public.pertencer_volunteers (id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (event_id, sequence),
  unique (event_id, title)
);

create index pertencer_agenda_items_volunteer_idx on public.pertencer_agenda_items (volunteer_id);

create trigger pertencer_volunteers_created_audit
  before insert on public.pertencer_volunteers
  for each row execute function public.set_created_audit_fields();
create trigger pertencer_volunteers_updated_audit
  before update on public.pertencer_volunteers
  for each row execute function public.set_updated_audit_fields();
create trigger pertencer_agenda_items_created_audit
  before insert on public.pertencer_agenda_items
  for each row execute function public.set_created_audit_fields();
create trigger pertencer_agenda_items_updated_audit
  before update on public.pertencer_agenda_items
  for each row execute function public.set_updated_audit_fields();

alter table public.pertencer_volunteers enable row level security;
alter table public.pertencer_agenda_items enable row level security;
revoke all on public.pertencer_volunteers, public.pertencer_agenda_items from public, anon, authenticated;
grant select, insert, update, delete on public.pertencer_volunteers, public.pertencer_agenda_items to authenticated;

create policy pertencer_volunteers_admin_manage on public.pertencer_volunteers
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy pertencer_volunteers_team_read on public.pertencer_volunteers
  for select to authenticated
  using ((select public.has_any_role(array['team']::public.app_role[])));

create policy pertencer_agenda_items_admin_manage on public.pertencer_agenda_items
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy pertencer_agenda_items_team_read on public.pertencer_agenda_items
  for select to authenticated
  using ((select public.has_any_role(array['team']::public.app_role[])));

comment on table public.pertencer_volunteers is 'Authorized catalog of volunteers who serve Project Pertencer editions.';
comment on table public.pertencer_agenda_items is 'Seven standard agenda items and assigned volunteers for each Project Pertencer event.';

commit;
