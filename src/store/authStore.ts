import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useHouseholdStore } from './householdStore'

type AuthStatus = 'loading' | 'signed-out' | 'signing-in' | 'signed-in'

interface AuthState {
  configured: boolean
  status: AuthStatus
  user: User | null
  session: Session | null
  error: string | null
  init: () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

// Must match the loopback URLs allow-listed in Supabase (Stage 0).
const REDIRECT_PORTS = [8422, 8423, 8424]
const SIGN_IN_TIMEOUT_MS = 300_000

export const useAuthStore = create<AuthState>((set, get) => ({
  configured: isSupabaseConfigured,
  status: isSupabaseConfigured ? 'loading' : 'signed-out',
  user: null,
  session: null,
  error: null,

  init() {
    if (!supabase) { set({ status: 'signed-out' }); return }
    supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session ?? null,
        user: data.session?.user ?? null,
        status: data.session ? 'signed-in' : 'signed-out',
      })
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session: session ?? null,
        user: session?.user ?? null,
        status: session ? 'signed-in' : (get().status === 'signing-in' ? 'signing-in' : 'signed-out'),
      })
    })
  },

  async signInWithGoogle() {
    if (!supabase) { set({ error: 'Cloud sync is not configured on this build.' }); return }
    set({ status: 'signing-in', error: null })
    let unlisten: (() => void) | undefined
    try {
      // 1. Start the loopback server; it returns the bound port.
      const port = await invoke<number>('oauth_start', { ports: REDIRECT_PORTS })
      const redirectTo = `http://localhost:${port}`

      // 2. Register the callback listener BEFORE opening the browser.
      let resolveUrl!: (u: string) => void
      let rejectUrl!: (e: Error) => void
      const gotCallback = new Promise<string>((res, rej) => { resolveUrl = res; rejectUrl = rej })
      const timer = setTimeout(() => rejectUrl(new Error('Sign-in timed out — please try again.')), SIGN_IN_TIMEOUT_MS)
      unlisten = await listen<string>('oauth-callback', (event) => {
        clearTimeout(timer)
        resolveUrl(event.payload)
      })

      // 3. Ask Supabase for the Google authorization URL (PKCE verifier stored).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error) throw error
      if (!data?.url) throw new Error('Could not build the sign-in URL.')

      // 4. Open the system browser and wait for the loopback redirect.
      await openUrl(data.url)
      const callbackUrl = await gotCallback

      // 5. Exchange the code for a session.
      const params = new URL(callbackUrl).searchParams
      const code = params.get('code')
      if (!code) {
        throw new Error(params.get('error_description') || params.get('error') || 'No authorization code returned.')
      }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeError) throw exchangeError
      // onAuthStateChange flips status to 'signed-in'.
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      set({ status: get().session ? 'signed-in' : 'signed-out', error: message })
    } finally {
      unlisten?.()
    }
  },

  async signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    useHouseholdStore.getState().reset()
    set({ session: null, user: null, status: 'signed-out', error: null })
  },

  clearError() { set({ error: null }) },
}))
