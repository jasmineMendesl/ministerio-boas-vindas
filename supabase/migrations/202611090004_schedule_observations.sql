begin;

alter table public.ministry_schedules
  add column special_observation text,
  add constraint ministry_schedules_special_observation_check
    check (
      special_observation is null
      or (
        pg_catalog.char_length(special_observation) between 1 and 1200
        and pg_catalog.char_length(pg_catalog.btrim(special_observation)) > 0
      )
    );

comment on column public.ministry_schedules.special_observation is
  'Optional admin-provided guidance displayed to staff and announced in push notifications for this schedule.';

commit;
