import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authStorage } from './authStorage'
import { isDesktop } from './platform'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when the .env has both values — otherwise the app stays local-only. */
export const isSupabaseConfigured = Boolean(url && key)

/**
 * Single Supabase client for the app.
 * - Desktop: PKCE, session in the app-data file store, no URL detection (we
 *   exchange the code ourselves from the loopback callback).
 * - Web: PKCE, session in localStorage (default), detectSessionInUrl so the
 *   standard OAuth redirect completes automatically on return.
 * Null when not configured.
 */
const authOptions = isDesktop
  ? {
      flowType: 'pkce' as const,
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage: authStorage,
    }
  : {
      flowType: 'pkce' as const,
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    }

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, key as string, { auth: authOptions })
  : null
