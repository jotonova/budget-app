import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { generateInviteCode, normalizeInviteCode } from '../lib/inviteCode'

export interface Membership { householdId: string; name: string; role: 'owner' | 'member' }
export interface Member { userId: string; role: string }
export interface InviteInfo { code: string; expiresAt: string; maxUses: number; uses: number }

interface HouseholdState {
  loading: boolean
  busy: boolean
  households: Membership[]
  currentId: string | null
  members: Member[]
  invite: InviteInfo | null
  error: string | null
  load: () => Promise<void>
  setCurrent: (id: string) => Promise<void>
  createHousehold: (name: string) => Promise<void>
  generateInvite: () => Promise<void>
  joinByCode: (raw: string) => Promise<void>
  reset: () => void
  clearError: () => void
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

function friendlyRedeem(e: unknown): string {
  const m = errMsg(e)
  if (/invalid/i.test(m)) return 'That invite code isn’t valid. Double-check it and try again.'
  if (/expired/i.test(m)) return 'That invite code has expired — ask for a new one.'
  if (/used up/i.test(m)) return 'That invite code has been used up — ask for a new one.'
  return m || 'Could not join with that code.'
}

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  loading: false,
  busy: false,
  households: [],
  currentId: null,
  members: [],
  invite: null,
  error: null,

  reset() {
    set({ loading: false, busy: false, households: [], currentId: null, members: [], invite: null, error: null })
  },
  clearError() { set({ error: null }) },

  async load() {
    if (!supabase) return
    set({ loading: true, error: null })
    try {
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user?.id
      if (!uid) { get().reset(); return }

      // Two plain queries (no PostgREST embed, which can silently throw).
      const { data: memberRows, error } = await supabase
        .from('household_members')
        .select('household_id, role')
        .eq('user_id', uid)
      if (error) throw error

      const ids = (memberRows ?? []).map((r: any) => r.household_id)
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: hh, error: e2 } = await supabase.from('households').select('id, name').in('id', ids)
        if (e2) throw e2
        for (const h of hh ?? []) names[(h as any).id] = (h as any).name
      }

      const households: Membership[] = (memberRows ?? []).map((r: any) => ({
        householdId: r.household_id,
        role: r.role,
        name: names[r.household_id] ?? 'Household',
      }))
      const prev = get().currentId
      const currentId = prev && households.some(h => h.householdId === prev)
        ? prev
        : (households[0]?.householdId ?? null)

      set({ households, currentId })
      if (currentId) await get().setCurrent(currentId)
      else set({ members: [] })
    } catch (e) {
      set({ error: errMsg(e) })
    } finally {
      set({ loading: false })
    }
  },

  async setCurrent(id) {
    if (!supabase) return
    set({ currentId: id, invite: null })
    const { data, error } = await supabase
      .from('household_members')
      .select('user_id, role')
      .eq('household_id', id)
    if (!error) set({ members: (data ?? []).map((r: any) => ({ userId: r.user_id, role: r.role })) })
  },

  async createHousehold(name) {
    if (!supabase) return
    set({ busy: true, error: null })
    try {
      const { data, error } = await supabase.rpc('create_household', { p_name: name })
      if (error) throw error
      set({ currentId: data as string })
      await get().load()
    } catch (e) {
      set({ error: errMsg(e) })
    } finally {
      set({ busy: false })
    }
  },

  async generateInvite() {
    if (!supabase) return
    const hid = get().currentId
    if (!hid) return
    set({ busy: true, error: null })
    try {
      let lastError: unknown = null
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateInviteCode()
        const { data, error } = await supabase
          .from('invites')
          .insert({ code, household_id: hid })
          .select()
          .single()
        if (!error) {
          set({ invite: { code: data.code, expiresAt: data.expires_at, maxUses: data.max_uses, uses: data.uses } })
          lastError = null
          break
        }
        lastError = error
        if ((error as { code?: string }).code !== '23505') break // not a code collision → real error
      }
      if (lastError) throw lastError
    } catch (e) {
      set({ error: errMsg(e) })
    } finally {
      set({ busy: false })
    }
  },

  async joinByCode(raw) {
    if (!supabase) return
    const code = normalizeInviteCode(raw)
    if (!code) { set({ error: 'Enter an invite code first.' }); return }
    set({ busy: true, error: null })
    try {
      const { data, error } = await supabase.rpc('redeem_invite', { p_code: code })
      if (error) throw error
      set({ currentId: data as string })
      await get().load()
    } catch (e) {
      set({ error: friendlyRedeem(e) })
    } finally {
      set({ busy: false })
    }
  },
}))
