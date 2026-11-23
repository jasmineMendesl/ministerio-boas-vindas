import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

Deno.serve(async request => {
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: cors })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return json({ error: 'Sessão inválida. Entre novamente.' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const secrets = Deno.env.get('SUPABASE_SECRET_KEYS')
  let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  try {
    if (secrets) serviceKey = (JSON.parse(secrets) as Record<string, string>).default ?? serviceKey
  } catch {
    return json({ error: 'O cadastro de usuários está indisponível.' }, 503)
  }
  if (!url || !serviceKey) return json({ error: 'O cadastro de usuários está indisponível.' }, 503)

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authError } = await client.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401)

  const { data: profile, error: profileError } = await client.from('profiles').select('role,active').eq('id', auth.user.id).maybeSingle()
  if (profileError) return json({ error: 'Não foi possível verificar suas permissões.' }, 503)
  if (!profile?.active || profile.role !== 'admin') return json({ error: 'Somente administradores podem cadastrar usuários.' }, 403)

  let body: Record<string, unknown>
  try {
    const value: unknown = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    body = value as Record<string, unknown>
  } catch {
    return json({ error: 'Solicitação inválida.' }, 400)
  }

  const name = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const phone = typeof body.phone === 'string' ? body.phone : ''
  const birthDate = typeof body.birth_date === 'string' ? body.birth_date : ''
  const serviceStartDate = typeof body.service_start_date === 'string' ? body.service_start_date : ''
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format()

  if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Preencha o nome e informe um e-mail válido.' }, 400)
  }
  if (password.length < 8 || new TextEncoder().encode(password).byteLength > 72) {
    return json({ error: 'Informe uma senha inicial de pelo menos 8 caracteres e até 72 bytes.' }, 400)
  }
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return json({ error: 'Informe um telefone válido com DDD.' }, 400)
  if (!isDate(birthDate) || !isDate(serviceStartDate) || birthDate > today || serviceStartDate > today || serviceStartDate < birthDate) {
    return json({ error: 'Confira a data de nascimento e a data de início no ministério.' }, 400)
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { team_registration: true },
    user_metadata: { display_name: name, team_registration: { phone, birth_date: birthDate, service_start_date: serviceStartDate } },
  })

  if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
    return json({ error: 'Já existe uma conta com esse e-mail.' }, 409)
  }
  if (error?.code === 'weak_password') return json({ error: 'A senha inicial não atende aos requisitos do sistema.' }, 400)
  if (error || !data.user) return json({ error: 'Não foi possível cadastrar o usuário.' }, 500)
  return json({ id: data.user.id }, 201)
})
