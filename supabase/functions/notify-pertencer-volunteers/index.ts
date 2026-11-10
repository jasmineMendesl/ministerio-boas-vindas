import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendPushToUsers } from '../_shared/web-push.ts'
import { groupVolunteerRoles, scheduleNotification } from '../_shared/schedule-notifications.ts'

function normalizeOrigin(value: string) {
  try {
    const parsed = new URL(value.trim())
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return ''
    return parsed.origin.toLowerCase()
  } catch { return '' }
}

const allowedOrigins = new Set((Deno.env.get('VISITOR_ALLOWED_ORIGINS') ?? '')
  .split(',').map(normalizeOrigin).filter(Boolean))

Deno.serve(async request => {
  const origin = request.headers.get('origin')
  const normalizedOrigin = origin ? normalizeOrigin(origin) : ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' }
  if (origin && (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin))) {
    return Response.json({ error: 'Origem não autorizada.' }, { status: 403, headers })
  }
  if (normalizedOrigin) {
    headers['Access-Control-Allow-Origin'] = normalizedOrigin
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, x-client-info, content-type'
    headers['Access-Control-Max-Age'] = '86400'
  }
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const authorization = request.headers.get('authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const secretsJson = Deno.env.get('SUPABASE_SECRET_KEYS')
  const legacyServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authorization || !supabaseUrl || (!secretsJson && !legacyServiceKey)) return json({ error: 'Não autorizado.' }, 401)

  let serviceKey = legacyServiceKey
  try {
    if (secretsJson) serviceKey = (JSON.parse(secretsJson) as Record<string, string>).default
  } catch { return json({ error: 'Serviço temporariamente indisponível.' }, 503) }
  if (!serviceKey) return json({ error: 'Serviço temporariamente indisponível.' }, 503)

  let payload: { eventId?: unknown }
  try { payload = await request.json() as typeof payload } catch { return json({ error: 'Solicitação inválida.' }, 400) }
  if (typeof payload.eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.eventId)) {
    return json({ error: 'Edição inválida.' }, 400)
  }

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Sessão inválida.' }, 401)
  const { data: profile, error: profileError } = await client.from('profiles')
    .select('role,active').eq('id', authData.user.id).maybeSingle()
  if (profileError || !profile?.active || profile.role !== 'admin') return json({ error: 'Apenas administradores podem notificar a equipe do Projeto Pertencer.' }, 403)

  const { data: event, error: eventError } = await client.from('pertencer_events')
    .select('id,event_date,title,closed_at').eq('id', payload.eventId).maybeSingle()
  if (eventError || !event || event.closed_at) return json({ error: 'Edição aberta não encontrada.' }, 404)

  const { data: agenda, error: agendaError } = await client.from('pertencer_agenda_items')
    .select('volunteer_profile_id,title').eq('event_id', event.id)
  if (agendaError) return json({ error: 'Não foi possível localizar os voluntários escalados.' }, 503)
  const recipients = groupVolunteerRoles((agenda ?? []).map(item => ({ volunteer_profile_id: item.volunteer_profile_id, role: item.title })))
  if (!recipients.size) return json({ ok: true, sent: 0, recipients: 0, configured: true })

  const deliveries = await Promise.all([...recipients].map(([profileId, roles]) => sendPushToUsers(client, [profileId], {
    ...scheduleNotification({ kind: 'pertencer', roles }),
    url: './#/pertencer',
    tag: `pertencer-event-${event.id}`,
  })))
  return json({ ok: true, sent: deliveries.reduce((sum, delivery) => sum + delivery.sent, 0), recipients: recipients.size, configured: deliveries.every(delivery => delivery.configured) })
})
