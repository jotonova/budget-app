import { format, subMonths, getDaysInMonth } from 'date-fns'
import { generateId, getCurrentMonth, monthStart } from './utils'
import type { LedgerData, Expense, MonthArchive } from './types'

/** Returns YYYY-MM for the month preceding the given YYYY-MM. */
function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return format(subMonths(new Date(y!, m! - 1, 1), 1), 'yyyy-MM')
}

/** Returns the last calendar day of a YYYY-MM month as YYYY-MM-DD. */
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const days = getDaysInMonth(new Date(y!, m! - 1, 1))
  return `${month}-${String(days).padStart(2, '0')}`
}

/**
 * Called once on app load. If the current month differs from
 * settings.lastRolloverMonth, performs the monthly rollover:
 *   1. Surplus sweep into Savings (dated last day of prev month)
 *   2. Archive previous month
 *   3. Auto-seed fixed expenses for new month
 *   4. Auto-deposit savings target for new month
 *   5. Mark lastRolloverMonth = currentMonth
 *
 * Safe to call every time — idempotent when lastRolloverMonth matches.
 */
export function maybeRollover(data: LedgerData): LedgerData {
  const currentMonth = getCurrentMonth()
  if (data.settings.lastRolloverMonth === currentMonth) return data

  const prev = prevMonth(currentMonth)
  const prevExpenses = data.expenses.filter(e => e.date.startsWith(prev))
  const now = new Date().toISOString()

  let newExpenses = [...data.expenses]

  // ── 1. Surplus sweep ────────────────────────────────────────────────────────
  const savingsCats = data.categories.filter(c => c.type === 'savings')
  if (savingsCats.length > 0 && prevExpenses.length > 0) {
    const totalIncome = data.income.sources.reduce((s, src) => s + src.monthly, 0)
    const totalSpentPrev = prevExpenses.reduce((s, e) => s + e.amount, 0)
    const leftover = totalIncome - totalSpentPrev
    if (leftover > 0) {
      const lastDay = lastDayOf(prev)
      for (const savCat of savingsCats) {
        newExpenses.push({
          id: generateId(),
          categoryId: savCat.id,
          amount: Math.round(leftover * 100) / 100,
          date: lastDay,
          description: 'End-of-month surplus — auto',
          createdAt: now,
        } satisfies Expense)
      }
    }
  }

  // ── 2. Archive previous month ───────────────────────────────────────────────
  let history = [...data.history]
  if (prevExpenses.length > 0 || newExpenses.some(e => e.date.startsWith(prev))) {
    const archive: MonthArchive = {
      month: prev,
      expenses: newExpenses.filter(e => e.date.startsWith(prev)),
      archivedAt: now,
    }
    history = [...history.filter(h => h.month !== prev), archive]
  }

  // ── 3. Auto-seed fixed expenses for new month ───────────────────────────────
  const firstOfMonth = monthStart(currentMonth)
  const alreadySeeded = newExpenses.some(e => e.date === firstOfMonth)
  if (!alreadySeeded) {
    const fixedCats = data.categories.filter(c => c.fixed)
    for (const cat of fixedCats) {
      newExpenses.push({
        id: generateId(),
        categoryId: cat.id,
        amount: cat.budgeted,
        date: firstOfMonth,
        description: cat.name,
        createdAt: now,
      } satisfies Expense)
    }

    // ── 4. Auto-deposit savings target ─────────────────────────────────────────
    for (const savCat of savingsCats) {
      if (savCat.budgeted > 0) {
        newExpenses.push({
          id: generateId(),
          categoryId: savCat.id,
          amount: savCat.budgeted,
          date: firstOfMonth,
          description: 'Monthly savings target — auto',
          createdAt: now,
        } satisfies Expense)
      }
    }
  }

  return {
    ...data,
    expenses: newExpenses,
    history,
    settings: { ...data.settings, lastRolloverMonth: currentMonth },
  }
}
