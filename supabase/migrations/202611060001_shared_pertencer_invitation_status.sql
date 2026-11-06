begin;

alter type public.invitation_attendance add value if not exists 'no_response';
alter type public.invitation_attendance add value if not exists 'declined';

commit;
begin;

create or replace function public.set_pertencer_invitation_status(
  p_follow_up_id uuid,
  p_event_id uuid,
  p_status public.invitation_attendance
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  person_uuid uuid;
  invitation_uuid uuid;
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_follow_up_id is null or p_status is null
    or p_status not in ('pending', 'no_response', 'declined', 'confirmed', 'present') then
    raise exception using errcode = '22023', message = 'Invalid invitation status';
  end if;

  select f.person_id into person_uuid
  from public.follow_ups f
  where f.id = p_follow_up_id
  for update;
  if person_uuid is null then
    raise exception using errcode = '22023', message = 'Follow-up not found';
  end if;

  if p_event_id is not null then
    if not exists (select 1 from public.pertencer_events e where e.id = p_event_id) then
      raise exception using errcode = '22023', message = 'Edition not found';
    end if;

    insert into public.event_invitations (
      event_id, person_id, follow_up_id, attendance, confirmed_at, attendance_recorded_at
    ) values (
      p_event_id, person_uuid, p_follow_up_id, p_status,
      case when p_status = 'confirmed' then pg_catalog.now() else null end,
      case when p_status = 'present' then pg_catalog.now() else null end
    )
    on conflict (event_id, person_id) do update set
      follow_up_id = excluded.follow_up_id,
      attendance = excluded.attendance,
      confirmed_at = excluded.confirmed_at,
      attendance_recorded_at = excluded.attendance_recorded_at
    returning id into invitation_uuid;
  end if;

  update public.follow_ups
  set status = case p_status
    when 'pending' then 'awaiting_first_contact'::public.follow_up_status
    when 'no_response' then 'awaiting_response'::public.follow_up_status
    when 'declined' then 'declined'::public.follow_up_status
    when 'confirmed' then 'confirmed'::public.follow_up_status
    when 'present' then 'attended'::public.follow_up_status
  end
  where id = p_follow_up_id;

  return invitation_uuid;
end;
$$;

revoke all on function public.set_pertencer_invitation_status(uuid, uuid, public.invitation_attendance) from public, anon;
grant execute on function public.set_pertencer_invitation_status(uuid, uuid, public.invitation_attendance) to authenticated;

create function public.invite_new_follow_up_to_upcoming_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_event_id uuid;
begin
  select e.id into next_event_id
  from public.pertencer_events e
  where e.event_date >= (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
  order by e.event_date
  limit 1;

  if next_event_id is not null then
    insert into public.event_invitations (event_id, person_id, follow_up_id, attendance)
    values (next_event_id, new.person_id, new.id, 'pending')
    on conflict (event_id, person_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.invite_new_follow_up_to_upcoming_event() from public, anon, authenticated;
create trigger follow_ups_invite_to_upcoming_pertencer
  after insert on public.follow_ups
  for each row execute function public.invite_new_follow_up_to_upcoming_event();

create function public.seed_uninvited_decisions_for_new_pertencer_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_invitations (event_id, person_id, follow_up_id, attendance)
  select new.id, eligible.person_id, eligible.follow_up_id,
    case eligible.status
      when 'awaiting_response' then 'no_response'::public.invitation_attendance
      when 'declined' then 'declined'::public.invitation_attendance
      when 'confirmed' then 'confirmed'::public.invitation_attendance
      when 'attended' then 'present'::public.invitation_attendance
      else 'pending'::public.invitation_attendance
    end
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

revoke all on function public.seed_uninvited_decisions_for_new_pertencer_event() from public, anon, authenticated;
create trigger pertencer_events_invite_uninvited_decisions
  after insert on public.pertencer_events
  for each row execute function public.seed_uninvited_decisions_for_new_pertencer_event();

-- When a future edition already exists, invite each person who has no invitation yet.
do $$
declare
  next_event_id uuid;
begin
  select e.id into next_event_id
  from public.pertencer_events e
  where e.event_date >= (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
  order by e.event_date
  limit 1;

  if next_event_id is not null then
    insert into public.event_invitations (event_id, person_id, follow_up_id, attendance)
    select next_event_id, eligible.person_id, eligible.follow_up_id,
      case eligible.status
        when 'awaiting_response' then 'no_response'::public.invitation_attendance
        when 'declined' then 'declined'::public.invitation_attendance
        when 'confirmed' then 'confirmed'::public.invitation_attendance
        when 'attended' then 'present'::public.invitation_attendance
        else 'pending'::public.invitation_attendance
      end
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
  end if;
end;
$$;

commit;
