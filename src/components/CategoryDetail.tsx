import { useMemo } from 'react'
import SceneHeader from './scenes/SceneHeader'
import { useLedgerStore } from '../store/ledgerStore'
import { useIsMobile } from '../lib/useIsMobile'
import { formatCurrency, formatDateShort, getCurrentMonth } from '../lib/utils'
import type { Expense } from '../lib/types'

interface Props {
  categoryId: string
  onBack: () => void
  onExpenseClick: (expense: Expense) => void
  onAddExpense: () => void
}

function ProgressBar({ spent, budgeted, fixed }: { spent: number; budgeted: number; fixed: boolean }) {
  const pct = budgeted > 0 ? Math.min(spent / budgeted, 1) : 0
  const over = budgeted > 0 && spent > budgeted
  let barColor = 'var(--color-navy-soft)'
  if (!fixed && !over) {
    if (pct >= 0.9) barColor = 'var(--color-burgundy)'
    else if (pct >= 0.75) barColor = 'var(--color-gold-deep)'
  }
  return (
    <div
      style={{ height: 12, backgroundColor: 'var(--color-parchment-dark)', borderRadius: 6, overflow: 'hidden' }}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: barColor, borderRadius: 6, transition: 'width 0.3s' }} />
    </div>
  )
}

export default function CategoryDetail({ categoryId, onBack, onExpenseClick, onAddExpense }: Props) {
  const isMobile = useIsMobile()
  const data = useLedgerStore(s => s.data)
  const expensesForMonth = useLedgerStore(s => s.expensesForMonth)
  const spentForCategory = useLedgerStore(s => s.spentForCategory)
  const month = getCurrentMonth()

  const category = useMemo(() => data?.categories.find(c => c.id === categoryId), [data, categoryId])
  const group = useMemo(() => category?.groupId ? data?.groups.find(g => g.id === category.groupId) : null, [data, category])

  // `data` MUST be in the deps: expensesForMonth is a stable zustand action ref,
  // so without `data` this memo froze at mount and showed stale rows after an edit
  // (reopening handed the modal a pre-edit expense object → "the change is gone").
  const expenses = useMemo(
    () => expensesForMonth(month).filter(e => e.categoryId === categoryId).sort((a, b) => b.date.localeCompare(a.date)),
    [data, expensesForMonth, month, categoryId],
  )

  if (!category) return null

  const spent = spentForCategory(categoryId, month)
  const remaining = category.budgeted - spent
  const pct = category.budgeted > 0 ? Math.round((spent / category.budgeted) * 100) : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader
        title={category.name}
        subtitle={group ? `${group.name}  ·  ${category.essential ? 'Essential' : 'Non-Essential'}` : (category.essential ? 'Essential' : 'Non-Essential')}
      />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: isMobile ? '20px 16px 96px' : '32px 24px 80px' }}>

        {/* Back */}
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: 0, marginBottom: 32, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.4 }}>
            <path d="M9 2L5 7l4 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Dashboard
        </button>

        {/* Budget summary card */}
        {category.budgeted > 0 ? (
          <div
            className="rounded-xl p-8 mb-8"
            style={{ backgroundColor: 'var(--color-navy)', boxShadow: '0 2px 16px rgba(26,41,66,0.18)' }}
          >
            <div className="flex items-end justify-between mb-5">
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: 6 }}>
                  Spent this month
                </p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 600, color: 'var(--color-parchment)', lineHeight: 1 }}>
                  {formatCurrency(spent)}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgba(244,237,224,0.6)', marginBottom: 4 }}>
                  of {formatCurrency(category.budgeted)} budget
                </p>
                {pct !== null && (
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-gold)' }}>
                    {pct}%
                  </p>
                )}
              </div>
            </div>
            <ProgressBar spent={spent} budgeted={category.budgeted} fixed={category.fixed} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgba(244,237,224,0.65)', marginTop: 10 }}>
              {remaining >= 0
                ? `${formatCurrency(remaining)} remaining`
                : `${formatCurrency(-remaining)} over budget`}
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl p-8 mb-8"
            style={{ backgroundColor: 'var(--color-navy)', boxShadow: '0 2px 16px rgba(26,41,66,0.18)' }}
          >
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: 6 }}>
              Spent this month
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 600, color: 'var(--color-parchment)', lineHeight: 1 }}>
              {formatCurrency(spent)}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgba(244,237,224,0.6)', marginTop: 8 }}>
              No budget set for this category
            </p>
          </div>
        )}

        {/* Section header */}
        <div style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8, marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
            Entries this month
          </span>
        </div>

        {/* Expense list */}
        {expenses.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 16, color: 'var(--color-ink-soft)', padding: '24px 0' }}>
            No entries recorded this month.
          </p>
        ) : (
          <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white', marginBottom: 24 }}>
            {expenses.map((expense, i) => (
              <button
                key={expense.id}
                onClick={() => onExpenseClick(expense)}
                className="w-full text-left"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '14px 20px',
                  borderTop: i > 0 ? '1px solid var(--color-parchment-dark)' : 'none',
                  background: 'none',
                  border: 'none',
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopStyle: 'solid',
                  borderTopColor: 'var(--color-parchment-dark)',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-parchment-light)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', minWidth: 72 }}>
                  {formatDateShort(expense.date)}
                </span>
                <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)', padding: '0 16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {expense.description || '—'}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--color-navy)', marginRight: 12 }}>
                  {formatCurrency(expense.amount)}
                </span>
                <svg width="14" height="14" viewBox="0 0 14 14" style={{ stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.4, flexShrink: 0 }}>
                  <path d="M2 7h10M8 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Add button */}
        <button
          onClick={onAddExpense}
          style={{
            padding: '16px 32px',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            backgroundColor: 'var(--color-navy)',
            color: 'var(--color-parchment)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            minHeight: 52,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Add Expense to {category.name}
        </button>
      </div>
    </div>
  )
}
