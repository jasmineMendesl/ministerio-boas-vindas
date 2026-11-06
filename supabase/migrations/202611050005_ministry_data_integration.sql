begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'decisions'
      and column_name in ('interested_in_baptism', 'accepts_messages', 'welcomed_by_user_id')
  ) then
    raise exception 'Migration stopped: one or more decision integration columns already exist; inspect the schema before proceeding.';
  end if;
  if pg_catalog.to_regclass('public.visitor_staff_notes') is not null then
    raise exception 'Migration stopped: public.visitor_staff_notes already exists; inspect the table before proceeding.';
  end if;
  if exists (select 1 from public.gift_deliveries group by person_id having count(*) > 1) then
    raise exception 'Migration stopped: duplicate gift deliveries exist for a person; reconcile before proceeding.';
  end if;
end;
$$;

create unique index gift_deliveries_one_per_person_idx on public.gift_deliveries (person_id);

alter table public.decisions
  add column interested_in_baptism boolean not null default false,
  add column accepts_messages boolean not null default false,
  add column welcomed_by_user_id uuid references public.profiles (id) on delete set null;

comment on column public.decisions.accepts_messages is
  'Explicit consent from the person to receive messages from the church.';

create table public.visitor_staff_notes (
  person_id uuid primary key references public.people (id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 1 and 4000),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.visitor_staff_notes is
  'Private internal notes for authorized welcome ministry staff; separate from public visitor submissions.';

create trigger visitor_staff_notes_created_audit
  before insert on public.visitor_staff_notes
  for each row execute function public.set_created_audit_fields();
create trigger visitor_staff_notes_updated_audit
  before update on public.visitor_staff_notes
  for each row execute function public.set_updated_audit_fields();

alter table public.visitor_staff_notes enable row level security;
revoke all on public.visitor_staff_notes from public, anon, authenticated;
grant select, insert, update, delete on public.visitor_staff_notes to authenticated;

create policy visitor_staff_notes_staff_manage on public.visitor_staff_notes
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team']::public.app_role[])));

create function public.register_staff_decision(
  p_full_name text,
  p_phone_normalized text,
  p_decision_type public.decision_kind,
  p_baptized boolean,
  p_interested_in_baptism boolean,
  p_accepts_messages boolean,
  p_decided_on date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  normalized_notes text := nullif(pg_catalog.btrim(p_notes), '');
  current_user_id uuid := (select auth.uid());
  person_uuid uuid;
  decision_uuid uuid;
begin
  if current_user_id is null or not public.has_any_role(array['admin', 'team']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if normalized_name is null or pg_catalog.char_length(normalized_name) not between 2 and 120
    or p_phone_normalized is null or p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$'
    or p_decision_type is null or p_baptized is null or p_interested_in_baptism is null
    or p_accepts_messages is null or p_decided_on is null
    or p_decided_on > (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
    or (normalized_notes is not null and pg_catalog.char_length(normalized_notes) > 4000) then
    raise exception using errcode = '22023', message = 'Invalid decision details';
  end if;

  insert into public.people (full_name, phone_normalized)
  values (normalized_name, p_phone_normalized)
  on conflict (phone_normalized) do update set full_name = excluded.full_name
  returning id into person_uuid;

  insert into public.decisions (
    person_id, decision_type, baptized, interested_in_baptism, accepts_messages,
    welcomed_by_user_id, decided_on, notes
  ) values (
    person_uuid, p_decision_type, p_baptized, p_interested_in_baptism, p_accepts_messages,
    current_user_id, p_decided_on, normalized_notes
  ) returning id into decision_uuid;

  insert into public.follow_ups (decision_id, person_id, status, responsible_user_id)
  values (decision_uuid, person_uuid, 'awaiting_first_contact', current_user_id);

  return decision_uuid;
end;
$$;

revoke all on function public.register_staff_decision(text, text, public.decision_kind, boolean, boolean, boolean, date, text) from public, anon;
grant execute on function public.register_staff_decision(text, text, public.decision_kind, boolean, boolean, boolean, date, text) to authenticated;

create function public.register_first_visit_gift(p_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  visit_count bigint;
  delivery_uuid uuid;
begin
  if current_user_id is null or not public.has_any_role(array['admin', 'team']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select count(*) into visit_count from public.visitors where person_id = p_person_id;
  if visit_count <> 1 then
    raise exception using errcode = '22023', message = 'Gift is only available for the first visit';
  end if;
  insert into public.gift_deliveries (person_id, gift_type, quantity, responsible_user_id)
    values (p_person_id, 'Lembrancinha de boas-vindas', 1, current_user_id)
    returning id into delivery_uuid;
  return delivery_uuid;
end;
$$;

revoke all on function public.register_first_visit_gift(uuid) from public, anon;
grant execute on function public.register_first_visit_gift(uuid) to authenticated;

commit;
