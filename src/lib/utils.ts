import { format } from 'date-fns'

/** Generate a simple UUID-like id (crypto.randomUUID where available) */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Returns the current month as YYYY-MM */
export function getCurrentMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

/** Returns today as YYYY-MM-DD */
export function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Returns yesterday as YYYY-MM-DD */
export function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return format(d, 'yyyy-MM-dd')
}

/** Returns tomorrow as YYYY-MM-DD */
export function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return format(d, 'yyyy-MM-dd')
}

/** Format as $1,234.56 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

/** Format YYYY-MM-DD as "May 1, 2026" */
export function formatDateLong(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return format(new Date(year!, month! - 1, day!), 'MMMM d, yyyy')
}

/** Format YYYY-MM-DD as "May 1" */
export function formatDateShort(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return format(new Date(year!, month! - 1, day!), 'MMMM d')
}

/** Returns the first day of the given month as YYYY-MM-DD */
export function monthStart(month: string): string {
  return `${month}-01`
}

/** Total monthly income */
export function totalMonthlyIncome(sources: { monthly: number }[]): number {
  return sources.reduce((sum, s) => sum + s.monthly, 0)
}
