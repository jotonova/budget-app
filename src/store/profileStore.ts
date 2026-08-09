import { create } from 'zustand'
import { setMode, setSyncErrorHandler } from '../lib/sync'
import { loadLedger } from '../lib/persistence'
import { loadCloud, saveCloud } from '../lib/cloud'
import { startRealtime, stopRealtime } from '../lib/realtime'
import { clearVersions } from '../lib/cloudVersions'
import { useLedgerStore } from './ledgerStore'
import { useAuthStore } from './authStore'

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

/**
 * The observable authority for which budget is active: the local file, or a
 * cloud household (reads + writes + realtime). Every switch is explicit and
 * surfaces errors — no silent fallback that leaves writes going nowhere.
 */
interface ProfileState {
  mode: 'local' | 'cloud'
  householdId: string | null
  householdName: string | null
  switching: boolean
  importing: boolean
  syncError: string | null
  useLocal: () => Promise<void>
  useHousehold: (id: string, name: string) => Promise<void>
  importLocalIntoHousehold: () => Promise<number>
  setSyncError: (m: string | null) => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  mode: 'local',
  householdId: null,
  householdName: null,
  switching: false,
  importing: false,
  syncError: null,

  setSyncError(m) { set({ syncError: m }) },

  async useLocal() {
    if (get().mode === 'local' && !get().householdId) { setMode({ kind: 'local' }); return }
    stopRealtime(); clearVersions(); setMode({ kind: 'local' })
    const data = await loadLedger()
    useLedgerStore.getState().init(data)
    set({ mode: 'local', householdId: null, householdName: null, syncError: null })
  },

  async useHousehold(id, name) {
    // Already in this household and healthy — just refresh the display name.
    if (get().mode === 'cloud' && get().householdId === id && !get().syncError) {
      if (name && name !== get().householdName) set({ householdName: name })
      return
    }
    set({ switching: true, syncError: null })
    stopRealtime(); clearVersions(); setMode({ kind: 'cloud', householdId: id })
    try {
      const data = await loadCloud(id)
      useLedgerStore.getState().init(data)
      startRealtime(id, useAuthStore.getState().user?.id ?? '')
      set({ mode: 'cloud', householdId: id, householdName: name, switching: false })
    } catch (e) {
      // Never pretend to be in cloud — revert to local and surface the reason,
      // so writes don't silently go to a household we failed to open.
      setMode({ kind: 'local' })
      const local = await loadLedger()
      useLedgerStore.getState().init(local)
      set({
        mode: 'local', householdId: null, householdName: null, switching: false,
        syncError: `Couldn't open the shared household: ${errMsg(e)}`,
      })
    }
  },

  async importLocalIntoHousehold() {
    const hid = get().householdId
    if (get().mode !== 'cloud' || !hid) throw new Error('Switch into a household first.')
    set({ importing: true, syncError: null })
    try {
      const local = await loadLedger()          // local file is only READ, never modified
      await saveCloud(hid, null, local)          // upsert all local rows (prev=null → no deletes)
      const data = await loadCloud(hid)          // reload the household we just seeded
      useLedgerStore.getState().init(data)
      const count = local.income.sources.length + local.groups.length + local.categories.length
        + local.paymentMethods.length + local.expenses.length
      set({ importing: false })
      return count
    } catch (e) {
      set({ importing: false, syncError: `Import failed: ${errMsg(e)}` })
      throw e
    }
  },
}))

// Route silent cloud write-through failures into the visible sync-error state.
setSyncErrorHandler((e) => useProfileStore.getState().setSyncError(`Cloud save failed: ${errMsg(e)}`))
