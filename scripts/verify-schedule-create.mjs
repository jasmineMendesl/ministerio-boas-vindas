import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `)
  for (const file of [
    '202611050001_initial_schema.sql', '202611050002_visitor_service_details.sql',
    '202611050003_two_role_access_model.sql', '202611060002_ministry_schedules_and_auth_profiles.sql',
    '202611060003_background_web_push.sql', '202611090002_schedule_role_catalog.sql',
    '202611090003_schedule_portaria_limit.sql', '202611090004_schedule_observations.sql',
    '202611090005_schedule_attendance.sql', '202611120003_fix_schedule_cascade_delete.sql',
    '202611120004_create_schedule_with_assignments.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  const ids = Array.from({ length: 7 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
  for (const id of ids) await db.query('insert into auth.users(id) values ($1)', [id])
  const [admin, team] = ids
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`)
  const call = (date, assignments) => db.query("select public.create_ministry_schedule_with_assignments($1, 'Domingo às 10h', 'Chegar antes', $2::jsonb) as id", [date, JSON.stringify(assignments)])
  // Reverse order tests that the function inserts primary roles first.
  const assignments = [{ volunteer_profile_id: team, ministry_role: 'leader' }, { volunteer_profile_id: team, ministry_role: 'portaria' }]
  const schedule = (await call('2026-11-15', assignments)).rows[0].id
  assert.equal((await db.query('select * from public.ministry_schedule_assignments where schedule_id = $1', [schedule])).rows.length, 2)
  assert.equal((await db.query('select * from public.ministry_schedule_attendance where schedule_id = $1', [schedule])).rows.length, 1)
  assert.equal((await db.query('select special_observation, published_at, created_by from public.ministry_schedules where id = $1', [schedule])).rows[0].published_at, null)
  const assertNoPartialSave = async (date, selection, error) => {
    await assert.rejects(() => call(date, selection), error)
    assert.equal((await db.query('select * from public.ministry_schedules where service_date = $1', [date])).rows.length, 0)
  }
  await assertNoPartialSave('2026-11-22', [], /Select volunteers/)
  await assertNoPartialSave('2026-11-22', [assignments[0]], /requires a primary role/)
  await assertNoPartialSave('2026-11-22', [...assignments, assignments[0]], /unique constraint/)
  await assertNoPartialSave('2026-11-22', ids.slice(1, 6).map(id => ({ volunteer_profile_id: id, ministry_role: 'portaria' })), /at most four/)
  await assertNoPartialSave('2026-11-22', [{ volunteer_profile_id: team, ministry_role: 'invalid' }], /check constraint/)
  await assert.rejects(() => call('2026-11-15', assignments), /unique constraint/)
  await db.exec(`select set_config('request.jwt.claim.sub', '${team}', false)`)
  await assert.rejects(() => call('2026-11-22', assignments), /Not authorized/)
  await db.exec('reset role')
  await db.query('update public.profiles set active = false where id = $1', [team])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`)
  await assertNoPartialSave('2026-11-22', assignments, /active volunteers/)
  console.log('Schedule creation verified: atomic save, roles and attendance, rollback on validation failures, active profiles and admin authorization.')
} finally {
  await db.close()
}
