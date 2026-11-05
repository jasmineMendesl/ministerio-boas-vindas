begin;

-- Stop safely if this migration was partially applied outside the migration history.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visitors'
      and column_name in ('visited_on', 'contact_consent', 'contact_consent_at')
  ) then
    raise exception 'Migration stopped: visitor details columns already exist; inspect the schema before proceeding.';
  end if;

  if pg_catalog.to_regclass('public.visitor_prayer_requests') is not null then
    raise exception 'Migration stopped: public.visitor_prayer_requests already exists; inspect the table before proceeding.';
  end if;

  if pg_catalog.to_regprocedure('public.register_public_visitor_details(text,text,date,boolean,text)') is not null then
    raise exception 'Migration stopped: public.register_public_visitor_details already exists.';
  end if;
end;
$$;

alter table public.visitors
  add column visited_on date,
  add column contact_consent boolean not null default false,
  add column contact_consent_at timestamptz,
  add constraint visitors_contact_consent_timestamp_check
    check ((contact_consent and contact_consent_at is not null) or (not contact_consent and contact_consent_at is null));

update public.visitors
set visited_on = (registered_at at time zone 'America/Sao_Paulo')::date;

alter table public.visitors
  alter column visited_on set default current_date,
  alter column visited_on set not null;

-- Prayer requests are sensitive and are separated from the visitor list so the
-- regular team role cannot read them through the existing visitors policy.
create table public.visitor_prayer_requests (
  visitor_id uuid primary key references public.visitors (id) on delete cascade,
  request_text text not null check (char_length(btrim(request_text)) between 1 and 2000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index visitors_visited_on_idx on public.visitors (visited_on desc);
create index visitor_prayer_requests_updated_idx on public.visitor_prayer_requests (updated_at desc);

alter table public.visitor_prayer_requests enable row level security;
revoke all on public.visitor_prayer_requests from public, anon, authenticated;
grant select on public.visitor_prayer_requests to authenticated;

create policy visitor_prayer_requests_pastoral_read on public.visitor_prayer_requests
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'pastoral']::public.app_role[])));

create function public.register_public_visitor_details(
  p_full_name text,
  p_phone_normalized text,
  p_visited_on date,
  p_contact_consent boolean,
  p_prayer_request text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  normalized_request text := nullif(pg_catalog.btrim(p_prayer_request), '');
  person_uuid uuid;
  visitor_uuid uuid;
begin
  if normalized_name is null or pg_catalog.char_length(normalized_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Invalid visitor details';
  end if;

  if p_phone_normalized is null or p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'Invalid visitor details';
  end if;

  if p_visited_on is null
    or p_visited_on > (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
    or p_contact_consent is null
    or (normalized_request is not null and pg_catalog.char_length(normalized_request) > 2000) then
    raise exception using errcode = '22023', message = 'Invalid visitor details';
  end if;

  insert into public.people (full_name, phone_normalized)
  values (normalized_name, p_phone_normalized)
  on conflict (phone_normalized) do nothing;

  select p.id into person_uuid
  from public.people as p
  where p.phone_normalized = p_phone_normalized
  for update;

  select v.id into visitor_uuid
  from public.visitors as v
  where v.person_id = person_uuid
    and v.source = 'qr'
    and v.registered_at >= pg_catalog.now() - interval '15 minutes'
  order by v.registered_at desc
  limit 1
  for update;

  if visitor_uuid is null then
    insert into public.visitors (
      person_id, source, visited_on, contact_consent, contact_consent_at
    ) values (
      person_uuid,
      'qr',
      p_visited_on,
      p_contact_consent,
      case when p_contact_consent then pg_catalog.now() else null end
    ) returning id into visitor_uuid;
  else
    update public.visitors
    set visited_on = p_visited_on,
        contact_consent = p_contact_consent,
        contact_consent_at = case
          when p_contact_consent then coalesce(contact_consent_at, pg_catalog.now())
          else null
        end
    where id = visitor_uuid;
  end if;

  if normalized_request is not null then
    insert into public.visitor_prayer_requests (visitor_id, request_text)
    values (visitor_uuid, normalized_request)
    on conflict (visitor_id) do update
      set request_text = excluded.request_text,
          updated_at = pg_catalog.now();
  end if;
end;
$$;

comment on table public.visitor_prayer_requests is 'Sensitive prayer requests; readable only by admin and pastoral roles.';
comment on column public.visitors.contact_consent is 'Whether this visitor explicitly agreed to receive a follow-up message.';
comment on column public.visitors.contact_consent_at is 'Timestamp when contact consent was first recorded for the current consent state.';

revoke all on function public.register_public_visitor_details(text, text, date, boolean, text) from public, anon, authenticated;
grant execute on function public.register_public_visitor_details(text, text, date, boolean, text) to service_role;

commit;
