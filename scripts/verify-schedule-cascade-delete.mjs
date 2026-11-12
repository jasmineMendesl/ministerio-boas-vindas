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
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `)
  for (const file of [
    '202611050001_initial_schema.sql', '202611050002_visitor_service_details.sql',
    '202611050003_two_role_access_model.sql', '202611060002_ministry_schedules_and_auth_profiles.sql',
    '202611060003_background_web_push.sql', '202611090002_schedule_role_catalog.sql',
    '202611090003_schedule_portaria_limit.sql', '202611090005_schedule_attendance.sql',
    '202611120002_admin_only_schedule_attendance.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  const admin = '10000000-0000-4000-8000-000000000001'
  const team = '10000000-0000-4000-8000-000000000002'
  await db.query('insert into auth.users(id) values ($1), ($2)', [admin, team])
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`)
  const schedule = (await db.query("insert into public.ministry_schedules(service_date, service_label, published_at) values ('2026-11-15', 'Domingo às 10h', now()) returning id")).rows[0].id
  await db.query("insert into public.ministry_schedule_assignments(schedule_id, volunteer_profile_id, ministry_role) values ($1, $2, 'portaria')", [schedule, team])
  await db.query("insert into public.ministry_schedule_assignments(schedule_id, volunteer_profile_id, ministry_role) values ($1, $2, 'leader'), ($1, $2, 'support'), ($1, $2, 'media')", [schedule, team])
  // Reproduce the failure before the fix, with a volunteer holding several roles.
  await assert.rejects(() => db.query('delete from public.ministry_schedules where id = $1 returning id', [schedule]), /Remove complementary responsibilities/)
  await db.exec('reset role')
  await db.exec(await readFile(new URL('../supabase/migrations/202611120003_fix_schedule_cascade_delete.sql', import.meta.url), 'utf8'))
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${team}', false)`)
  assert.equal((await db.query('delete from public.ministry_schedules where id = $1 returning id', [schedule])).rows.length, 0)
  await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`)
  // Removing only the primary role must still be blocked.
  await assert.rejects(() => db.query("delete from public.ministry_schedule_assignments where schedule_id = $1 and ministry_role = 'portaria'", [schedule]), /Remove complementary responsibilities/)
  await db.query("delete from public.ministry_schedule_assignments where schedule_id = $1 and ministry_role = 'media'", [schedule])
  assert.equal((await db.query('select * from public.ministry_schedule_attendance where schedule_id = $1', [schedule])).rows.length, 1)
  assert.equal((await db.query('delete from public.ministry_schedules where id = $1 returning id', [schedule])).rows.length, 1)
  assert.equal((await db.query('select * from public.ministry_schedule_assignments where schedule_id = $1', [schedule])).rows.length, 0)
  assert.equal((await db.query('select * from public.ministry_schedule_attendance where schedule_id = $1', [schedule])).rows.length, 0)
  console.log('Reproduced and fixed cascade deletion with primary and complementary roles; admin-only deletion and assignment guards preserved.')
} finally {
  await db.close()
}
