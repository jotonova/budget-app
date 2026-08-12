import type { TxnDirection } from '../types'

// ── Column-mapping model ──────────────────────────────────────────────────────
// A profile captures exactly ONE amount encoding. `signed` = one signed column;
// `debitCredit` = two columns (money out / money in). Both are supported by the
// parser (src/lib/import/parse.ts); PNC's real export uses `signed`.

export type AmountMapping =
  | { mode: 'signed'; amountCol: string; negativeMeans: 'out' | 'in' }
  | { mode: 'debitCredit'; debitCol: string; creditCol: string }

export interface ImportProfile {
  id: string
  displayName: string
  /** Auto-detect key: the normalized header row. */
  headerSignature: string
  dateCol: string
  descriptionCol: string
  /** Currently informational; the parser extracts MM/DD/YYYY (US) from the cell. */
  dateFormat: string
  amount: AmountMapping
  builtIn?: boolean
}

/** Stable signature for a header row so a saved/built-in profile can be
 *  auto-applied when the same layout is imported again. Case/space-insensitive. */
export function headerSignature(headers: string[]): string {
  return headers.map(h => h.trim().toLowerCase().replace(/\s+/g, ' ')).join('|')
}

// ── Built-in starter profiles ─────────────────────────────────────────────────

/** PNC checking "Account Activity" export (accountActivityExport.csv):
 *  Transaction Date, Transaction Description, Amount, Category.
 *  Amount is a single signed, currency-decorated column ("- $x" / "+ $x");
 *  the Date cell carries a weekday prefix ("Tuesday - 08/11/2026"). */
export const PNC_ACCOUNT_ACTIVITY: ImportProfile = {
  id: 'builtin-pnc-account-activity',
  displayName: 'PNC Checking (Account Activity)',
  headerSignature: headerSignature(['Transaction Date', 'Transaction Description', 'Amount', 'Category']),
  dateCol: 'Transaction Date',
  descriptionCol: 'Transaction Description',
  dateFormat: 'MM/DD/YYYY',
  amount: { mode: 'signed', amountCol: 'Amount', negativeMeans: 'out' },
  builtIn: true,
}

export const BUILT_IN_PROFILES: ImportProfile[] = [PNC_ACCOUNT_ACTIVITY]

/** Find a profile whose header signature matches this file's header row.
 *  `saved` (per-household, synced) take precedence over built-ins. */
export function detectProfile(headers: string[], saved: ImportProfile[] = []): ImportProfile | null {
  const sig = headerSignature(headers)
  return [...saved, ...BUILT_IN_PROFILES].find(p => p.headerSignature === sig) ?? null
}

export type { TxnDirection }
