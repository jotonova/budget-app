import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import type { LedgerData } from './types'
import { getCurrentMonth } from './utils'
import { isDesktop } from './platform'

/** Tracks which category+month crossings have already been notified. */
const _notified = new Set<string>()

/**
 * After adding an expense, check whether any variable category has newly
 * crossed its alert threshold this month. Fires at most once per category
 * per month crossing.
 */
export async function checkBudgetAlerts(data: LedgerData, changedCategoryId: string): Promise<void> {
  const month = getCurrentMonth()
  const cat = data.categories.find(c => c.id === changedCategoryId)
  if (!cat || cat.fixed || cat.budgeted <= 0 || cat.type === 'savings') return

  const spent = data.expenses
    .filter(e => e.categoryId === changedCategoryId && e.date.startsWith(month))
    .reduce((sum, e) => sum + e.amount, 0)

  // Thresholds are stored as fractions 0–1 (e.g. 0.9 = 90%).
  const fraction = spent / cat.budgeted
  const threshold = cat.alertThreshold ?? data.settings.alertThresholdDefault ?? 0.9

  if (fraction < threshold) return

  const key = `${changedCategoryId}:${month}`
  if (_notified.has(key)) return

  _notified.add(key)

  if (!isDesktop) return // web build: no native notifications (Stage 5 could add web push)

  try {
    let permitted = await isPermissionGranted()
    if (!permitted) {
      const result = await requestPermission()
      permitted = result === 'granted'
    }
    if (!permitted) return

    const pctStr = Math.round(fraction * 100)
    sendNotification({
      title: `${cat.name} — ${pctStr}% of budget used`,
      body: `You have spent $${spent.toFixed(2)} of the $${cat.budgeted.toFixed(2)} monthly budget.`,
    })
  } catch {
    // Notifications not available in dev browser — silently ignore
  }
}
