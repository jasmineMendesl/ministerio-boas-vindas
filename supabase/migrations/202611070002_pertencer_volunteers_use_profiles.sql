begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pertencer_agenda_items' and column_name = 'volunteer_profile_id'
  ) then
    raise exception 'Migration stopped: public.pertencer_agenda_items.volunteer_profile_id already exists; inspect the column before proceeding.';
  end if;
end;
$$;

alter table public.pertencer_agenda_items
  add column volunteer_profile_id uuid references public.profiles (id) on delete set null;

-- Preserve existing assignments only when a volunteer name matches exactly one active profile.
with profile_matches as (
  select v.id as volunteer_id, p.id as profile_id
  from public.pertencer_volunteers v
  join public.profiles p
    on pg_catalog.lower(pg_catalog.btrim(p.display_name)) = pg_catalog.lower(pg_catalog.btrim(v.display_name))
   and p.active
), unique_matches as (
  select volunteer_id, (pg_catalog.array_agg(profile_id order by profile_id))[1] as profile_id
  from profile_matches
  group by volunteer_id
  having pg_catalog.count(*) = 1
)
update public.pertencer_agenda_items a
set volunteer_profile_id = matches.profile_id
from unique_matches matches
where a.volunteer_id = matches.volunteer_id;

create index pertencer_agenda_items_volunteer_profile_idx
  on public.pertencer_agenda_items (volunteer_profile_id);

comment on column public.pertencer_agenda_items.volunteer_profile_id is
  'Assigned team login profile; notifications are addressed to this profile.';

commit;
