import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  isValidPrayerRequest,
  isValidServiceDate,
  normalizeBrazilianPhone,
  normalizePrayerRequest,
  normalizeVisitorName,
} from '../_shared/visitor-validation.ts'

const successBody = {
  ok: true,
  message: 'Obrigado por compartilhar seu contato. Em breve, nossa equipe poderá falar com você.',
}

const allowedOrigins = (Deno.env.get('VISITOR_ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  }
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, x-client-info, content-type'
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) })
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashIp(ip: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(ip)))
}

function getIp(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'unknown'
}

function saoPauloToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (origin && !allowedOrigins.includes(origin)) {
    return jsonResponse({ ok: false, message: 'Origem não autorizada.' }, 403, null)
  }

  if (request.method === 'OPTIONS') {
    return origin && allowedOrigins.includes(origin)
      ? new Response(null, { status: 204, headers: corsHeaders(origin) })
      : jsonResponse({ ok: false, message: 'Origem não autorizada.' }, 403, null)
  }
  if (request.method !== 'POST') return jsonResponse({ ok: false, message: 'Método não permitido.' }, 405, origin)
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ ok: false, message: 'Solicitação inválida.' }, 415, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS')
  const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ipHashSecret = Deno.env.get('VISITOR_IP_HASH_SECRET')
  if (!supabaseUrl || (!secretKeysJson && !legacyServiceRoleKey) || !ipHashSecret || ipHashSecret.length < 32) {
    return jsonResponse({ ok: false, message: 'O cadastro está temporariamente indisponível.' }, 503, origin)
  }

  let secretKey = legacyServiceRoleKey
  try {
    if (secretKeysJson) {
      const secretKeys = JSON.parse(secretKeysJson) as Record<string, string>
      secretKey = secretKeys.default
    }
  } catch {
    return jsonResponse({ ok: false, message: 'O cadastro está temporariamente indisponível.' }, 503, origin)
  }
  if (!secretKey) return jsonResponse({ ok: false, message: 'O cadastro está temporariamente indisponível.' }, 503, origin)

  let payload: {
    name?: unknown
    phone?: unknown
    visitedOn?: unknown
    prayerRequest?: unknown
    contactConsent?: unknown
    website?: unknown
    startedAt?: unknown
  }
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 16384) {
      return jsonResponse({ ok: false, message: 'Solicitação inválida.' }, 413, origin)
    }
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse({ ok: false, message: 'Confira os dados e tente novamente.' }, 400, origin)
    }
    payload = parsed as typeof payload
  } catch {
    return jsonResponse({ ok: false, message: 'Confira os dados e tente novamente.' }, 400, origin)
  }

  // Honeypot and minimum completion time reduce automated submissions without
  // exposing whether a phone number already exists in the private database.
  if (typeof payload.website === 'string' && payload.website.trim().length > 0) {
    return jsonResponse(successBody, 200, origin)
  }
  if (typeof payload.startedAt !== 'number' || Date.now() - payload.startedAt < 900) {
    return jsonResponse(successBody, 200, origin)
  }

  let client: ReturnType<typeof createClient>
  try {
    client = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  } catch {
    return jsonResponse({ ok: false, message: 'O cadastro está temporariamente indisponível.' }, 503, origin)
  }

  try {
    const ipDigest = await hashIp(getIp(request), ipHashSecret)
    const { data: allowed, error: rateError } = await client.rpc('consume_public_visitor_rate_limit', {
      p_ip_digest: ipDigest,
    })
    if (rateError) return jsonResponse({ ok: false, message: 'O cadastro está temporariamente indisponível.' }, 503, origin)
    if (!allowed) return jsonResponse({ ok: false, message: 'Não foi possível enviar agora. Tente novamente mais tarde.' }, 429, origin)

    const fullName = typeof payload.name === 'string' ? normalizeVisitorName(payload.name) : null
    const phone = typeof payload.phone === 'string' ? normalizeBrazilianPhone(payload.phone) : null
    const visitedOn = typeof payload.visitedOn === 'string' && isValidServiceDate(payload.visitedOn, saoPauloToday())
      ? payload.visitedOn
      : null
    const prayerInput = typeof payload.prayerRequest === 'string' ? payload.prayerRequest : ''
    const prayerRequest = normalizePrayerRequest(prayerInput)
    const invalidPrayerType = payload.prayerRequest !== undefined
      && payload.prayerRequest !== null
      && typeof payload.prayerRequest !== 'string'

    if (!fullName || !phone || !visitedOn || typeof payload.contactConsent !== 'boolean'
      || invalidPrayerType || !isValidPrayerRequest(prayerInput)) {
      return jsonResponse({ ok: false, message: 'Confira seu nome, telefone, data do culto e demais campos.' }, 400, origin)
    }

    const { error: registrationError } = await client.rpc('register_public_visitor_details', {
      p_full_name: fullName,
      p_phone_normalized: phone,
      p_visited_on: visitedOn,
      p_contact_consent: payload.contactConsent,
      p_prayer_request: prayerRequest,
    })
    if (registrationError) return jsonResponse({ ok: false, message: 'Não foi possível concluir agora. Tente novamente mais tarde.' }, 503, origin)

    return jsonResponse(successBody, 200, origin)
  } catch {
    return jsonResponse({ ok: false, message: 'Não foi possível concluir agora. Tente novamente mais tarde.' }, 503, origin)
  }
})
