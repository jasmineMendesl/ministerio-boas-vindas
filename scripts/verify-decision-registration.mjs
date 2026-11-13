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
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `)
  for (const file of [
    '202611050001_initial_schema.sql', '202611050002_visitor_service_details.sql',
    '202611050003_two_role_access_model.sql', '202611050005_ministry_data_integration.sql',
    '202611050006_staff_visitor_registration.sql', '202611060004_staff_visitor_edit_delete.sql',
    '202611120001_admin_only_visitor_edit_delete.sql',
    '202611120005_prevent_duplicate_decisions.sql',
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))

  const admin = '10000000-0000-4000-8000-000000000001'
  const team = '10000000-0000-4000-8000-000000000002'
  await db.query('insert into auth.users(id) values ($1), ($2)', [admin, team])
  await db.query("insert into public.profiles(id, display_name, role) values ($1, 'Admin', 'admin'), ($2, 'Equipe', 'team')", [admin, team])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${team}', false)`)
  const register = (type = 'acceptance', date = '2026-01-01', phone = '+5511999990001') => db.query(
    "select public.register_staff_decision('Pessoa Teste', $1, $2::public.decision_kind, false, false, true, $3::date, null) as id",
    [phone, type, date],
  )
  await register()
  for (let attempt = 0; attempt < 4; attempt++) {
    await assert.rejects(() => register(), error => error.code === '23505')
  }
  assert.equal((await db.query('select * from public.decisions')).rows.length, 1)
  assert.equal((await db.query('select * from public.follow_ups')).rows.length, 1)
  await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`)
  await assert.rejects(() => register(), error => error.code === '23505')
  await register('reconciliation')
  await register('acceptance', '2026-01-02')
  await register('acceptance', '2026-01-01', '+5511999990002')
  assert.equal((await db.query('select * from public.decisions')).rows.length, 4)
  assert.equal((await db.query('select * from public.follow_ups')).rows.length, 4)
  await db.exec('reset role')
  await db.query('update public.profiles set active = false where id = $1', [team])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${team}', false)`)
  await assert.rejects(() => register(), /Not authorized/)
  console.log('Decision registration verified: five submissions create one decision and follow-up; both roles reject duplicates; other dates, types and people remain available; inactive profiles denied.')
} finally {
  await db.close()
}
