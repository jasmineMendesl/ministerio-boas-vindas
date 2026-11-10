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
  for (const file of ['202611050001_initial_schema.sql', '202611050002_visitor_service_details.sql', '202611050003_two_role_access_model.sql', '202611100001_extra_schedules.sql', '202611100002_extra_schedule_delete.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  const admin = '10000000-0000-4000-8000-000000000001'
  const team = '10000000-0000-4000-8000-000000000002'
  await db.query('insert into auth.users(id) values ($1), ($2)', [admin, team])
  await db.query("insert into public.profiles(id, display_name, role) values ($1, 'Admin', 'admin'), ($2, 'Equipe', 'team')", [admin, team])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`)
  await db.query("insert into public.ministry_extra_schedules(title, event_date, members_needed) values ('Encontro especial', '2026-12-12', 8)")
  const saved = (await db.query('select * from public.ministry_extra_schedules')).rows[0]
  assert.equal(saved.members_needed, 8)
  assert.equal(saved.created_by, admin)
  for (const count of [0, -1, 1001]) {
    await assert.rejects(() => db.query("insert into public.ministry_extra_schedules(title, event_date, members_needed) values ('Teste', '2026-12-12', $1)", [count]), /check constraint/i)
  }
  await assert.rejects(() => db.query("insert into public.ministry_extra_schedules(title, event_date, members_needed) values (' ', '2026-12-12', 1)"), /check constraint/i)
  await db.exec(`select set_config('request.jwt.claim.sub', '${team}', false)`)
  assert.equal((await db.query('select * from public.ministry_extra_schedules')).rows.length, 1)
  await assert.rejects(() => db.query("insert into public.ministry_extra_schedules(title, event_date, members_needed) values ('Teste equipe', '2026-12-12', 1)"), /row-level security/i)
  assert.equal((await db.query('delete from public.ministry_extra_schedules returning id')).rows.length, 0)
  assert.equal((await db.query('select * from public.ministry_extra_schedules')).rows.length, 1)
  await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`)
  assert.equal((await db.query('delete from public.ministry_extra_schedules returning id')).rows.length, 1)
  assert.equal((await db.query('select * from public.ministry_extra_schedules')).rows.length, 0)
  await db.exec('reset role')
  await db.exec(await readFile(new URL('../supabase/migrations/202611100003_extra_schedule_members_and_time.sql', import.meta.url), 'utf8'))
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`)
  const saveSql = `select * from public.save_extra_schedule($1, '2026-12-12', $2::time, $3, $4::uuid[], 'Chegar antes', $5::uuid)`
  const extra = (await db.query(saveSql, ['Encontro com equipe', '17:30', 2, [team, team], null])).rows[0]
  assert.deepEqual(extra.member_ids, [team])
  assert.equal(extra.event_time, '17:30:00')
  assert.equal(extra.special_observation, 'Chegar antes')
  assert.equal(extra.created_by, admin)
  const updated = (await db.query(saveSql, ['Encontro atualizado', '18:30', 2, [admin, team], extra.id])).rows[0]
  assert.equal(updated.id, extra.id)
  assert.equal(updated.event_time, '18:30:00')
  assert.equal(updated.member_ids.length, 2)
  await assert.rejects(() => db.query(saveSql, ['Sem equipe', '17:30', 2, [], null]), /Select active members/i)
  await assert.rejects(() => db.query(saveSql, ['Sem horario', null, 2, [team], null]), /Select active members/i)
  await assert.rejects(() => db.query(saveSql, ['Acima do limite', '17:30', 1, [admin, team], null]), /Select active members/i)
  await assert.rejects(() => db.query(saveSql, ['Inexistente', '17:30', 2, ['10000000-0000-4000-8000-000000000099'], null]), /Select active members/i)
  await db.exec('reset role')
  await db.query('update public.profiles set active = false where id = $1', [team])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${admin}', false)`)
  await assert.rejects(() => db.query(saveSql, ['Inativo', '17:30', 2, [team], null]), /Select active members/i)
  await db.exec('reset role')
  await db.query('update public.profiles set active = true where id = $1', [team])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${team}', false)`)
  await assert.rejects(() => db.query(saveSql, ['Equipe sem permissao', '17:30', 1, [team], null]), /Not authorized/i)
  assert.equal((await db.query('select * from public.ministry_extra_schedules')).rows.length, 1)
  await db.exec('reset role; set role anon')
  await assert.rejects(() => db.query('select * from public.ministry_extra_schedules'), /permission denied/i)
  console.log('Extra schedules: migration, validation, audit and access policies passed.')
} finally { await db.close() }
