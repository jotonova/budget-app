// ── Income ────────────────────────────────────────────────────────────────────

export interface IncomeSource {
  id: string
  name: string
  monthly: number
}

// ── Group ────────────────────────────────────────────────────────────────────

export interface Group {
  id: string
  name: string
  essential: boolean
  order: number
}

// ── Category (line item) ──────────────────────────────────────────────────────

export interface Category {
  id: string
  /** null for standalones like Groceries, AmEx, Amazon */
  groupId: string | null
  name: string
  budgeted: number
  essential: boolean
  /** true = recurring bill auto-charged on 1st; never show warning colors */
  fixed: boolean
  alertThreshold: number
  order: number
  notes: string
  /** "savings" = special savings bucket; "standard" (default) = normal spend category */
  type?: 'standard' | 'savings'
}

// ── Payment Method ────────────────────────────────────────────────────────────

export interface PaymentMethod {
  id: string
  name: string
  order: number
}

// ── Expense ───────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  categoryId: string
  amount: number
  /** ISO date string YYYY-MM-DD */
  date: string
  description: string
  createdAt: string
  paymentMethodId?: string
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface LedgerSettings {
  alertThresholdDefault: number
  currency: 'USD'
  monthStartDay: number
  /** Editable main title shown in the Dashboard header (default "My Budget") */
  appTitle: string
  /** Whether the first-run onboarding flow has been completed or skipped */
  onboarded: boolean
  /** Optional display name for the budget, shown as the Dashboard header subtitle */
  budgetName?: string
  /** The last month (YYYY-MM) for which rollover was performed */
  lastRolloverMonth?: string
  /** The first month (YYYY-MM-DD) from which expense tracking began — YTD excludes earlier months */
  trackingStartDate?: string
}

// ── Onboarding ────────────────────────────────────────────────────────────────

/** Payload committed atomically when the first-run onboarding flow finishes. */
export interface OnboardingPayload {
  budgetName?: string
  income: { name: string; monthly: number }[]
  categories: { name: string; essential: boolean; budgeted: number; type?: 'standard' | 'savings' }[]
}

// ── Archived month ────────────────────────────────────────────────────────────

export interface MonthArchive {
  month: string  // YYYY-MM
  expenses: Expense[]
  archivedAt: string
}

// ── Phase 4: statement import ─────────────────────────────────────────────────

/** How a pending row was interpreted: money out (debit) vs money in (credit). */
export type TxnDirection = 'debit' | 'credit'

/** A pending row moves pending → approved | skipped. Resolved rows are KEPT
 *  (not deleted) so their dedupKey blocks re-imports of the same transaction. */
export type PendingStatus = 'pending' | 'approved' | 'skipped'

/** An imported statement line awaiting human review. Nothing here touches the
 *  budget until it's approved into an Expense / OneTimeIncome. */
export interface PendingTransaction {
  id: string
  /** Stable de-dup key: OFX FITID (+account), else hash(date,amount,merchant)#occurrence. */
  dedupKey: string
  /** Where it came from — drives parsing/format. */
  source: 'csv' | 'ofx'
  /** Groups rows from one import for labelling/undo (optional). */
  importBatchId?: string
  /** Posted date, ISO YYYY-MM-DD. */
  date: string
  /** Normalized merchant token used for rule matching (e.g. "walmart"). */
  merchant: string
  /** Raw description exactly as it appeared in the statement. */
  rawDescription: string
  /** Signed amount as interpreted: negative = money out, positive = money in. */
  amount: number
  direction: TxnDirection
  status: PendingStatus
  /** Optional note when skipped (transfer, card payment, not a real expense). */
  skipReason?: string
  /** Ids of the Expense(s) / OneTimeIncome created on approval (idempotency + undo). */
  resolvedRefs?: string[]
  createdAt: string
}

/** Remembered "this merchant → this category" mapping, per household. Pre-fills
 *  the category on future imports; never auto-posts (Phase 4 keeps approval manual). */
export interface MerchantRule {
  id: string
  /** Normalized merchant token to match. */
  match: string
  categoryId: string
  paymentMethodId?: string
  createdAt: string
}

/** Irregular, non-recurring income (tax refund, gift, interest). Distinct from
 *  recurring IncomeSource so it never repeats monthly; surfaced additively on
 *  Dashboard / YTD by date. */
export interface OneTimeIncome {
  id: string
  amount: number
  /** ISO date received, YYYY-MM-DD. */
  date: string
  label: string
  note?: string
  createdAt: string
}

// ── Root data ─────────────────────────────────────────────────────────────────

export interface LedgerData {
  version: number
  income: { sources: IncomeSource[] }
  groups: Group[]
  categories: Category[]
  expenses: Expense[]
  settings: LedgerSettings
  history: MonthArchive[]
  paymentMethods: PaymentMethod[]
  // Phase 4 — statement import (empty until the importer is used)
  pendingTransactions: PendingTransaction[]
  merchantRules: MerchantRule[]
  oneTimeIncome: OneTimeIncome[]
}
