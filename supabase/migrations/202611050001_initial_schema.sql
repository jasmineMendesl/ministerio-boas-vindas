begin;

-- Fail closed if an object with one of the planned public table names already
-- exists. This prevents accidentally adopting or duplicating an old schema.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'people', 'visitors', 'decisions', 'follow_ups', 'follow_up_history',
    'pertencer_events', 'event_invitations', 'gift_deliveries', 'profiles',
    'public_visitor_rate_limits'
  ] loop
    if pg_catalog.to_regclass(pg_catalog.format('%I.%I', 'public', table_name)) is not null then
      raise exception 'Migration stopped: public.% already exists; inspect the existing schema before proceeding.', table_name;
    end if;
  end loop;

  if pg_catalog.to_regtype('public.app_role') is not null
    or pg_catalog.to_regtype('public.decision_kind') is not null
    or pg_catalog.to_regtype('public.follow_up_status') is not null
    or pg_catalog.to_regtype('public.invitation_attendance') is not null then
    raise exception 'Migration stopped: one or more Projeto Pertencer types already exist.';
  end if;
end;
$$;

create type public.app_role as enum ('admin', 'team', 'pastoral');
create type public.decision_kind as enum ('acceptance', 'reconciliation');
create type public.follow_up_status as enum (
  'awaiting_first_contact',
  'contact_made',
  'awaiting_response',
  'responded',
  'invited',
  'awaiting_confirmation',
  'confirmed',
  'attended',
  'no_show',
  'declined',
  'unable_to_contact'
);
create type public.invitation_attendance as enum ('pending', 'confirmed', 'present', 'absent');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  role public.app_role not null default 'team',
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone_normalized text not null unique check (phone_normalized ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  source text not null default 'qr' check (source in ('qr', 'staff')),
  registered_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  decision_type public.decision_kind not null,
  baptized boolean not null,
  decided_on date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (id, person_id)
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null,
  person_id uuid not null references public.people (id) on delete restrict,
  status public.follow_up_status not null default 'awaiting_first_contact',
  contact_date timestamptz,
  responded boolean,
  invited_at timestamptz,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (id, person_id),
  unique (decision_id),
  foreign key (decision_id, person_id)
    references public.decisions (id, person_id) on delete cascade
);

create table public.follow_up_history (
  id uuid primary key default gen_random_uuid(),
  follow_up_id uuid not null references public.follow_ups (id) on delete cascade,
  old_status public.follow_up_status,
  new_status public.follow_up_status not null,
  observations text check (observations is null or char_length(observations) <= 4000),
  changed_at timestamptz not null default pg_catalog.now(),
  changed_by uuid references auth.users (id) on delete set null
);

create table public.pertencer_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null unique,
  title text not null default 'Projeto Pertencer' check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pertencer_events (id) on delete restrict,
  person_id uuid not null references public.people (id) on delete restrict,
  follow_up_id uuid not null,
  attendance public.invitation_attendance not null default 'pending',
  invited_at timestamptz not null default pg_catalog.now(),
  confirmed_at timestamptz,
  attendance_recorded_at timestamptz,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (event_id, person_id),
  foreign key (follow_up_id, person_id)
    references public.follow_ups (id, person_id) on delete cascade,
  check ((attendance = 'confirmed' and confirmed_at is not null)
      or attendance <> 'confirmed'),
  check ((attendance in ('present', 'absent') and attendance_recorded_at is not null)
      or attendance not in ('present', 'absent'))
);

create table public.gift_deliveries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  delivered_at timestamptz not null default pg_catalog.now(),
  gift_type text not null check (char_length(btrim(gift_type)) between 1 and 120),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  responsible_user_id uuid not null references public.profiles (id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null
);

