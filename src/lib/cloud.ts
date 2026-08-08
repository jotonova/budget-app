import { supabase } from './supabase'
import { versionKey, setVersion } from './cloudVersions'
import type { LedgerData, LedgerSettings, Category, Expense, Group, IncomeSource, PaymentMethod } from './types'

// ── Row → model mappers (snake_case Supabase rows → camelCase local model) ─────
// Exported so the realtime layer applies inbound rows identically to the loader.

export function rowToIncome(r: any): IncomeSource {
  return { id: r.id, name: r.name, monthly: Number(r.monthly) }
}
export function rowToGroup(r: any): Group {
  return { id: r.id, name: r.name, essential: r.essential, order: r.sort_order }
}
export function rowToPayment(r: any): PaymentMethod {
  return { id: r.id, name: r.name, order: r.sort_order }
}
export function rowToCategory(r: any): Category {
  return {
    id: r.id, groupId: r.group_id, name: r.name, budgeted: Number(r.budgeted),
    essential: r.essential, fixed: r.fixed, alertThreshold: Number(r.alert_threshold),
    order: r.sort_order, notes: r.notes ?? '',
    ...(r.kind === 'savings' ? { type: 'savings' as const } : {}),
  }
}
export function rowToExpense(r: any): Expense {
  return {
    id: r.id, categoryId: r.category_id ?? '', amount: Number(r.amount), date: r.date,
    description: r.description ?? '', createdAt: r.created_at,
    ...(r.payment_method_id ? { paymentMethodId: r.payment_method_id } : {}),
  }
}
export function rowToSettings(s: any): LedgerSettings {
  return {
    alertThresholdDefault: Number(s?.alert_threshold_default ?? 0.9),
    currency: (s?.currency ?? 'USD') as 'USD',
    monthStartDay: s?.month_start_day ?? 1,
    appTitle: s?.app_title ?? 'My Budget',
    onboarded: true, // cloud households are already set up; `onboarded` is local-only
    budgetName: s?.budget_name ?? undefined,
    trackingStartDate: s?.tracking_start_date ?? undefined,
  }
}

// ── Model → row mappers ───────────────────────────────────────────────────────
// Active rows carry `deleted_at: null` so an upsert also un-deletes a restored
// row. `updated_at`/`updated_by` are stamped by DB triggers.

type Row = Record<string, unknown>

function incomeRows(d: LedgerData, hid: string): Row[] {
  return d.income.sources.map((s, i) => ({
    id: s.id, household_id: hid, name: s.name, monthly: s.monthly, sort_order: i, deleted_at: null,
  }))
}
function groupRows(d: LedgerData, hid: string): Row[] {
  return d.groups.map(g => ({
    id: g.id, household_id: hid, name: g.name, essential: g.essential, sort_order: g.order, deleted_at: null,
  }))
}
function categoryRows(d: LedgerData, hid: string): Row[] {
  return d.categories.map(c => ({
    id: c.id, household_id: hid, group_id: c.groupId, name: c.name, budgeted: c.budgeted,
    essential: c.essential, fixed: c.fixed, alert_threshold: c.alertThreshold, sort_order: c.order,
    notes: c.notes, kind: c.type ?? 'standard', deleted_at: null,
  }))
}
function paymentRows(d: LedgerData, hid: string): Row[] {
  return d.paymentMethods.map(m => ({
    id: m.id, household_id: hid, name: m.name, sort_order: m.order, deleted_at: null,
  }))
}
function expenseRows(d: LedgerData, hid: string): Row[] {
  return d.expenses.map(e => ({
    id: e.id, household_id: hid, category_id: e.categoryId || null,
    payment_method_id: e.paymentMethodId ?? null, amount: e.amount, date: e.date,
    description: e.description, created_at: e.createdAt, deleted_at: null,
  }))
}
function settingsRow(d: LedgerData, hid: string): Row {
  const s = d.settings
  return {
    household_id: hid,
    alert_threshold_default: s.alertThresholdDefault,
    currency: s.currency,
    month_start_day: s.monthStartDay,
    app_title: s.appTitle,
    budget_name: s.budgetName ?? null,
    tracking_start_date: s.trackingStartDate ?? null,
  }
}

// ── Diff + per-table write-through (records server versions) ───────────────────

