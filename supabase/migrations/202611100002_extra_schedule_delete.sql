begin;

grant delete on public.ministry_extra_schedules to authenticated;

create policy extra_schedules_admin_delete on public.ministry_extra_schedules
  for delete to authenticated
  using ((select public.has_any_role(array['admin']::public.app_role[])));

commit;
