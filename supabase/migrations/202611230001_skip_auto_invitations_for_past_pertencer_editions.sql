begin;

drop trigger pertencer_events_invite_uninvited_decisions on public.pertencer_events;

create trigger pertencer_events_invite_uninvited_decisions
  after insert on public.pertencer_events
  for each row
  when (new.closed_at is null and new.event_date >= (pg_catalog.now() at time zone 'America/Sao_Paulo')::date)
  execute function public.seed_uninvited_decisions_for_new_pertencer_event();

commit;
