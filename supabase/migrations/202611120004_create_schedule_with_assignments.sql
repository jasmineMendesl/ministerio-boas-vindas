begin;

-- Create the schedule and all its assignments in one transaction.
create function public.create_ministry_schedule_with_assignments(
  p_service_date date,
  p_service_label text,
  p_special_observation text,
  p_assignments jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  schedule_uuid uuid;
  assignment record;
begin
  if (select auth.uid()) is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_assignments is null or pg_catalog.jsonb_typeof(p_assignments) <> 'array' then
    raise exception using errcode = '22023', message = 'Select volunteers';
  end if;
  if pg_catalog.jsonb_array_length(p_assignments) = 0 then
    raise exception using errcode = '22023', message = 'Select volunteers';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_assignments) as a(volunteer_profile_id uuid, ministry_role text)
    left join public.profiles p on p.id = a.volunteer_profile_id and p.active
    where p.id is null or a.ministry_role is null
  ) then
    raise exception using errcode = '22023', message = 'Select active volunteers and valid roles';
  end if;

  insert into public.ministry_schedules (service_date, service_label, special_observation)
  values (p_service_date, p_service_label, nullif(pg_catalog.btrim(p_special_observation), ''))
  returning id into schedule_uuid;

  -- Primary roles must exist before complementary roles to respect the guard.
  for assignment in
    select a.volunteer_profile_id, a.ministry_role
    from pg_catalog.jsonb_to_recordset(p_assignments) as a(volunteer_profile_id uuid, ministry_role text)
    order by case when a.ministry_role in ('portaria', 'seat_direction') then 0 else 1 end
  loop
    insert into public.ministry_schedule_assignments (schedule_id, volunteer_profile_id, ministry_role)
    values (schedule_uuid, assignment.volunteer_profile_id, assignment.ministry_role);
  end loop;
  return schedule_uuid;
end;
$$;

revoke all on function public.create_ministry_schedule_with_assignments(date,text,text,jsonb) from public, anon;
grant execute on function public.create_ministry_schedule_with_assignments(date,text,text,jsonb) to authenticated;

commit;
