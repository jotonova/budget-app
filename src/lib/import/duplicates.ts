import type { Expense, PendingTransaction } from '../types'
import { normalizeMerchant } from './format'

const DAY = 86400000

function daysApart(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / DAY)
}

/** Meaningful word tokens (length ≥ 3) from a description, via the same merchant
 *  normalization used for rules. */
function tokens(s: string): Set<string> {
  return new Set(normalizeMerchant(s).split(' ').filter(w => w.length >= 3))
}

export interface ManualMatch {
  expense: Expense
  daysApart: number
  sharedTokens: number
}

/**
 * Does this pending row likely duplicate an expense the user already entered by
 * hand? Match = same |amount| + date within ±windowDays + a fuzzy
 * merchant/description signal (shared token, empty manual description, or an
 * exact same-day amount hit). Same-direction only (a money-out row matches a
 * spend; a money-in row matches a credit). Excludes import-created expenses so
 * it never flags a row against something this importer just approved.
 * Returns the best candidate, or null. NEVER auto-acts — the UI only surfaces it.
 */
export function findManualMatch(
  p: PendingTransaction,
  expenses: Expense[],
  excludeIds: Set<string>,
  windowDays = 3,
): ManualMatch | null {
  const target = Math.abs(p.amount)
  const pTokens = new Set<string>([
    ...tokens(p.rawDescription),
    ...p.merchant.split(' ').filter(w => w.length >= 3),
  ])
  let best: ManualMatch | null = null

  for (const e of expenses) {
    if (excludeIds.has(e.id)) continue
    // Same direction: money-out ↔ positive spend, money-in ↔ negative credit.
    if (p.direction === 'debit' ? e.amount <= 0 : e.amount >= 0) continue
    if (Math.abs(Math.abs(e.amount) - target) > 0.005) continue
    const dd = daysApart(e.date, p.date)
    if (dd > windowDays) continue

    const eTokens = tokens(e.description)
    let shared = 0
    for (const w of eTokens) if (pTokens.has(w)) shared++
    const fuzzyOk = shared >= 1 || eTokens.size === 0 || dd === 0
    if (!fuzzyOk) continue

    if (!best || dd < best.daysApart || (dd === best.daysApart && shared > best.sharedTokens)) {
      best = { expense: e, daysApart: dd, sharedTokens: shared }
    }
  }
  return best
}
