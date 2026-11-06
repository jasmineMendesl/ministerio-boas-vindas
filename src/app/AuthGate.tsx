import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { supabase } from '../lib/supabase'

export function AuthGate() {
  const { session, role, loading } = useAuth()
  if (!supabase) {
    return <main className="grid min-h-screen place-items-center p-6"><section className="panel max-w-md p-8 text-center"><div className="brand-mark mx-auto mb-5">P</div><h1 className="text-xl font-semibold">Conecte o Supabase</h1><p className="mt-2 text-sm leading-6 text-muted">Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (ou a variável legada <code>VITE_SUPABASE_ANON_KEY</code>) no arquivo <code>.env.local</code>.</p></section></main>
  }
  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-muted">Verificando acesso…</main>
  if (!session) return <Navigate to="/login" replace />
  if (!role) return <main className="grid min-h-screen place-items-center p-6"><section className="panel max-w-md p-8 text-center"><h1 className="text-xl font-semibold">Acesso ainda não habilitado</h1><p className="mt-2 text-sm leading-6 text-muted">Sua conta precisa de um perfil ativo (admin ou team) no Ministério de Boas-Vindas. Peça a um administrador para configurar seu perfil.</p><button type="button" className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => { void supabase?.auth.signOut() }}>Sair</button></section></main>
  return <Outlet />
}
