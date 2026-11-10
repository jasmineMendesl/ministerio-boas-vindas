import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendPushToUsers } from '../_shared/web-push.ts'
import { scheduleNotification } from '../_shared/schedule-notifications.ts'

function normalizeOrigin(value: string) {
  try {
    const parsed = new URL(value.trim())
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return ''
    return parsed.origin.toLowerCase()
  } catch { return '' }
}

const allowedOrigins = new Set((Deno.env.get('VISITOR_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(normalizeOrigin).filter(Boolean))

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true
  const normalized = normalizeOrigin(origin)
  return allowedOrigins.has(normalized) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' }
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = normalizeOrigin(origin)
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, x-client-info, content-type'
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const cors = corsHeaders(origin)
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
  if (!isAllowedOrigin(origin)) return json({ error: 'Origem não autorizada.' }, 403)
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
  if (typeof body.scheduleId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.scheduleId)) return json({ error: 'Escala inválida.' }, 400)

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Sessão inválida.' }, 401)
  const { data: profile } = await client.from('profiles').select('role,active').eq('id', authData.user.id).maybeSingle()
  if (!profile?.active || profile.role !== 'admin') return json({ error: 'Apenas administradores podem publicar escalas.' }, 403)

  const { data: schedule, error: scheduleError } = await client.from('ministry_extra_schedules')
    .select('id,title,event_date,event_time,member_ids,special_observation').eq('id', body.scheduleId).maybeSingle()
  if (scheduleError || !schedule) return json({ error: 'Escala extra indisponível.' }, 404)
  if (!schedule.event_time || !schedule.member_ids?.length) return json({ error: 'Defina o horário e os membros da escala extra antes de notificar.' }, 409)
  const { data: profiles, error: profilesError } = await client.from('profiles')
    .select('id').eq('active', true).in('role', ['admin', 'team']).in('id', schedule.member_ids)
  if (profilesError) return json({ error: 'Não foi possível localizar a equipe.' }, 503)

  const result = await sendPushToUsers(client, (profiles ?? []).map(item => item.id), {
    ...scheduleNotification({ kind: 'extra', name: schedule.title, time: schedule.event_time, observation: schedule.special_observation }),
    url: `./#/escala?tab=extra`,
    tag: `ministry-extra-schedule-${schedule.id}`,
  })
  return json({ ok: true, sent: result.sent, configured: result.configured })
})
