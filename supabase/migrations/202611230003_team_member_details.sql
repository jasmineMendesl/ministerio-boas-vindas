begin;

create table public.team_member_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (phone ~ '^\+?[0-9]{8,15}$'),
  birth_date date,
  service_start_date date,
  check (service_start_date >= birth_date)
);

alter table public.team_member_details enable row level security;
revoke all on public.team_member_details from public, anon, authenticated;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration jsonb := new.raw_user_meta_data -> 'team_registration';
begin
  insert into public.profiles (id, display_name, role, active)
  values (
    new.id,
    coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''), pg_catalog.split_part(coalesce(new.email, 'Voluntário'), '@', 1)),
    'team',
    true
  )
  on conflict (id) do nothing;

  if tg_op = 'INSERT' and new.raw_app_meta_data ->> 'team_registration' = 'true'
    and registration is not null then
    insert into public.team_member_details (profile_id, phone, birth_date, service_start_date)
    values (new.id, registration ->> 'phone', (registration ->> 'birth_date')::date, (registration ->> 'service_start_date')::date);

    update auth.users
    set raw_user_meta_data = raw_user_meta_data - 'team_registration',
        raw_app_meta_data = raw_app_meta_data - 'team_registration'
    where id = new.id;
  end if;

  return new;
end;
$$;

create function public.admin_list_team_members()
returns table (id uuid, display_name text, email text, phone text, birth_date date, service_start_date date, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, u.email::text, d.phone, d.birth_date, d.service_start_date, p.active
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.team_member_details d on d.profile_id = p.id
  where public.has_any_role(array['admin']::public.app_role[])
  order by p.display_name, p.id;
$$;

create function public.admin_update_team_member_details(
  p_id uuid, p_display_name text, p_phone text, p_birth_date date, p_service_start_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_display_name is null or p_birth_date > today or p_service_start_date > today then
    raise exception using errcode = '22023', message = 'Invalid team member details';
  end if;

  update public.profiles set display_name = pg_catalog.btrim(p_display_name) where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  insert into public.team_member_details (profile_id, phone, birth_date, service_start_date)
  values (p_id, p_phone, p_birth_date, p_service_start_date)
  on conflict (profile_id) do update set
    phone = excluded.phone,
    birth_date = excluded.birth_date,
    service_start_date = excluded.service_start_date;
end;
$$;

revoke all on function public.admin_list_team_members() from public, anon;
grant execute on function public.admin_list_team_members() to authenticated;
revoke all on function public.admin_update_team_member_details(uuid, text, text, date, date) from public, anon;
grant execute on function public.admin_update_team_member_details(uuid, text, text, date, date) to authenticated;

commit;
