import { useEffect, useState } from 'react'
import { useLedgerStore } from '../store/ledgerStore'
import { formatCurrency, getCurrentMonth } from '../lib/utils'

interface Alert {
  categoryId: string
  categoryName: string
  pct: number
  spent: number
  budgeted: number
}

const SESSION_KEY = 'casanova_dismissed_alerts'

function getDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function addDismissed(key: string) {
  const s = getDismissed()
  s.add(key)
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...s])) } catch { /* noop */ }
}

export default function AlertBanner() {
  const data = useLedgerStore(s => s.data)
  const expensesForMonth = useLedgerStore(s => s.expensesForMonth)
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed)

  // Recalculate dismissed from session storage when component mounts
  useEffect(() => { setDismissed(getDismissed()) }, [])

  if (!data) return null

  const month = getCurrentMonth()
  const defaultThreshold = data.settings.alertThresholdDefault

  const alerts: Alert[] = []
  for (const cat of data.categories) {
    if (cat.fixed || cat.type === 'savings' || cat.budgeted <= 0) continue
    const threshold = cat.alertThreshold ?? defaultThreshold
    const spent = expensesForMonth(month)
      .filter(e => e.categoryId === cat.id)
      .reduce((s, e) => s + e.amount, 0)
    const pct = spent / cat.budgeted
    if (pct < threshold) continue
    const key = `${cat.id}:${month}`
    if (dismissed.has(key)) continue
    alerts.push({ categoryId: cat.id, categoryName: cat.name, pct: Math.round(pct * 100), spent, budgeted: cat.budgeted })
  }

  if (alerts.length === 0) return null

  function dismiss(categoryId: string) {
    const key = `${categoryId}:${month}`
    addDismissed(key)
    setDismissed(prev => new Set([...prev, key]))
  }

  return (
    <div style={{ position: 'relative', zIndex: 20 }}>
      {alerts.map(alert => (
        <div
          key={alert.categoryId}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            backgroundColor: 'var(--color-burgundy)',
            color: 'var(--color-parchment)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, margin: 0 }}>
            <strong>Heads up</strong> — {alert.categoryName} is at {alert.pct}% of budget
            {' '}({formatCurrency(alert.spent)} of {formatCurrency(alert.budgeted)})
          </p>
          <button
            onClick={() => dismiss(alert.categoryId)}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(244,237,224,0.7)',
              fontSize: 18,
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
              flexShrink: 0,
              marginLeft: 16,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
