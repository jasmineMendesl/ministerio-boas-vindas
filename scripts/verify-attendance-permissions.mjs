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
    '202611060003_background_web_push.sql', '202611090005_schedule_attendance.sql',
    '202611120002_admin_only_schedule_attendance.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  const admin = '10000000-0000-4000-8000-000000000001'
  const team = '10000000-0000-4000-8000-000000000002'
  await db.query('insert into auth.users(id) values ($1), ($2)', [admin, team])
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`)
  const schedule = (await db.query("insert into public.ministry_schedules(service_date, service_label, published_at) values ('2026-11-08', 'Domingo às 10h', now()) returning id")).rows[0].id
  await db.query("insert into public.ministry_schedule_assignments(schedule_id, volunteer_profile_id, ministry_role) values ($1, $2, 'leader')", [schedule, team])
  assert.equal((await db.query('select * from public.ministry_schedule_attendance')).rows.length, 1)
  await db.query('update public.ministry_schedule_attendance set was_absent = true where schedule_id = $1', [schedule])
  await db.exec(`select set_config('request.jwt.claim.sub', '${team}', false)`)
  assert.equal((await db.query('select * from public.ministry_schedules')).rows.length, 1)
  assert.equal((await db.query('select * from public.ministry_schedule_assignments')).rows.length, 1)
  assert.equal((await db.query('select * from public.ministry_schedule_attendance')).rows.length, 0)
  assert.equal((await db.query('update public.ministry_schedule_attendance set was_absent = false returning schedule_id')).rows.length, 0)
  assert.equal((await db.query('delete from public.ministry_schedule_attendance returning schedule_id')).rows.length, 0)
  await assert.rejects(() => db.query('insert into public.ministry_schedule_attendance(schedule_id, volunteer_profile_id) values ($1, $2)', [schedule, admin]), /row-level security/i)
  await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`)
  assert.equal((await db.query('select was_absent from public.ministry_schedule_attendance')).rows[0].was_absent, true)
  assert.equal((await db.query('update public.ministry_schedule_attendance set was_absent = false returning schedule_id')).rows.length, 1)
  await db.exec('reset role')
  await db.query('update public.profiles set active = false where id = $1', [admin])
  await db.exec('set role authenticated')
  assert.equal((await db.query('select * from public.ministry_schedule_attendance')).rows.length, 0)
  console.log('Attendance permissions verified: active admins only; team can still read published schedules and assignments.')
} finally {
  await db.close()
}
