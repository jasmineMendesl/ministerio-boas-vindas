import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { supabase } from '../lib/supabase'

export function AuthGate() {
  const { session, loading } = useAuth()
  if (!supabase) {
    return <main className="grid min-h-screen place-items-center p-6"><section className="panel max-w-md p-8 text-center"><div className="brand-mark mx-auto mb-5">P</div><h1 className="text-xl font-semibold">Conecte o Supabase</h1><p className="mt-2 text-sm leading-6 text-muted">Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (ou a variável legada <code>VITE_SUPABASE_ANON_KEY</code>) no arquivo <code>.env.local</code>.</p></section></main>
  }
  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-muted">Verificando acesso…</main>
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
