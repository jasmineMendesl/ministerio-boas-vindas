begin;

-- Replace the former admin/team/pastoral model with admin/team only.
-- Existing pastoral users are safely downgraded to team before changing the enum.
drop policy if exists profiles_read_self_or_admin on public.profiles;
drop policy if exists profiles_admin_manage on public.profiles;
drop policy if exists people_admin_pastoral_manage on public.people;
drop policy if exists people_team_read_visitor_people on public.people;
drop policy if exists people_team_insert on public.people;
drop policy if exists people_team_update_visitor_people on public.people;
drop policy if exists people_team_delete_visitor_people on public.people;
drop policy if exists visitors_staff_manage on public.visitors;
drop policy if exists decisions_pastoral_manage on public.decisions;
drop policy if exists follow_ups_pastoral_manage on public.follow_ups;
drop policy if exists follow_up_history_pastoral_read on public.follow_up_history;
drop policy if exists pertencer_events_staff_manage on public.pertencer_events;
drop policy if exists event_invitations_pastoral_manage on public.event_invitations;
drop policy if exists gift_deliveries_staff_manage on public.gift_deliveries;
drop policy if exists visitor_prayer_requests_pastoral_read on public.visitor_prayer_requests;

drop function public.has_any_role(public.app_role[]);

alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;
update public.profiles set role = 'team' where role = 'pastoral';
drop type public.app_role;
create type public.app_role as enum ('admin', 'team');
alter table public.profiles
  alter column role type public.app_role using role::public.app_role,
  alter column role set default 'team'::public.app_role;

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

revoke all on function public.has_any_role(public.app_role[]) from public, anon;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;

-- Profiles: users can see their own profile; admins manage all profiles and roles.
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.has_any_role(array['admin']::public.app_role[])));
create policy profiles_admin_manage on public.profiles
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy profiles_staff_read on public.profiles
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])));

-- Both roles can work with ministry records. This includes decisions and follow-ups.
create policy people_staff_manage on public.people
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy visitors_staff_manage on public.visitors
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy decisions_staff_manage on public.decisions
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy follow_ups_staff_manage on public.follow_ups
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy follow_up_history_staff_read on public.follow_up_history
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])));

-- Pertencer is read-only for team. Only admins can create or change events and invitations.
create policy pertencer_events_admin_manage on public.pertencer_events
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy pertencer_events_team_read on public.pertencer_events
  for select to authenticated
  using ((select public.has_any_role(array['team']::public.app_role[])));
create policy event_invitations_admin_manage on public.event_invitations
  for all to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])))
  with check ((select public.has_any_role(array['admin']::public.app_role[])));
create policy event_invitations_team_read on public.event_invitations
  for select to authenticated
  using ((select public.has_any_role(array['team']::public.app_role[])));

create policy gift_deliveries_staff_manage on public.gift_deliveries
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])))
  with check ((select public.has_any_role(array['admin', 'team']::public.app_role[])));
create policy visitor_prayer_requests_staff_read on public.visitor_prayer_requests
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'team']::public.app_role[])));

commit;
