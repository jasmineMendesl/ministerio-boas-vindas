begin;

create function public.register_staff_visitor_details(
  p_full_name text,
  p_phone_normalized text,
  p_visited_on date,
  p_contact_consent boolean,
  p_prayer_request text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := pg_catalog.btrim(pg_catalog.regexp_replace(p_full_name, '\s+', ' ', 'g'));
  normalized_request text := nullif(pg_catalog.btrim(p_prayer_request), '');
  person_uuid uuid;
  visitor_uuid uuid;
begin
  if current_user_id is null or not public.has_any_role(array['admin', 'team']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;

  if normalized_name is null or pg_catalog.char_length(normalized_name) not between 2 and 120
    or p_phone_normalized is null or p_phone_normalized !~ '^\+[1-9][0-9]{7,14}$'
    or p_visited_on is null
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

  insert into public.visitors (
    person_id, source, visited_on, contact_consent, contact_consent_at
  ) values (
    person_uuid, 'staff', p_visited_on, p_contact_consent,
    case when p_contact_consent then pg_catalog.now() else null end
  ) returning id into visitor_uuid;

  if normalized_request is not null then
    insert into public.visitor_prayer_requests (visitor_id, request_text)
    values (visitor_uuid, normalized_request);
  end if;

  return visitor_uuid;
end;
$$;

revoke all on function public.register_staff_visitor_details(text, text, date, boolean, text) from public, anon;
grant execute on function public.register_staff_visitor_details(text, text, date, boolean, text) to authenticated;

commit;