function diff(prevRows: Row[], nextRows: Row[]) {
  const prevById = new Map(prevRows.map(r => [r.id as string, r]))
  const nextIds = new Set(nextRows.map(r => r.id as string))
  const upserts = nextRows.filter(r => {
    const p = prevById.get(r.id as string)
    return !p || JSON.stringify(p) !== JSON.stringify(r)
  })
  const deletedIds = prevRows.filter(r => !nextIds.has(r.id as string)).map(r => r.id as string)
  return { upserts, deletedIds }
}

async function syncTable(table: string, prevRows: Row[], nextRows: Row[]): Promise<void> {
  const { upserts, deletedIds } = diff(prevRows, nextRows)
  if (upserts.length) {
    const { data, error } = await supabase!.from(table).upsert(upserts).select('id, updated_at')
    if (error) throw new Error(`${table} upsert: ${error.message}`)
    for (const r of data ?? []) setVersion(versionKey(table, (r as any).id), (r as any).updated_at)
  }
  if (deletedIds.length) {
    const { data, error } = await supabase!.from(table)
      .update({ deleted_at: new Date().toISOString() }).in('id', deletedIds).select('id, updated_at')
    if (error) throw new Error(`${table} delete: ${error.message}`)
    for (const r of data ?? []) setVersion(versionKey(table, (r as any).id), (r as any).updated_at)
  }
}

export async function saveCloud(hid: string, prev: LedgerData | null, next: LedgerData): Promise<void> {
  if (!supabase) return
  const base: LedgerData = prev ?? {
    version: 1, income: { sources: [] }, groups: [], categories: [],
    expenses: [], settings: next.settings, history: [], paymentMethods: [],
  }
  await syncTable('groups', groupRows(base, hid), groupRows(next, hid))
  await syncTable('categories', categoryRows(base, hid), categoryRows(next, hid))
  await syncTable('payment_methods', paymentRows(base, hid), paymentRows(next, hid))
  await syncTable('income_sources', incomeRows(base, hid), incomeRows(next, hid))
  await syncTable('expenses', expenseRows(base, hid), expenseRows(next, hid))

  const ps = prev ? settingsRow(prev, hid) : null
  const ns = settingsRow(next, hid)
  if (!ps || JSON.stringify(ps) !== JSON.stringify(ns)) {
    const { data, error } = await supabase.from('household_settings').upsert(ns).select('updated_at').single()
    if (error) throw new Error(`settings upsert: ${error.message}`)
    setVersion(versionKey('household_settings', hid), (data as any)?.updated_at)
  }
}

// ── Load a household into a LedgerData, seeding row versions ───────────────────

export async function loadCloud(hid: string): Promise<LedgerData> {
  if (!supabase) throw new Error('Cloud sync is not configured.')
  const [inc, grp, cat, pm, exp, setRes] = await Promise.all([
    supabase.from('income_sources').select('*').eq('household_id', hid).is('deleted_at', null).order('sort_order'),
    supabase.from('groups').select('*').eq('household_id', hid).is('deleted_at', null).order('sort_order'),
    supabase.from('categories').select('*').eq('household_id', hid).is('deleted_at', null).order('sort_order'),
    supabase.from('payment_methods').select('*').eq('household_id', hid).is('deleted_at', null).order('sort_order'),
    supabase.from('expenses').select('*').eq('household_id', hid).is('deleted_at', null),
    supabase.from('household_settings').select('*').eq('household_id', hid).maybeSingle(),
  ])
  for (const r of [inc, grp, cat, pm, exp, setRes]) {
    if (r.error) throw new Error(r.error.message)
  }

  // Seed versions so LWW works from the first inbound event.
  const seed = (table: string, rows: any[]) => { for (const r of rows) setVersion(versionKey(table, r.id), r.updated_at) }
  seed('income_sources', inc.data ?? [])
  seed('groups', grp.data ?? [])
  seed('categories', cat.data ?? [])
  seed('payment_methods', pm.data ?? [])
  seed('expenses', exp.data ?? [])
  if (setRes.data) setVersion(versionKey('household_settings', hid), (setRes.data as any).updated_at)

  return {
    version: 1,
    income: { sources: (inc.data ?? []).map(rowToIncome) },
    groups: (grp.data ?? []).map(rowToGroup),
    categories: (cat.data ?? []).map(rowToCategory),
    expenses: (exp.data ?? []).map(rowToExpense),
    settings: rowToSettings(setRes.data),
    history: [],
    paymentMethods: (pm.data ?? []).map(rowToPayment),
  }
}
