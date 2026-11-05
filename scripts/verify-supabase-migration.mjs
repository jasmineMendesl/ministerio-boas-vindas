import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const sql = await readFile(new URL('../supabase/migrations/202611050001_initial_schema.sql', import.meta.url), 'utf8')
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
  await db.exec(sql)
  await assert.rejects(() => db.exec(sql), /Migration stopped: public\./)
  await db.exec('rollback')

  const adminId = '10000000-0000-4000-8000-000000000001'
  const teamId = '10000000-0000-4000-8000-000000000002'
  const pastoralId = '10000000-0000-4000-8000-000000000003'
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@test.invalid'), ($2, 'team@test.invalid'), ($3, 'pastoral@test.invalid')`, [adminId, teamId, pastoralId])
  await db.query(`insert into public.profiles (id, display_name, role) values ($1, 'Admin', 'admin'), ($2, 'Equipe', 'team'), ($3, 'Pastoral', 'pastoral')`, [adminId, teamId, pastoralId])
  await db.query(`insert into public.people (full_name, phone_normalized) values ('Pessoa visitante', '+5511987654321'), ('Pessoa de decisao', '+5511987654322')`)
  await db.query(`insert into public.visitors (person_id) select id from public.people where phone_normalized = '+5511987654321'`)
  await db.query(`insert into public.decisions (person_id, decision_type, baptized) select id, case when phone_normalized = '+5511987654321' then 'acceptance'::public.decision_kind else 'reconciliation'::public.decision_kind end, false from public.people`)
  await db.query(`insert into public.follow_ups (decision_id, person_id) select d.id, d.person_id from public.decisions d`)
  await db.query(`insert into public.pertencer_events (event_date) values (current_date + 7)`)
  await db.query(`insert into public.event_invitations (event_id, person_id, follow_up_id) select e.id, f.person_id, f.id from public.pertencer_events e cross join public.follow_ups f`)
  assert.equal((await db.query(`select count(*)::int as n from pg_catalog.pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity`)).rows[0].n, 10)

  await db.exec('set role anon')
  for (const table of ['profiles', 'people', 'visitors', 'decisions', 'follow_ups', 'follow_up_history', 'pertencer_events', 'event_invitations', 'gift_deliveries', 'public_visitor_rate_limits']) {
    await assert.rejects(() => db.query(`select * from public.${table}`), /permission denied/i)
  }
  await assert.rejects(() => db.query("insert into public.people (full_name, phone_normalized) values ('Anon', '+5511999999999')"), /permission denied/i)
  await assert.rejects(() => db.query("select public.register_public_visitor('Pessoa', '+5511999999999')"), /permission denied/i)
  await db.exec('reset role')

  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${teamId}', false)`)
  assert.equal((await db.query('select count(*)::int as n from public.people')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int as n from public.visitors')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int as n from public.decisions')).rows[0].n, 0)
  assert.equal((await db.query('select count(*)::int as n from public.event_invitations')).rows[0].n, 0)
  assert.equal((await db.query('select count(*)::int as n from public.follow_up_history')).rows[0].n, 0)
  await assert.rejects(() => db.query("insert into public.follow_up_history (follow_up_id, new_status) select id, 'contact_made' from public.follow_ups"), /permission denied/i)
  await assert.rejects(() => db.query('update public.follow_up_history set observations = \'tamper\''), /permission denied/i)
  await assert.rejects(() => db.query('delete from public.follow_up_history'), /permission denied/i)
  await db.query("update public.profiles set role = 'admin' where id = $1", [teamId])
  await db.exec('reset role')
  assert.equal((await db.query('select role::text from public.profiles where id = $1', [teamId])).rows[0].role, 'team')

  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${pastoralId}', false)`)
  assert.equal((await db.query('select count(*)::int as n from public.decisions')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.event_invitations')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.follow_up_history')).rows[0].n, 2)
  await db.query("update public.follow_ups set status = 'contact_made' where decision_id is not null")
  assert.equal((await db.query('select count(*)::int as n from public.follow_up_history')).rows[0].n, 4)
  await db.exec('reset role')

  await db.exec('set role service_role')
  await db.query("select public.register_public_visitor('Cadastro Público', '+5511999999999')")
  await db.query("select public.register_public_visitor('Nome diferente', '+5511999999999')")
  await db.exec('reset role')
  assert.equal((await db.query("select count(*)::int as n from public.people where phone_normalized = '+5511999999999'")).rows[0].n, 1)
  assert.equal((await db.query("select count(*)::int as n from public.visitors v join public.people p on p.id = v.person_id where p.phone_normalized = '+5511999999999'")).rows[0].n, 1)
  assert.equal((await db.query("select full_name from public.people where phone_normalized = '+5511999999999'")).rows[0].full_name, 'Cadastro Público')
  for (let attempt = 1; attempt <= 31; attempt += 1) {
    const result = await db.query("select public.consume_public_visitor_rate_limit(repeat('b', 64)) as allowed")
    assert.equal(result.rows[0].allowed, attempt <= 30)
  }

  console.log('Migration SQL valid and re-run blocked; all 10 tables have RLS; anon access is denied; team/pastoral access is separated; follow-up history is append-only; backend RPCs deduplicate registrations.')
} finally {
  await db.close()
}
