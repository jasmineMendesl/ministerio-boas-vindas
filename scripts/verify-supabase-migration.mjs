import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const sql = await readFile(new URL('../supabase/migrations/202611050001_initial_schema.sql', import.meta.url), 'utf8')
const visitorDetailsSql = await readFile(new URL('../supabase/migrations/202611050002_visitor_service_details.sql', import.meta.url), 'utf8')
const rolesSql = await readFile(new URL('../supabase/migrations/202611050003_two_role_access_model.sql', import.meta.url), 'utf8')
const giftReportsSql = await readFile(new URL('../supabase/migrations/202611050004_visitor_service_gift_reports.sql', import.meta.url), 'utf8')
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
  await db.exec(visitorDetailsSql)
  await assert.rejects(() => db.exec(visitorDetailsSql), /visitor details columns already exist/)
  await db.exec('rollback')
  await db.exec(rolesSql)
  await db.exec(giftReportsSql)

  const adminId = '10000000-0000-4000-8000-000000000001'
  const teamId = '10000000-0000-4000-8000-000000000002'
  const pastoralId = '10000000-0000-4000-8000-000000000003'
  await db.query(`insert into auth.users (id, email) values ($1, 'admin@test.invalid'), ($2, 'team@test.invalid'), ($3, 'pastoral@test.invalid')`, [adminId, teamId, pastoralId])
  await db.query(`insert into public.profiles (id, display_name, role) values ($1, 'Admin', 'admin'), ($2, 'Equipe', 'team'), ($3, 'Equipe legada', 'team')`, [adminId, teamId, pastoralId])
  await db.query(`insert into public.people (full_name, phone_normalized) values ('Pessoa visitante', '+5511987654321'), ('Pessoa de decisao', '+5511987654322')`)
  await db.query(`insert into public.visitors (person_id) select id from public.people where phone_normalized = '+5511987654321'`)
  await db.query(`insert into public.visitor_prayer_requests (visitor_id, request_text) select id, 'Pedido de exemplo restrito' from public.visitors`)
  await db.query(`insert into public.decisions (person_id, decision_type, baptized) select id, case when phone_normalized = '+5511987654321' then 'acceptance'::public.decision_kind else 'reconciliation'::public.decision_kind end, false from public.people`)
  await db.query(`insert into public.follow_ups (decision_id, person_id) select d.id, d.person_id from public.decisions d`)
  await db.query(`insert into public.pertencer_events (event_date) values (current_date + 7)`)
  await db.query(`insert into public.event_invitations (event_id, person_id, follow_up_id) select e.id, f.person_id, f.id from public.pertencer_events e cross join public.follow_ups f`)
  assert.equal((await db.query(`select count(*)::int as n from pg_catalog.pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity`)).rows[0].n, 12)

  await db.exec('set role anon')
  for (const table of ['profiles', 'people', 'visitors', 'visitor_prayer_requests', 'decisions', 'follow_ups', 'follow_up_history', 'pertencer_events', 'event_invitations', 'gift_deliveries', 'public_visitor_rate_limits', 'visitor_service_gift_reports']) {
    await assert.rejects(() => db.query(`select * from public.${table}`), /permission denied/i)
  }
  await assert.rejects(() => db.query("insert into public.people (full_name, phone_normalized) values ('Anon', '+5511999999999')"), /permission denied/i)
  await assert.rejects(() => db.query("select public.register_public_visitor('Pessoa', '+5511999999999')"), /permission denied/i)
  await assert.rejects(() => db.query("select public.register_public_visitor_details('Pessoa', '+5511999999999', current_date, false, null)"), /permission denied/i)
  await db.exec('reset role')

  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${teamId}', false)`)
  assert.equal((await db.query('select count(*)::int as n from public.people')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.visitors')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int as n from public.decisions')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.event_invitations')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.follow_up_history')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.visitor_prayer_requests')).rows[0].n, 1)
  await assert.rejects(() => db.query("insert into public.follow_up_history (follow_up_id, new_status) select id, 'contact_made' from public.follow_ups"), /permission denied/i)
  await assert.rejects(() => db.query('update public.follow_up_history set observations = \'tamper\''), /permission denied/i)
  await assert.rejects(() => db.query('delete from public.follow_up_history'), /permission denied/i)
  await assert.rejects(() => db.query(`insert into public.pertencer_events (event_date) values (current_date + 14)`), /row-level security|policy/i)
  await db.query(`insert into public.visitor_service_gift_reports (service_date, service_label, gifts_delivered, responsible_user_id) values (current_date - 1, 'Domingo - Noite (18:30)', 4, $1)`, [teamId])
  await assert.rejects(() => db.query(`insert into public.visitor_service_gift_reports (service_date, service_label, gifts_delivered, responsible_user_id) values (current_date - 1, 'Outro culto', 2, $1)`, [adminId]), /row-level security|policy/i)
  await db.query('delete from public.visitor_service_gift_reports')
  assert.equal((await db.query('select count(*)::int as n from public.visitor_service_gift_reports')).rows[0].n, 1)
  await db.query("update public.profiles set role = 'admin' where id = $1", [teamId])
  await db.exec('reset role')
  assert.equal((await db.query('select role::text from public.profiles where id = $1', [teamId])).rows[0].role, 'team')

  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${pastoralId}', false)`)
  assert.equal((await db.query('select count(*)::int as n from public.decisions')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.event_invitations')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.follow_up_history')).rows[0].n, 2)
  assert.equal((await db.query('select count(*)::int as n from public.visitor_prayer_requests')).rows[0].n, 1)
  await db.query("update public.follow_ups set status = 'contact_made' where decision_id is not null")
  assert.equal((await db.query('select count(*)::int as n from public.follow_up_history')).rows[0].n, 4)
  await db.exec('reset role')

  await db.exec('set role service_role')
  await db.query("select public.register_public_visitor('Cadastro Público', '+5511999999999')")
  await db.query("select public.register_public_visitor('Nome diferente', '+5511999999999')")
  await db.query("select public.register_public_visitor_details('Enriched Demo', '+5511999999998', current_date - 1, true, 'Prayer example')")
  await db.query("select public.register_public_visitor_details('Alternate Name', '+5511999999998', current_date - 1, false, null)")
  await db.exec('reset role')
  assert.equal((await db.query("select count(*)::int as n from public.people where phone_normalized = '+5511999999999'")).rows[0].n, 1)
  assert.equal((await db.query("select count(*)::int as n from public.visitors v join public.people p on p.id = v.person_id where p.phone_normalized = '+5511999999999'")).rows[0].n, 1)
  assert.equal((await db.query("select full_name from public.people where phone_normalized = '+5511999999999'")).rows[0].full_name, 'Cadastro Público')
  const enriched = await db.query("select v.visited_on, v.contact_consent, v.contact_consent_at, p.request_text from public.visitors v join public.people pe on pe.id = v.person_id join public.visitor_prayer_requests p on p.visitor_id = v.id where pe.phone_normalized = '+5511999999998'")
  assert.equal(enriched.rows.length, 1)
  assert.equal(enriched.rows[0].contact_consent, false)
  assert.equal(enriched.rows[0].contact_consent_at, null)
  assert.equal(enriched.rows[0].request_text, 'Prayer example')
  for (let attempt = 1; attempt <= 31; attempt += 1) {
    const result = await db.query("select public.consume_public_visitor_rate_limit(repeat('b', 64)) as allowed")
    assert.equal(result.rows[0].allowed, attempt <= 30)
  }

  console.log('Four migrations applied; 12 tables have RLS; admin/team policies verified; team cannot write Pertencer events and can record gift reports; visitor RPC behavior remains protected.')
} finally {
  await db.close()
}
