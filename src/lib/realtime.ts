import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useLedgerStore } from '../store/ledgerStore'
import { useAuthStore } from '../store/authStore'
import { getVersion, setVersion, versionKey } from './cloudVersions'
import { rowToIncome, rowToGroup, rowToPayment, rowToCategory, rowToExpense, rowToSettings } from './cloud'
import type { LedgerData } from './types'

const TABLES = ['income_sources', 'groups', 'payment_methods', 'categories', 'expenses', 'household_settings']

let channel: RealtimeChannel | null = null

/** Subscribe to live changes for a household. Applies remote edits with LWW and
 *  ignores our own echoes. */
export function startRealtime(householdId: string, myUserId: string): void {
  if (!supabase) return
  stopRealtime()

  // Ensure realtime authorizes against the signed-in user (RLS-filtered stream).
  const token = useAuthStore.getState().session?.access_token
  if (token) supabase.realtime.setAuth(token)

  const ch = supabase.channel(`household:${householdId}`)
  for (const table of TABLES) {
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      (payload: any) => handleChange(table, payload, myUserId, householdId),
    )
  }
  ch.subscribe()
  channel = ch
}

export function stopRealtime(): void {
  if (channel && supabase) supabase.removeChannel(channel)
  channel = null
}

function handleChange(table: string, payload: any, myUserId: string, householdId: string): void {
  const hasNew = payload.new && Object.keys(payload.new).length > 0
  const row = hasNew ? payload.new : payload.old
  if (!row) return

  const remove = payload.eventType === 'DELETE' || row.deleted_at != null
  const id = table === 'household_settings' ? householdId : row.id
  const key = versionKey(table, id)
  const updatedAt: string | undefined = row.updated_at
  const updatedBy: string | null = row.updated_by ?? null

  // Our own write echoing back — local state already reflects it.
  if (updatedBy && updatedBy === myUserId) {
    setVersion(key, updatedAt)
    return
  }

  // LWW: skip anything not newer than what we already have for this row.
  const prev = getVersion(key)
  if (prev && updatedAt && new Date(updatedAt).getTime() <= new Date(prev).getTime()) return
  setVersion(key, updatedAt)

  const cur = useLedgerStore.getState().data
  if (!cur) return
  useLedgerStore.setState({ data: applyRow(cur, table, row, remove) })
}

function mergeArr<T extends { id: string; order?: number }>(arr: T[], id: string, entity: T | null): T[] {
  let next = arr.filter(x => x.id !== id)
  if (entity) next = [...next, entity]
  if (next.length && typeof next[0].order === 'number') {
    next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  return next
}

function applyRow(d: LedgerData, table: string, row: any, remove: boolean): LedgerData {
  switch (table) {
    case 'household_settings':
      return { ...d, settings: rowToSettings(row) }
    case 'income_sources':
      return { ...d, income: { sources: mergeArr(d.income.sources, row.id, remove ? null : rowToIncome(row)) } }
    case 'groups':
      return { ...d, groups: mergeArr(d.groups, row.id, remove ? null : rowToGroup(row)) }
    case 'payment_methods':
      return { ...d, paymentMethods: mergeArr(d.paymentMethods, row.id, remove ? null : rowToPayment(row)) }
    case 'categories':
      return { ...d, categories: mergeArr(d.categories, row.id, remove ? null : rowToCategory(row)) }
    case 'expenses':
      return { ...d, expenses: mergeArr(d.expenses, row.id, remove ? null : rowToExpense(row)) }
    default:
      return d
  }
}
