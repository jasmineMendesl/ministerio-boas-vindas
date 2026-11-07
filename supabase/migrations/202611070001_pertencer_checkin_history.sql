begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_invitations' and column_name = 'attended'
  ) then
    raise exception 'Migration stopped: public.event_invitations.attended already exists; inspect the column before proceeding.';
  end if;
  if pg_catalog.to_regprocedure('public.set_pertencer_invitation_attendance(uuid,boolean)') is not null then
    raise exception 'Migration stopped: the invitation check-in function already exists; inspect it before proceeding.';
  end if;
end;
$$;

alter table public.event_invitations
  add column attended boolean not null default false;

update public.event_invitations
set attended = (attendance = 'present');

create function public.set_pertencer_invitation_attendance(
  p_invitation_id uuid,
  p_attended boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not public.has_any_role(array['admin']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  if p_invitation_id is null or p_attended is null then
    raise exception using errcode = '22023', message = 'Invalid check-in';
  end if;

  update public.event_invitations
  set attended = p_attended,
      attendance_recorded_at = pg_catalog.now(),
      updated_at = pg_catalog.now(),
      updated_by = current_user_id
  where id = p_invitation_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Invitation not found';
  end if;
end;
$$;

revoke all on function public.set_pertencer_invitation_attendance(uuid,boolean) from public, anon;
grant execute on function public.set_pertencer_invitation_attendance(uuid,boolean) to authenticated;

commit;
