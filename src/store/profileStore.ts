import { create } from 'zustand'
import { setMode, setSyncErrorHandler } from '../lib/sync'
import { loadLedger } from '../lib/persistence'
import { loadCloud, saveCloud } from '../lib/cloud'
import { startRealtime, stopRealtime } from '../lib/realtime'
import { clearVersions } from '../lib/cloudVersions'
import { isDesktop, isWeb } from '../lib/platform'
import { useLedgerStore } from './ledgerStore'
import { useAuthStore } from './authStore'
import type { LedgerData } from '../lib/types'

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Name-idempotent import: keep only local rows whose name doesn't already exist
 * in the household, and remap references so expenses/categories point at the
 * existing rows instead of creating duplicates. Expenses keep their stable ids
 * (idempotent by id). Returns the merged upload set + how many rows are new.
 */
function mergeLocalIntoHousehold(local: LedgerData, existing: LedgerData) {
  const nameMap = <T extends { id: string; name: string }>(arr: T[]) => {
    const m = new Map<string, string>()
    for (const x of arr) if (!m.has(norm(x.name))) m.set(norm(x.name), x.id)
    return m
  }
  const exGroups = nameMap(existing.groups)
  const exCats = nameMap(existing.categories)
  const exPms = nameMap(existing.paymentMethods)
  const exInc = nameMap(existing.income.sources)

  const groupIdMap = new Map<string, string>()
  const newGroups = local.groups.filter(g => {
    const hit = exGroups.get(norm(g.name))
    groupIdMap.set(g.id, hit ?? g.id)
    return !hit
  })
  const catIdMap = new Map<string, string>()
  const newCategories = local.categories
    .filter(c => { const hit = exCats.get(norm(c.name)); catIdMap.set(c.id, hit ?? c.id); return !hit })
    .map(c => ({ ...c, groupId: c.groupId ? (groupIdMap.get(c.groupId) ?? c.groupId) : null }))
  const pmIdMap = new Map<string, string>()
  const newPaymentMethods = local.paymentMethods.filter(m => {
    const hit = exPms.get(norm(m.name))
    pmIdMap.set(m.id, hit ?? m.id)
    return !hit
  })
  const newIncome = local.income.sources.filter(s => !exInc.has(norm(s.name)))

  // All local expenses upload (stable ids → idempotent), refs remapped to kept rows.
  const expenses = local.expenses.map(e => ({
    ...e,
    categoryId: e.categoryId ? (catIdMap.get(e.categoryId) ?? e.categoryId) : e.categoryId,
    paymentMethodId: e.paymentMethodId ? (pmIdMap.get(e.paymentMethodId) ?? e.paymentMethodId) : e.paymentMethodId,
  }))

  const merged: LedgerData = {
    ...local,
    income: { sources: newIncome },
    groups: newGroups,
    categories: newCategories,
    paymentMethods: newPaymentMethods,
    expenses,
    settings: local.settings,
  }
  const added = newIncome.length + newGroups.length + newCategories.length + newPaymentMethods.length + expenses.length
  return { merged, added }
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
    if (isWeb) return // no on-device local budget on the web build
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
      // Never pretend to be in cloud — surface the reason so writes don't
      // silently go to a household we failed to open.
      setMode({ kind: 'local' })
      // Desktop can fall back to the on-device local budget; the web build has
      // no local file, so never call the Tauri path there — just surface the error.
      if (isDesktop) {
        const local = await loadLedger()
        useLedgerStore.getState().init(local)
      }
      set({
        mode: 'local', householdId: null, householdName: null, switching: false,
        syncError: `Couldn't open the shared household: ${errMsg(e)}`,
      })
    }
  },

  async importLocalIntoHousehold() {
    if (isWeb) throw new Error('There is no on-device local budget on the web app.')
    const hid = get().householdId
    if (get().mode !== 'cloud' || !hid) throw new Error('Switch into a household first.')
    set({ importing: true, syncError: null })
    try {
      const local = await loadLedger()          // local file is only READ, never modified
      const existing = await loadCloud(hid)      // current household (active rows)
      const { merged, added } = mergeLocalIntoHousehold(local, existing) // dedupe by name
      await saveCloud(hid, null, merged)         // upsert only new-by-name rows (+ all expenses)
      const data = await loadCloud(hid)          // reload the household
      useLedgerStore.getState().init(data)
      set({ importing: false })
      return added
    } catch (e) {
      set({ importing: false, syncError: `Import failed: ${errMsg(e)}` })
      throw e
    }
  },
}))

// Route silent cloud write-through failures into the visible sync-error state.
setSyncErrorHandler((e) => useProfileStore.getState().setSyncError(`Cloud save failed: ${errMsg(e)}`))
