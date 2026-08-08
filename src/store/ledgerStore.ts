import { create } from 'zustand'
import type { LedgerData, Expense, PaymentMethod, LedgerSettings, Category, OnboardingPayload } from '../lib/types'
import { persistChange } from '../lib/sync'
import { generateId } from '../lib/utils'
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
  updateExpense: (id: string, updates: Partial<Pick<Expense, 'amount' | 'date' | 'description' | 'paymentMethodId'>>) => void

  // Settings & onboarding
  updateSettings: (patch: Partial<LedgerSettings>) => void
  commitOnboarding: (payload: OnboardingPayload) => void

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
      const newIncome = payload.income.map((inc) => ({
        id: generateId(),
        name: inc.name,
        monthly: inc.monthly,
      }))
      const baseOrder = d.categories.length
      const newCategories: Category[] = payload.categories.map((c, i) => ({
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
