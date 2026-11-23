begin;

create or replace function public.seed_uninvited_decisions_for_new_pertencer_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_invitations (
    event_id, person_id, follow_up_id, attendance, confirmed_at, attendance_recorded_at, attended
  )
  select new.id, eligible.person_id, eligible.follow_up_id,
    case eligible.status
      when 'awaiting_response' then 'no_response'::public.invitation_attendance
      when 'declined' then 'declined'::public.invitation_attendance
      when 'confirmed' then 'confirmed'::public.invitation_attendance
      when 'attended' then 'present'::public.invitation_attendance
      else 'pending'::public.invitation_attendance
    end,
    case when eligible.status = 'confirmed' then pg_catalog.now() end,
    case when eligible.status = 'attended' then pg_catalog.now() end,
    eligible.status = 'attended'
  from (
    select distinct on (d.person_id) d.person_id, f.id as follow_up_id, f.status
    from public.follow_ups f
    join public.decisions d on d.id = f.decision_id and d.person_id = f.person_id
    where not exists (
      select 1 from public.event_invitations existing
      where existing.person_id = d.person_id
    )
    order by d.person_id, d.decided_on desc, d.created_at desc
  ) eligible
  on conflict (event_id, person_id) do nothing;
  return new;
end;
$$;

commit;