-- Stores only an HMAC digest of the caller IP, never the raw address.
create table public.public_visitor_rate_limits (
  ip_digest text primary key check (ip_digest ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

create index people_name_lower_idx on public.people (lower(full_name));
create index visitors_registered_at_idx on public.visitors (registered_at desc);
create index visitors_person_registered_idx on public.visitors (person_id, registered_at desc);
create index decisions_decided_on_idx on public.decisions (decided_on desc);
create index decisions_person_decided_idx on public.decisions (person_id, decided_on desc);
create index follow_ups_status_updated_idx on public.follow_ups (status, updated_at);
create index follow_ups_responsible_idx on public.follow_ups (responsible_user_id);
create index follow_up_history_timeline_idx on public.follow_up_history (follow_up_id, changed_at desc);
create index event_invitations_event_attendance_idx on public.event_invitations (event_id, attendance);
create index gift_deliveries_month_idx on public.gift_deliveries (delivered_at desc);
create index gift_deliveries_person_idx on public.gift_deliveries (person_id, delivered_at desc);

comment on table public.decisions is 'Sensitive personal data about religious decisions. Access restricted to admin and pastoral profiles.';
comment on table public.follow_ups is 'Sensitive follow-up data linked to religious decisions. Access restricted to admin and pastoral profiles.';
comment on table public.public_visitor_rate_limits is 'Private anti-abuse counters keyed by HMAC digest; raw IP addresses are not stored.';

create function public.set_created_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := pg_catalog.now();
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create function public.set_updated_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create function public.log_follow_up_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.follow_up_history (follow_up_id, old_status, new_status, observations, changed_at, changed_by)
    values (new.id, null, new.status, new.notes, pg_catalog.now(), (select auth.uid()));
  elsif new.status is distinct from old.status then
    insert into public.follow_up_history (follow_up_id, old_status, new_status, observations, changed_at, changed_by)
    values (new.id, old.status, new.status, new.notes, pg_catalog.now(), (select auth.uid()));
  end if;
  return new;
end;
$$;

create function public.has_any_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.active
      and p.role = any (allowed_roles)
  );
$$;

create function public.consume_public_visitor_rate_limit(p_ip_digest text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if p_ip_digest is null or p_ip_digest !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  delete from public.public_visitor_rate_limits
  where window_started_at < pg_catalog.now() - interval '2 days';

  insert into public.public_visitor_rate_limits (ip_digest, window_started_at, request_count)
  values (p_ip_digest, pg_catalog.now(), 1)
  on conflict (ip_digest) do update
  set window_started_at = case
        when public.public_visitor_rate_limits.window_started_at <= pg_catalog.now() - interval '1 hour'
          then pg_catalog.now()
        else public.public_visitor_rate_limits.window_started_at
      end,
      request_count = case
        when public.public_visitor_rate_limits.window_started_at <= pg_catalog.now() - interval '1 hour'
          then 1
        else public.public_visitor_rate_limits.request_count + 1
      end
  returning request_count into current_count;

  return current_count <= 30;
end;
$$;

create function public.register_public_visitor(p_full_name text, p_phone_normalized text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  person_uuid uuid;
begin
  if normalized_name is null or pg_catalog.char_length(normalized_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Invalid visitor details';
  end if;

  if p_phone_normalized is null or p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'Invalid visitor details';
  end if;

  insert into public.people (full_name, phone_normalized)
  values (normalized_name, p_phone_normalized)
  on conflict (phone_normalized) do nothing;

  select p.id into person_uuid
  from public.people as p
  where p.phone_normalized = p_phone_normalized
  for update;

  if not exists (
    select 1 from public.visitors as v
    where v.person_id = person_uuid
      and v.registered_at >= pg_catalog.now() - interval '15 minutes'
  ) then
    insert into public.visitors (person_id, source) values (person_uuid, 'qr');
  end if;
end;
$$;

create trigger profiles_created_audit before insert on public.profiles
  for each row execute function public.set_created_audit_fields();
create trigger profiles_updated_audit before update on public.profiles
  for each row execute function public.set_updated_audit_fields();
create trigger people_created_audit before insert on public.people
  for each row execute function public.set_created_audit_fields();
create trigger people_updated_audit before update on public.people
  for each row execute function public.set_updated_audit_fields();
create trigger visitors_created_audit before insert on public.visitors
  for each row execute function public.set_created_audit_fields();
create trigger decisions_created_audit before insert on public.decisions
  for each row execute function public.set_created_audit_fields();
create trigger decisions_updated_audit before update on public.decisions
  for each row execute function public.set_updated_audit_fields();
create trigger follow_ups_created_audit before insert on public.follow_ups
  for each row execute function public.set_created_audit_fields();
create trigger follow_ups_updated_audit before update on public.follow_ups
  for each row execute function public.set_updated_audit_fields();
create trigger follow_ups_status_history after insert or update of status on public.follow_ups
  for each row execute function public.log_follow_up_status_change();
create trigger pertencer_events_created_audit before insert on public.pertencer_events
  for each row execute function public.set_created_audit_fields();
create trigger pertencer_events_updated_audit before update on public.pertencer_events
  for each row execute function public.set_updated_audit_fields();
create trigger event_invitations_created_audit before insert on public.event_invitations
  for each row execute function public.set_created_audit_fields();
create trigger event_invitations_updated_audit before update on public.event_invitations
  for each row execute function public.set_updated_audit_fields();
create trigger gift_deliveries_created_audit before insert on public.gift_deliveries
  for each row execute function public.set_created_audit_fields();

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.visitors enable row level security;
alter table public.decisions enable row level security;
alter table public.follow_ups enable row level security;
alter table public.follow_up_history enable row level security;
alter table public.pertencer_events enable row level security;
alter table public.event_invitations enable row level security;
alter table public.gift_deliveries enable row level security;
alter table public.public_visitor_rate_limits enable row level security;

-- No anonymous table access. Authenticated grants are constrained by the policies below.
revoke all on public.profiles, public.people, public.visitors, public.decisions,
  public.follow_ups, public.follow_up_history, public.pertencer_events,
  public.event_invitations, public.gift_deliveries, public.public_visitor_rate_limits
  from public, anon, authenticated;
grant select, insert, update, delete on public.profiles, public.people, public.visitors,
  public.decisions, public.follow_ups, public.follow_up_history, public.pertencer_events,
  public.event_invitations, public.gift_deliveries to authenticated;
revoke insert, update, delete on public.follow_up_history from authenticated;

revoke all on function public.set_created_audit_fields() from public, anon, authenticated;
revoke all on function public.set_updated_audit_fields() from public, anon, authenticated;
revoke all on function public.log_follow_up_status_change() from public, anon, authenticated;
revoke all on function public.has_any_role(public.app_role[]) from public, anon;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;
revoke all on function public.consume_public_visitor_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_public_visitor_rate_limit(text) to service_role;
revoke all on function public.register_public_visitor(text, text) from public, anon, authenticated;
grant execute on function public.register_public_visitor(text, text) to service_role;

create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.has_any_role(array['admin']::public.app_role[])));
create policy profiles_admin_manage on public.profiles
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));

