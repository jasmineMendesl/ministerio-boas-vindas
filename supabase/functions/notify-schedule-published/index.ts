import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendPushToUsers } from '../_shared/web-push.ts'

function normalizeOrigin(value: string) {
  try {
    const parsed = new URL(value.trim())
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return ''
    return parsed.origin.toLowerCase()
  } catch { return '' }
}

const allowedOrigins = new Set((Deno.env.get('VISITOR_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(normalizeOrigin).filter(Boolean))

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const cors = { 'Access-Control-Allow-Origin': origin ? normalizeOrigin(origin) : '', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', Vary: 'Origin' }
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
  if (origin && !allowedOrigins.has(normalizeOrigin(origin))) return json({ error: 'Origem não autorizada.' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const authorization = request.headers.get('authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const secrets = Deno.env.get('SUPABASE_SECRET_KEYS')
  let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  try { if (secrets) serviceKey = (JSON.parse(secrets) as Record<string, string>).default } catch { serviceKey = undefined }
  if (!authorization || !url || !serviceKey) return json({ error: 'Não autorizado.' }, 401)

  let body: { scheduleId?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'Solicitação inválida.' }, 400) }
  if (typeof body.scheduleId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.scheduleId)) return json({ error: 'Escala inválida.' }, 400)

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Sessão inválida.' }, 401)
  const { data: profile } = await client.from('profiles').select('role,active').eq('id', authData.user.id).maybeSingle()
  if (!profile?.active || profile.role !== 'admin') return json({ error: 'Apenas administradores podem publicar escalas.' }, 403)

  const { data: schedule, error: scheduleError } = await client.from('ministry_schedules').select('id,service_date,service_label,published_at').eq('id', body.scheduleId).maybeSingle()
  if (scheduleError || !schedule?.published_at) return json({ error: 'A escala não está publicada.' }, 409)
  const { data: assignments, error: assignmentsError } = await client.from('ministry_schedule_assignments').select('volunteer_profile_id').eq('schedule_id', schedule.id)
  if (assignmentsError) return json({ error: 'Não foi possível localizar os voluntários.' }, 503)

  const date = new Date(`${schedule.service_date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
  const result = await sendPushToUsers(client, (assignments ?? []).map(item => item.volunteer_profile_id), {
    title: 'Nova escala publicada',
    body: `Você está escalado para ${schedule.service_label}, em ${date}. Acesse o sistema para ver sua função.`,
    url: './#/escala',
    tag: `ministry-schedule-${schedule.id}`,
  })
  return json({ ok: true, sent: result.sent, configured: result.configured })
})
