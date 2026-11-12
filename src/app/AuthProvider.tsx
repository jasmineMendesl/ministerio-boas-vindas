import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/with-timeout'

export type AppRole = 'admin' | 'team'
type AuthContextValue = { session: Session | null; role: AppRole | null; displayName: string | null; loading: boolean }
const AuthContext = createContext<AuthContextValue>({ session: null, role: null, displayName: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<AppRole | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const loading = !authReady || Boolean(session && profileUserId !== session.user.id)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let receivedAuthEvent = false
    // Keep the auth callback synchronous and free of Supabase API calls.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true
      if (active) { setSession(nextSession); setAuthReady(true) }
    })
    void withTimeout(supabase.auth.getSession()).then(({ data }) => {
      if (active && !receivedAuthEvent) { setSession(data.session); setAuthReady(true) }
    }).catch(() => { if (active) setAuthReady(true) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const userId = session?.user.id
    if (!supabase || !userId) {
      setRole(null); setDisplayName(null); setProfileUserId(null)
      return
    }
    let active = true
    void withTimeout(supabase.from('profiles').select('role, active, display_name').eq('id', userId).maybeSingle())
      .then(({ data, error }) => {
        if (!active) return
        setRole(!error && data?.active && (data.role === 'admin' || data.role === 'team') ? data.role : null)
        setDisplayName(!error && data?.active ? data.display_name : null)
      })
      .catch(() => { if (active) { setRole(null); setDisplayName(null) } })
      .finally(() => { if (active) setProfileUserId(userId) })
    return () => { active = false }
  }, [session?.user.id, session?.access_token])

  const value = useMemo(() => ({ session, role, displayName, loading }), [session, role, displayName, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
