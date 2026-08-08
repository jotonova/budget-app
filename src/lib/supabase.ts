import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authStorage } from './authStorage'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when the .env has both values — otherwise the app stays local-only. */
export const isSupabaseConfigured = Boolean(url && key)

/**
 * Single Supabase client for the app. PKCE flow (desktop), session persisted to
 * the app-data file store, no URL session detection (we exchange the code
 * ourselves from the loopback callback). Null when not configured.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, key as string, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storage: authStorage,
      },
    })
  : null
