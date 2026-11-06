import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AppRole = 'admin' | 'team'
type AuthContextValue = { session: Session | null; role: AppRole | null; displayName: string | null; loading: boolean; refreshProfile: () => Promise<void> }
const AuthContext = createContext<AuthContextValue>({ session: null, role: null, displayName: null, loading: true, refreshProfile: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<AppRole | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    let active = true
    async function updateProfile(nextSession: Session | null) {
      if (!nextSession) {
        if (active) { setRole(null); setDisplayName(null) }
        return
      }
      const { data, error } = await supabase!.from('profiles').select('role, active, display_name').eq('id', nextSession.user.id).maybeSingle()
      if (!active) return
      setRole(!error && data?.active && (data.role === 'admin' || data.role === 'team') ? data.role : null)
      setDisplayName(!error && data?.active ? data.display_name : null)
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (active) {
        setSession(data.session)
        await updateProfile(data.session)
        setLoading(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(true)
      void updateProfile(nextSession).finally(() => { if (active) setLoading(false) })
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function refreshProfile() {
    if (!supabase || !session?.user.id) return
    const { data, error } = await supabase.from('profiles').select('role, active, display_name').eq('id', session.user.id).maybeSingle()
    if (error || !data?.active) return
    setRole(data.role === 'admin' || data.role === 'team' ? data.role : null)
    setDisplayName(data.display_name)
  }

  const value = useMemo(() => ({ session, role, displayName, loading, refreshProfile }), [session, role, displayName, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
