import { generateId, today } from './utils'
import type { LedgerData, PaymentMethod } from './types'

// ── Payment Methods ───────────────────────────────────────────────────────────
// A small generic starter set so the Payment Method dropdown isn't empty.
// Fully editable — the user can rename, delete, or add their own in Settings.

const paymentMethods: PaymentMethod[] = [
  { id: generateId(), name: 'Cash',        order: 0 },
  { id: generateId(), name: 'Debit Card',  order: 1 },
  { id: generateId(), name: 'Credit Card', order: 2 },
]

// ── Blank-canvas seed data ────────────────────────────────────────────────────
// A fresh install starts with no income, groups, categories, or expenses.
// Only neutral app defaults and the generic payment methods above are seeded.

export function buildSeedData(): LedgerData {
  return {
    version: 1,
    income: { sources: [] },
    groups: [],
    categories: [],
    expenses: [],
    settings: {
      alertThresholdDefault: 0.9,
      currency: 'USD',
      monthStartDay: 1,
      appTitle: 'My Budget',
      onboarded: false,
      trackingStartDate: today(),
    },
    history: [],
    paymentMethods,
  }
}
