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
}
