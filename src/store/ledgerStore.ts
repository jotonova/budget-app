import { create } from 'zustand'
import type { LedgerData, Expense, PaymentMethod, LedgerSettings, Category, OnboardingPayload, PendingTransaction, OneTimeIncome, MerchantRule } from '../lib/types'
import { persistChange } from '../lib/sync'
import { generateId, deterministicId } from '../lib/utils'
import { checkBudgetAlerts } from '../lib/notifications'

// ── State shape ───────────────────────────────────────────────────────────────

interface LedgerStore {
  data: LedgerData | null
  loading: boolean
  error: string | null

  // Lifecycle
  init: (data: LedgerData) => void

  // Expenses
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => string
  deleteExpense: (id: string) => void
  restoreExpense: (expense: Expense) => void
  updateExpense: (id: string, updates: Partial<Pick<Expense, 'amount' | 'date' | 'description' | 'paymentMethodId' | 'categoryId'>>) => void

  // Settings & onboarding
  updateSettings: (patch: Partial<LedgerSettings>) => void
  commitOnboarding: (payload: OnboardingPayload) => void

  // Statement import (Phase 4) — pending rows never touch the budget
  addPendingTransactions: (candidates: PendingTransaction[]) => number
  /** Approve a pending row into a real expense. Idempotent: the expense id is
   *  derived from the pending-row id, so re-approving / concurrent approval by
   *  both partners converges to ONE expense. Optional `note` overrides the
   *  expense description (raw bank text stays on the pending row). Returns the id. */
  approvePending: (pendingId: string, categoryId: string, paymentMethodId?: string, note?: string) => string | null
  /** Skip a pending row (optionally with a reason). It leaves the review list but
   *  stays recorded so its dedupKey blocks re-imports. */
  skipPending: (pendingId: string, reason?: string) => void
  /** Bulk-skip many pending rows in ONE write. ONLY rows currently status==='pending'
   *  are affected — approved expenses and budget totals are never touched. Skipped
   *  rows stay recorded so their dedupKeys keep blocking re-imports. Returns how
   *  many were skipped. */
  bulkSkipPending: (ids: string[], reason?: string) => number
  /** Approve a pending row as a SPLIT across categories (amounts should sum to the
   *  row total). Creates one expense per part; ids derived from the pending id.
   *  Each part may carry an optional `note` → that line's expense description. */
  approveSplit: (pendingId: string, parts: { categoryId: string; amount: number; note?: string }[], paymentMethodId?: string) => string[] | null
  /** Approve a credit (money-in) row as a REFUND credited to a category — a
   *  negative-amount expense that reduces that category's spending. Optional
   *  `note` overrides the description (default "Refund: <raw>"). */
  approveRefund: (pendingId: string, categoryId: string, paymentMethodId?: string, note?: string) => string | null
  /** Approve a credit row as ONE-TIME INCOME (windfall) with a label. */
  approveOneTimeIncome: (pendingId: string, label: string, note?: string) => string | null
  /** Remember merchant → category (per household). Pre-fills future imports; upsert by match. */
  addMerchantRule: (match: string, categoryId: string, paymentMethodId?: string) => void

  // One-time income surfacing (additive; recurring income untouched)
  oneTimeIncomeForMonth: (month: string) => number
  oneTimeIncomeForYear: (year: string) => number

  // Payment Methods
  addPaymentMethod: (name: string) => void
  updatePaymentMethod: (id: string, name: string) => void
  deletePaymentMethod: (id: string) => void
  reorderPaymentMethods: (methods: PaymentMethod[]) => void