create policy people_admin_pastoral_manage on public.people
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])));
create policy people_team_read_visitor_people on public.people
  for select to authenticated
  using (
    (select public.has_any_role(array['team']::public.app_role[]))
    and exists (select 1 from public.visitors v where v.person_id = people.id)
  );
create policy people_team_insert on public.people
  for insert to authenticated
  with check ((select public.has_any_role(array['team']::public.app_role[])));
create policy people_team_update_visitor_people on public.people
  for update to authenticated
  using (
    (select public.has_any_role(array['team']::public.app_role[]))
    and exists (select 1 from public.visitors v where v.person_id = people.id)
  )
  with check (
    (select public.has_any_role(array['team']::public.app_role[]))
    and exists (select 1 from public.visitors v where v.person_id = people.id)
  );
create policy people_team_delete_visitor_people on public.people
  for delete to authenticated
  using (
    (select public.has_any_role(array['team']::public.app_role[]))
    and exists (select 1 from public.visitors v where v.person_id = people.id)
  );
create policy visitors_staff_manage on public.visitors
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team', 'pastoral']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team', 'pastoral']::public.app_role[])));

create policy decisions_pastoral_manage on public.decisions
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])));
create policy follow_ups_pastoral_manage on public.follow_ups
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])));
create policy follow_up_history_pastoral_read on public.follow_up_history
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])));

create policy pertencer_events_staff_manage on public.pertencer_events
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team', 'pastoral']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team', 'pastoral']::public.app_role[])));
create policy event_invitations_pastoral_manage on public.event_invitations
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])));
create policy gift_deliveries_staff_manage on public.gift_deliveries
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team', 'pastoral']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team', 'pastoral']::public.app_role[])));

commit;
