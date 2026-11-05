import { createClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './env'

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null
