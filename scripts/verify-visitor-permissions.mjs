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
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))

  const admin = '10000000-0000-4000-8000-000000000001'
  const team = '10000000-0000-4000-8000-000000000002'
  await db.query('insert into auth.users(id) values ($1), ($2)', [admin, team])
  await db.query("insert into public.profiles(id, display_name, role) values ($1, 'Admin', 'admin'), ($2, 'Equipe', 'team')", [admin, team])
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${team}', false)`)
  const visit = (await db.query("select public.register_staff_visitor_details('Visitante original', '+5511999990001', current_date, false, 'Pedido') as id")).rows[0].id
  const person = (await db.query('select person_id from public.visitors where id = $1', [visit])).rows[0].person_id
  await db.query("insert into public.visitor_staff_notes(person_id, note) values ($1, 'Observacao da equipe')", [person])
  assert.equal((await db.query('select note from public.visitor_staff_notes where person_id = $1', [person])).rows[0].note, 'Observacao da equipe')
  assert.equal((await db.query('select request_text from public.visitor_prayer_requests where visitor_id = $1', [visit])).rows[0].request_text, 'Pedido')

  const edit = "select public.update_staff_visitor_details($1, $2, 'Nome editado', '+5511999990001', current_date, true, 'Pedido editado')"
  await assert.rejects(() => db.query(edit, [person, visit]), /Not authorized/)
  await assert.rejects(() => db.query('select public.delete_staff_visitor($1)', [person]), /Not authorized/)
  assert.equal((await db.query("update public.people set full_name = 'Tentativa direta' where id = $1 returning id", [person])).rows.length, 0)
  assert.equal((await db.query('delete from public.people where id = $1 returning id', [person])).rows.length, 0)
  assert.equal((await db.query('update public.visitors set contact_consent = true where id = $1 returning id', [visit])).rows.length, 0)
  assert.equal((await db.query('delete from public.visitors where id = $1 returning id', [visit])).rows.length, 0)

  // Decision registration stays available without renaming the shared visitor.
  await db.query("select public.register_staff_decision('Outro nome', '+5511999990001', 'acceptance', false, false, false, current_date, null)")
  assert.equal((await db.query('select full_name from public.people where id = $1', [person])).rows[0].full_name, 'Visitante original')
  // Registering another visit must not replace the visitor name either.
  await db.query("select public.register_staff_visitor_details('Outro nome', '+5511999990001', current_date, false, null)")
  assert.equal((await db.query('select full_name from public.people where id = $1', [person])).rows[0].full_name, 'Visitante original')

  await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`)
  await db.query(edit, [person, visit])
  assert.equal((await db.query('select full_name from public.people where id = $1', [person])).rows[0].full_name, 'Nome editado')
  assert.equal((await db.query('select contact_consent from public.visitors where id = $1', [visit])).rows[0].contact_consent, true)
  assert.equal((await db.query('select request_text from public.visitor_prayer_requests where visitor_id = $1', [visit])).rows[0].request_text, 'Pedido editado')
  const deleted = (await db.query('select public.delete_staff_visitor($1) as result', [person])).rows[0].result
  assert.equal(deleted.deleted_visits, 2)
  assert.equal(deleted.person_removed, false)
  assert.equal((await db.query('select * from public.visitors where person_id = $1', [person])).rows.length, 0)
  assert.equal((await db.query('select * from public.people where id = $1', [person])).rows.length, 1)
  console.log('Visitor permissions verified: team registration, reading and notes; admin editing and deletion; direct API and RPC restrictions.')
} finally {
  await db.close()
}
