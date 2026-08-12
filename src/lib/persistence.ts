import { invoke } from '@tauri-apps/api/core'
import type { LedgerData } from './types'
import { buildSeedData } from './seedData'
import { maybeRollover } from './rollover'
import { generateId, getCurrentMonth, monthStart } from './utils'

/** One-time migration: add Savings group + category for ledgers created before Phase 2.5 */
function maybeAddSavings(data: LedgerData): LedgerData {
  // Once a ledger has been through (or skipped) first-run onboarding, the user's
  // category choices are authoritative — never resurrect a Savings category, so a
  // skipped blank canvas stays blank. Legacy ledgers predating onboarding
  // (onboarded flag absent/false) still get the one-time backfill.
  if (data.settings.onboarded) return data
  if (data.categories.some(c => c.type === 'savings')) return data

  const groupId = generateId()
  const catId = generateId()
  const maxGroupOrder = data.groups.reduce((m, g) => Math.max(m, g.order), 0)
  const month = getCurrentMonth()

  return {
    ...data,
    version: Math.max(data.version, 2),
    groups: [
      ...data.groups,
      { id: groupId, name: 'Savings', essential: true, order: maxGroupOrder + 1 },
    ],
    categories: [
      ...data.categories,
      {
        id: catId,
        groupId,
        name: 'Savings',
        budgeted: 100,
        essential: true,
        fixed: false,
        alertThreshold: 0.9,
        order: 1,
        notes: '',
        type: 'savings' as const,
      },
    ],
    expenses: [
      ...data.expenses,
      {
        id: generateId(),
        categoryId: catId,
        amount: 100,
        date: monthStart(month),
        description: 'Monthly savings target — auto',
        createdAt: new Date().toISOString(),
      },
    ],
  }
}

/** One-time migration: add paymentMethods array for ledgers created before this feature */
function maybeAddPaymentMethods(data: LedgerData): LedgerData {
  if (data.paymentMethods && data.paymentMethods.length > 0) return data
  return {
    ...data,
    paymentMethods: [
      { id: generateId(), name: 'American Express', order: 0 },
      { id: generateId(), name: 'Discover',         order: 1 },
      { id: generateId(), name: 'Mastercard',        order: 2 },
      { id: generateId(), name: 'Visa',              order: 3 },
    ],
  }
}

/** One-time migration: add the `onboarded` flag for ledgers created before onboarding existed */
function maybeAddOnboardedFlag(data: LedgerData): LedgerData {
  if (typeof data.settings.onboarded === 'boolean') return data
  return {
    ...data,
    settings: { ...data.settings, onboarded: false },
  }
}

/** One-time migration: add the editable `appTitle` for ledgers created before it existed */
function maybeAddAppTitle(data: LedgerData): LedgerData {
  if (typeof data.settings.appTitle === 'string') return data
  return {
    ...data,
    settings: { ...data.settings, appTitle: 'My Budget' },
  }
}

/** One-time migration: alert thresholds are fractions 0–1. Older data (and a
 *  previously percentage-based Settings slider) stored 50–100; convert any
 *  value > 1 to a fraction so local, cloud, and the mapper all agree. */
function maybeNormalizeThresholds(data: LedgerData): LedgerData {
  const s = data.settings.alertThresholdDefault
  const settingsNeeds = typeof s === 'number' && s > 1
  const catsNeed = data.categories.some(c => c.alertThreshold > 1)
  if (!settingsNeeds && !catsNeed) return data
  return {
    ...data,
    settings: settingsNeeds ? { ...data.settings, alertThresholdDefault: Math.min(s / 100, 1) } : data.settings,
    categories: data.categories.map(c =>
      c.alertThreshold > 1 ? { ...c, alertThreshold: Math.min(c.alertThreshold / 100, 1) } : c,
    ),
  }
}

/** One-time migration: add the Phase 4 import arrays (pending transactions,
 *  merchant rules, one-time income) for ledgers created before statement import. */
function maybeAddImportTables(data: LedgerData): LedgerData {
  if (data.pendingTransactions && data.merchantRules && data.oneTimeIncome) return data
  return {
    ...data,
    pendingTransactions: data.pendingTransactions ?? [],
    merchantRules: data.merchantRules ?? [],
    oneTimeIncome: data.oneTimeIncome ?? [],
  }
}

let _ledgerPath: string | null = null

async function getLedgerPath(): Promise<string> {
  if (_ledgerPath) return _ledgerPath
  const dir = await invoke<string>('get_app_data_dir')
  _ledgerPath = `${dir}/ledger.json`
  return _ledgerPath
}

/**
 * Loads the ledger from disk. If the file doesn't exist (first launch),
 * seeds starter budget data and writes it immediately.
 */
export async function loadLedger(): Promise<LedgerData> {
  const path = await getLedgerPath()
  try {
    const raw = await invoke<string>('read_ledger', { path })
    const loaded = JSON.parse(raw) as LedgerData
    const withSavings = maybeAddSavings(loaded)
    const withPayments = maybeAddPaymentMethods(withSavings)
    const withOnboarded = maybeAddOnboardedFlag(withPayments)
    const withAppTitle = maybeAddAppTitle(withOnboarded)
    const migrated = maybeNormalizeThresholds(withAppTitle)
    const withImport = maybeAddImportTables(migrated)
    const data = maybeRollover(withImport)
    if (data !== loaded) await saveLedger(data)
    return data
  } catch {
    // File doesn't exist — first launch; seed and persist
    const seed = buildSeedData()
    await saveLedger(seed)
    return seed
  }
}

/**
 * Stamp the LOCAL device's onboarded flag directly (bypassing the mode router).
 * Needed when onboarding finishes in cloud mode: cloud settings don't store
 * `onboarded`, so we mark it on the local file so onboarding won't reappear.
 */
export async function markDeviceOnboarded(): Promise<void> {
  const local = await loadLedger()
  if (local.settings.onboarded) return
  await saveLedger({ ...local, settings: { ...local.settings, onboarded: true } })
}

/**
 * Atomically persists the ledger to disk via temp-file + rename.
 */
export async function saveLedger(data: LedgerData): Promise<void> {
  const path = await getLedgerPath()
  const content = JSON.stringify(data, null, 2)
  await invoke('write_ledger', { path, content })
}