  // Computed helpers
  expensesForMonth: (month: string) => Expense[]
  spentForCategory: (categoryId: string, month: string) => number
  spentForGroup: (groupId: string, month: string) => number
  totalSpent: (month: string) => number
  totalBudgeted: () => number
  totalIncome: () => number
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useLedgerStore = create<LedgerStore>((set, get) => ({
  data: null,
  loading: true,
  error: null,

  init(data) {
    set({ data, loading: false })
  },

  addExpense(partial) {
    const id = generateId()
    const expense: Expense = {
      id,
      createdAt: new Date().toISOString(),
      ...partial,
    }
    set((s) => {
      if (!s.data) return s
      const next = { ...s.data, expenses: [...s.data.expenses, expense] }
      persistChange(s.data, next).catch(console.error)
      checkBudgetAlerts(next, expense.categoryId).catch(console.error)
      return { data: next }
    })
    return id
  },

  deleteExpense(id) {
    set((s) => {
      if (!s.data) return s
      const next = { ...s.data, expenses: s.data.expenses.filter((e) => e.id !== id) }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  restoreExpense(expense) {
    set((s) => {
      if (!s.data) return s
      // Guard against duplicates if undo is triggered twice
      if (s.data.expenses.some((e) => e.id === expense.id)) return s
      const next = { ...s.data, expenses: [...s.data.expenses, expense] }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  updateExpense(id, updates) {
    set((s) => {
      if (!s.data) return s
      const next = {
        ...s.data,
        expenses: s.data.expenses.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  addPendingTransactions(candidates) {
    const s = get()
    if (!s.data) return 0
    // Dedup against everything already imported (pending/approved/skipped), so a
    // re-imported or overlapping statement adds nothing it's already seen.
    const existing = new Set(s.data.pendingTransactions.map((p) => p.dedupKey))
    const fresh = candidates.filter((c) => !existing.has(c.dedupKey))
    if (fresh.length === 0) return 0
    const next = { ...s.data, pendingTransactions: [...s.data.pendingTransactions, ...fresh] }
    set({ data: next })
    persistChange(s.data, next).catch(console.error)
    return fresh.length
  },

  approvePending(pendingId, categoryId, paymentMethodId, note) {
    const s = get()
    if (!s.data) return null
    const p = s.data.pendingTransactions.find((x) => x.id === pendingId)
    if (!p || p.status === 'approved') return null
    // Deterministic, valid-uuid expense id (pending ids are uuids) → idempotent
    // across re-approve and two-partner concurrency (upsert, never duplicate).
    const expenseId = pendingId
    const expense: Expense = {
      id: expenseId,
      categoryId,
      amount: Math.abs(p.amount), // expenses store positive spend
      date: p.date,
      description: note?.trim() || p.rawDescription,
      createdAt: new Date().toISOString(),
      ...(paymentMethodId ? { paymentMethodId } : {}),
    }
    const next = {
      ...s.data,
      expenses: [...s.data.expenses.filter((e) => e.id !== expenseId), expense],
      pendingTransactions: s.data.pendingTransactions.map((x) =>
        x.id === pendingId ? { ...x, status: 'approved' as const, resolvedRefs: [expenseId] } : x,
      ),
    }
    set({ data: next })
    persistChange(s.data, next).catch(console.error)
    checkBudgetAlerts(next, categoryId).catch(console.error)
    return expenseId
  },

  skipPending(pendingId, reason) {
    const s = get()
    if (!s.data) return
    const p = s.data.pendingTransactions.find((x) => x.id === pendingId)
    if (!p || p.status === 'skipped') return
    const next = {
      ...s.data,
      pendingTransactions: s.data.pendingTransactions.map((x) =>
        x.id === pendingId
          ? { ...x, status: 'skipped' as const, ...(reason ? { skipReason: reason } : {}) }
          : x,
      ),
    }
    set({ data: next })
    persistChange(s.data, next).catch(console.error)
  },

  bulkSkipPending(ids, reason) {
    const s = get()
    if (!s.data) return 0
    const idSet = new Set(ids)
    let count = 0
    const nextPending = s.data.pendingTransactions.map((x) => {
      // Guard on status==='pending' — never re-touch approved/already-skipped rows,
      // so this can't disturb any created expense or the budget.
      if (idSet.has(x.id) && x.status === 'pending') {
        count++
        return { ...x, status: 'skipped' as const, ...(reason ? { skipReason: reason } : {}) }
      }
      return x
    })
    if (count === 0) return 0
    const next = { ...s.data, pendingTransactions: nextPending }
    set({ data: next })
    persistChange(s.data, next).catch(console.error) // one write → one cloud sync
    return count
  },

  approveSplit(pendingId, parts, paymentMethodId) {
    const s = get()
    if (!s.data) return null
    const p = s.data.pendingTransactions.find((x) => x.id === pendingId)
    if (!p || p.status === 'approved') return null
    const valid = parts.filter((pt) => pt.categoryId && pt.amount > 0)
    if (valid.length === 0) return null
    const createdAt = new Date().toISOString()
    const ids: string[] = []
    const newExpenses: Expense[] = valid.map((pt, i) => {
      const id = deterministicId(`${pendingId}:${i}`) // deterministic → idempotent
      ids.push(id)
      return {
        id, categoryId: pt.categoryId, amount: Math.abs(pt.amount), date: p.date,
        description: pt.note?.trim() || p.rawDescription, createdAt,
        ...(paymentMethodId ? { paymentMethodId } : {}),
      }
    })
    const newIds = new Set(ids)
    const next = {
      ...s.data,
      expenses: [...s.data.expenses.filter((e) => !newIds.has(e.id)), ...newExpenses],
      pendingTransactions: s.data.pendingTransactions.map((x) =>
        x.id === pendingId ? { ...x, status: 'approved' as const, resolvedRefs: ids } : x,
      ),
    }
    set({ data: next })
    persistChange(s.data, next).catch(console.error)
    for (const pt of valid) checkBudgetAlerts(next, pt.categoryId).catch(console.error)
    return ids
  },

  approveRefund(pendingId, categoryId, paymentMethodId, note) {
    const s = get()
    if (!s.data) return null
    const p = s.data.pendingTransactions.find((x) => x.id === pendingId)
    if (!p || p.status === 'approved') return null
    const expenseId = pendingId
    // Negative-amount expense: reduces the category's spending, keeping the budget accurate.
    const expense: Expense = {
      id: expenseId, categoryId, amount: -Math.abs(p.amount), date: p.date,
      description: (note?.trim() || `Refund: ${p.rawDescription}`).slice(0, 200), createdAt: new Date().toISOString(),
      ...(paymentMethodId ? { paymentMethodId } : {}),
    }
    const next = {
      ...s.data,
      expenses: [...s.data.expenses.filter((e) => e.id !== expenseId), expense],
      pendingTransactions: s.data.pendingTransactions.map((x) =>
        x.id === pendingId ? { ...x, status: 'approved' as const, resolvedRefs: [expenseId] } : x,
      ),
    }
    set({ data: next })
    persistChange(s.data, next).catch(console.error)
    return expenseId
  },

  approveOneTimeIncome(pendingId, label, note) {
    const s = get()
    if (!s.data) return null
    const p = s.data.pendingTransactions.find((x) => x.id === pendingId)
    if (!p || p.status === 'approved') return null
    const incomeId = pendingId // deterministic uuid → idempotent
    const entry: OneTimeIncome = {
      id: incomeId, amount: Math.abs(p.amount), date: p.date,
      label: label.trim() || 'One-time income', createdAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    }
    const next = {
      ...s.data,
      oneTimeIncome: [...s.data.oneTimeIncome.filter((o) => o.id !== incomeId), entry],
      pendingTransactions: s.data.pendingTransactions.map((x) =>
        x.id === pendingId ? { ...x, status: 'approved' as const, resolvedRefs: [incomeId] } : x,
      ),
    }
    set({ data: next })
    persistChange(s.data, next).catch(console.error)
    return incomeId
  },

  addMerchantRule(match, categoryId, paymentMethodId) {
    const s = get()
    if (!s.data || !match) return
    const existing = s.data.merchantRules.find((r) => r.match === match)
    const rule: MerchantRule = {
      id: existing?.id ?? generateId(), match, categoryId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...(paymentMethodId ? { paymentMethodId } : {}),
    }
    const next = {
      ...s.data,
      merchantRules: [...s.data.merchantRules.filter((r) => r.match !== match), rule],
    }
    set({ data: next })
    persistChange(s.data, next).catch(console.error)
  },

  oneTimeIncomeForMonth(month) {
    const d = get().data
    if (!d) return 0
    return d.oneTimeIncome.filter((o) => o.date.startsWith(month)).reduce((sum, o) => sum + o.amount, 0)
  },

  oneTimeIncomeForYear(year) {
    const d = get().data
    if (!d) return 0
    return d.oneTimeIncome.filter((o) => o.date.startsWith(year)).reduce((sum, o) => sum + o.amount, 0)
  },

  expensesForMonth(month) {
    const data = get().data
    if (!data) return []
    return data.expenses.filter((e) => e.date.startsWith(month))
  },

  spentForCategory(categoryId, month) {
    return get()
      .expensesForMonth(month)
      .filter((e) => e.categoryId === categoryId)
      .reduce((sum, e) => sum + e.amount, 0)
  },

  spentForGroup(groupId, month) {
    const data = get().data
    if (!data) return 0
    const catIds = data.categories
      .filter((c) => c.groupId === groupId)
      .map((c) => c.id)
    return get()
      .expensesForMonth(month)
      .filter((e) => catIds.includes(e.categoryId))
      .reduce((sum, e) => sum + e.amount, 0)
  },

  totalSpent(month) {
    return get()
      .expensesForMonth(month)
      .reduce((sum, e) => sum + e.amount, 0)
  },

  totalBudgeted() {
    const data = get().data
    if (!data) return 0
    return data.categories.reduce((sum, c) => sum + c.budgeted, 0)
  },

  totalIncome() {
    const data = get().data
    if (!data) return 0
    return data.income.sources.reduce((sum, s) => sum + s.monthly, 0)
  },

  updateSettings(patch) {
    set((s) => {
      if (!s.data) return s
      const next = { ...s.data, settings: { ...s.data.settings, ...patch } }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  commitOnboarding(payload) {
    set((s) => {
      if (!s.data) return s
      const d = s.data
      // Name-idempotent: never add income/categories whose name already exists in
      // the active budget (prevents duplicates when onboarding runs into a
      // household that already has data, e.g. alongside an import).
      const norm = (x: string) => x.trim().toLowerCase()
      const existingIncome = new Set(d.income.sources.map((x) => norm(x.name)))
      const existingCats = new Set(d.categories.map((x) => norm(x.name)))
      const newIncome = payload.income
        .filter((inc) => inc.name.trim() !== '' && !existingIncome.has(norm(inc.name)))
        .map((inc) => ({ id: generateId(), name: inc.name, monthly: inc.monthly }))
      const baseOrder = d.categories.length
      const newCategories: Category[] = payload.categories
        .filter((c) => c.name.trim() !== '' && !existingCats.has(norm(c.name)))
        .map((c, i) => ({
          id: generateId(),
          groupId: null,
          name: c.name,
          budgeted: c.budgeted,
          essential: c.essential,
          fixed: false,
          alertThreshold: d.settings.alertThresholdDefault,
          order: baseOrder + i,
          notes: '',
          ...(c.type === 'savings' ? { type: 'savings' as const } : {}),
        }))
      const trimmedName = payload.budgetName?.trim()
      const next: LedgerData = {
        ...d,
        income: { sources: [...d.income.sources, ...newIncome] },
        categories: [...d.categories, ...newCategories],
        settings: {
          ...d.settings,
          onboarded: true,
          ...(trimmedName ? { budgetName: trimmedName } : {}),
        },
      }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  addPaymentMethod(name) {
    set((s) => {
      if (!s.data) return s
      const order = s.data.paymentMethods.length
      const next = {
        ...s.data,
        paymentMethods: [...s.data.paymentMethods, { id: generateId(), name, order }],
      }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  updatePaymentMethod(id, name) {
    set((s) => {
      if (!s.data) return s
      const next = {
        ...s.data,
        paymentMethods: s.data.paymentMethods.map((m) => m.id === id ? { ...m, name } : m),
      }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  deletePaymentMethod(id) {
    set((s) => {
      if (!s.data) return s
      const next = {
        ...s.data,
        paymentMethods: s.data.paymentMethods.filter((m) => m.id !== id),
        expenses: s.data.expenses.map((e) =>
          e.paymentMethodId === id ? { ...e, paymentMethodId: undefined } : e
        ),
      }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },

  reorderPaymentMethods(methods) {
    set((s) => {
      if (!s.data) return s
      const next = { ...s.data, paymentMethods: methods }
      persistChange(s.data, next).catch(console.error)
      return { data: next }
    })
  },
}))
