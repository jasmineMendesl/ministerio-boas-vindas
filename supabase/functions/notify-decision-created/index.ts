import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendPushToUsers } from '../_shared/web-push.ts'

function normalizeOrigin(value: string): string {
  try {
    const parsed = new URL(value.trim())
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return ''
    return parsed.origin.toLowerCase()
  } catch { return '' }
}

const allowedOrigins = new Set((Deno.env.get('VISITOR_ALLOWED_ORIGINS') ?? '')
  .split(',').map(normalizeOrigin).filter(Boolean))

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  }
  const normalizedOrigin = origin ? normalizeOrigin(origin) : ''
  if (origin && (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin))) {
    return Response.json({ error: 'Origem não autorizada.' }, { status: 403, headers: responseHeaders })
  }
  if (normalizedOrigin) {
    responseHeaders['Access-Control-Allow-Origin'] = normalizedOrigin
    responseHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    responseHeaders['Access-Control-Allow-Headers'] = 'authorization, apikey, x-client-info, content-type'
    responseHeaders['Access-Control-Max-Age'] = '86400'
  }
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: responseHeaders })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const authorization = request.headers.get('authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS')
  const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authorization || !supabaseUrl || (!secretKeysJson && !legacyServiceRoleKey)) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  let serviceKey = legacyServiceRoleKey
  try {
    if (secretKeysJson) serviceKey = (JSON.parse(secretKeysJson) as Record<string, string>).default
  } catch { return json({ error: 'Serviço temporariamente indisponível.' }, 503) }
  if (!serviceKey) return json({ error: 'Serviço temporariamente indisponível.' }, 503)

  let payload: { decisionId?: unknown }
  try { payload = await request.json() as typeof payload } catch { return json({ error: 'Solicitação inválida.' }, 400) }
  if (typeof payload.decisionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.decisionId)) {
    return json({ error: 'Decisão inválida.' }, 400)
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Sessão inválida.' }, 401)

  const { data: profile, error: profileError } = await client.from('profiles')
    .select('id,role,active').eq('id', authData.user.id).maybeSingle()
  if (profileError || !profile?.active || !['admin', 'team'].includes(profile.role)) {
    return json({ error: 'Perfil sem autorização.' }, 403)
  }

  // Only the staff member who registered this decision may request its notification.
  const { data: decision, error: decisionError } = await client.from('decisions')
    .select('id,welcomed_by_user_id').eq('id', payload.decisionId).maybeSingle()
  if (decisionError || !decision || decision.welcomed_by_user_id !== authData.user.id) {
    return json({ error: 'Decisão não encontrada ou sem autorização.' }, 404)
  }

  const { data: admins, error: adminsError } = await client.from('profiles')
    .select('id').eq('role', 'admin').eq('active', true)
  if (adminsError) return json({ error: 'Não foi possível localizar os administradores.' }, 503)

  const delivery = await sendPushToUsers(client, (admins ?? []).map((admin) => admin.id), {
    title: 'Nova decisão registrada',
    body: 'Uma nova decisão foi registrada pela equipe. Acesse Aceitações / Reconciliações para consultar.',
    url: './#/decisoes',
    tag: `new-decision-${payload.decisionId}`,
  })
  return json({ ok: true, sent: delivery.sent, configured: delivery.configured })
})
