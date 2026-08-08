import { useState } from 'react'
import type { Group, Category, Expense } from '../lib/types'
import { formatCurrency, formatDateShort, getCurrentMonth } from '../lib/utils'
import { useLedgerStore } from '../store/ledgerStore'

interface Props {
  group: Group
  categories: Category[]
  onExpenseClick: (expense: Expense) => void
  onCategoryClick: (categoryId: string) => void
}

interface StandaloneProps {
  category: Category
  onExpenseClick: (expense: Expense) => void
  onCategoryClick: (categoryId: string) => void
}

// ── Savings breakdown helper ──────────────────────────────────────────────────

function getSavingsBreakdown(expenses: Expense[]) {
  let target = 0, surplus = 0, manual = 0
  for (const e of expenses) {
    if (e.description === 'Monthly savings target — auto') target += e.amount
    else if (e.description === 'End-of-month surplus — auto') surplus += e.amount
    else manual += e.amount
  }
  return { target, surplus, manual }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

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
      className="w-full rounded-full overflow-hidden"
      style={{ height: 8, backgroundColor: 'var(--color-parchment-dark)' }}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct * 100}%`, backgroundColor: barColor }}
      />
    </div>
  )
}

// ── Expense rows shown under each line item ───────────────────────────────────

function ExpenseRows({ categoryId, onExpenseClick }: { categoryId: string; onExpenseClick: (e: Expense) => void }) {
  const expensesForMonth = useLedgerStore(s => s.expensesForMonth)
  const month = getCurrentMonth()
  const expenses = expensesForMonth(month).filter(e => e.categoryId === categoryId)

  if (expenses.length === 0) {
    return (
      <p style={{ padding: '6px 20px 10px 28px', fontSize: 15, color: 'var(--color-ink-soft)', fontStyle: 'italic' }}>
        No entries this month
      </p>
    )
  }

  return (
    <div style={{ paddingBottom: 4 }}>
      {expenses
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(expense => (
          <button
            key={expense.id}
            onClick={e => { e.stopPropagation(); onExpenseClick(expense) }}
            className="w-full text-left"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 20px 7px 28px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(201,184,138,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ fontSize: 15, color: 'var(--color-ink-soft)', fontFamily: 'var(--font-body)', minWidth: 60 }}>
              {formatDateShort(expense.date)}
            </span>
            <span style={{ flex: 1, fontSize: 16, color: 'var(--color-ink)', fontFamily: 'var(--font-body)', padding: '0 10px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {expense.description || '—'}
            </span>
            <span style={{ fontSize: 16, color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              {formatCurrency(expense.amount)}
            </span>
            <svg width={14} height={14} viewBox="0 0 14 14" style={{ marginLeft: 10, stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.4, flexShrink: 0 }}>
              <path d="M2 7h10M8 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
    </div>
  )
}

// ── Standalone category card (no group, e.g. Groceries, AmEx) ────────────────

export function StandaloneCard({ category, onExpenseClick, onCategoryClick }: StandaloneProps) {
  const [expanded, setExpanded] = useState(false)
  const month = getCurrentMonth()
  const spentForCategory = useLedgerStore(s => s.spentForCategory)
  const spent = spentForCategory(category.id, month)

  const remaining = category.budgeted - spent
  const hasbudget = category.budgeted > 0

  return (
    <div
      className="rounded-lg overflow-hidden transition-shadow duration-200 hover:shadow-md"
      style={{ border: '1px solid var(--color-gold)', backgroundColor: 'white' }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-5 focus:outline-none"
        style={{ backgroundColor: 'white' }}
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            onClick={e => { e.stopPropagation(); onCategoryClick(category.id) }}
            style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--color-navy)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            {category.name}
          </span>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)' }}>
              {formatCurrency(spent)}
              {hasbudget && <span style={{ opacity: 0.6 }}> / {formatCurrency(category.budgeted)}</span>}
            </span>
            <svg
              width={16} height={16} viewBox="0 0 16 16"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.5, flexShrink: 0 }}
            >
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        {hasbudget && (
          <>
            <ProgressBar spent={spent} budgeted={category.budgeted} fixed={category.fixed} />
            <p className="mt-2" style={{ fontSize: 15, color: 'var(--color-ink-soft)' }}>
              {remaining >= 0 ? `${formatCurrency(remaining)} remaining` : `${formatCurrency(-remaining)} over budget`}
            </p>
          </>
        )}
        {!hasbudget && (
          <p style={{ fontSize: 15, color: 'var(--color-ink-soft)', marginTop: 4 }}>
            {spent > 0 ? `${formatCurrency(spent)} spent` : 'No entries this month'}
          </p>
        )}
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-parchment-dark)', backgroundColor: 'var(--color-parchment-light)' }}>
          <ExpenseRows categoryId={category.id} onExpenseClick={onExpenseClick} />
        </div>
      )}
    </div>
  )
}

// ── Group card (expandable) ───────────────────────────────────────────────────

export default function GroupCard({ group, categories, onExpenseClick, onCategoryClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const month = getCurrentMonth()
  const spentForCategory = useLedgerStore(s => s.spentForCategory)
  const spentForGroup = useLedgerStore(s => s.spentForGroup)
  const expensesForMonth = useLedgerStore(s => s.expensesForMonth)

  const totalSpent = spentForGroup(group.id, month)
  const totalBudgeted = categories.reduce((sum, c) => sum + c.budgeted, 0)
  const fixedCount = categories.filter(c => c.fixed).length
  const paidFixed = categories.filter(c => c.fixed && spentForCategory(c.id, month) > 0).length
  const allFixed = fixedCount === categories.length
  const allSavings = categories.length > 0 && categories.every(c => c.type === 'savings')

  return (
    <div
      className="rounded-lg overflow-hidden transition-shadow duration-200 hover:shadow-md"
      style={{ border: '1px solid var(--color-gold)', backgroundColor: 'white' }}
    >
      {/* Card header — click to expand */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-5 focus:outline-none focus:ring-2 focus:ring-inset"
        style={{ backgroundColor: 'white' }}
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--color-navy)' }}>
            {group.name}
          </span>
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)' }}>
              {allSavings
                ? <>{formatCurrency(totalSpent)} <span style={{ opacity: 0.6 }}>saved</span></>
                : <>{formatCurrency(totalSpent)}<span style={{ opacity: 0.6 }}> / {formatCurrency(totalBudgeted)}</span></>}
            </span>
            <svg
              width={16} height={16} viewBox="0 0 16 16"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.5, flexShrink: 0 }}
            >
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <ProgressBar spent={totalSpent} budgeted={totalBudgeted} fixed={allFixed || allSavings} />
        {allSavings ? (() => {
          const catIds = categories.map(c => c.id)
          const exp = expensesForMonth(month).filter(e => catIds.includes(e.categoryId))
          const bd = getSavingsBreakdown(exp)
          const parts: string[] = []
          if (bd.target > 0) parts.push(`Target ${formatCurrency(bd.target)}`)
          if (bd.manual > 0) parts.push(`Manual ${formatCurrency(bd.manual)}`)
          if (bd.surplus > 0) parts.push(`Surplus ${formatCurrency(bd.surplus)}`)
          return <p className="mt-2" style={{ fontSize: 15, color: 'var(--color-ink-soft)' }}>{parts.join(' · ') || 'No savings this month'}</p>
        })() : (
          <p className="mt-2" style={{ fontSize: 15, color: 'var(--color-ink-soft)' }}>
            {allFixed
              ? `${paidFixed} of ${fixedCount} bills posted`
              : `${formatCurrency(totalBudgeted - totalSpent)} remaining`}
          </p>
        )}
      </button>

      {/* Expanded: line items, each with their expense rows */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-parchment-dark)', backgroundColor: 'var(--color-parchment-light)' }}>
          {categories
            .sort((a, b) => a.order - b.order)
            .map((cat, i) => {
              const spent = spentForCategory(cat.id, month)
              const remaining = cat.budgeted - spent
              return (
                <div key={cat.id} style={{ borderTop: i > 0 ? '1px solid var(--color-parchment-dark)' : undefined }}>
                  {/* Line item summary row */}
                  <div style={{ padding: '10px 20px 6px' }}>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 15, color: 'var(--color-ink)', fontFamily: 'var(--font-body)' }}>
                        <button
                          onClick={() => onCategoryClick(cat.id)}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: 15, color: 'var(--color-navy)', fontFamily: 'var(--font-body)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                        >
                          {cat.name}
                        </button>
                        {cat.fixed && (
                          <span className="ml-2" style={{ fontSize: 15, color: 'var(--color-ink-soft)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            fixed
                          </span>
                        )}
                      </span>
                      <div className="text-right">
                        <span style={{ fontSize: 15, fontFamily: 'var(--font-body)', color: 'var(--color-ink)' }}>
                          {cat.type === 'savings'
                            ? <>{formatCurrency(spent)} <span style={{ fontSize: 15, color: 'var(--color-ink-soft)' }}>saved</span></>
                            : formatCurrency(spent)}
                        </span>
                        {cat.budgeted > 0 && cat.type !== 'savings' && (
                          <span style={{ fontSize: 15, color: 'var(--color-ink-soft)' }}>
                            {' '}/ {formatCurrency(cat.budgeted)}
                          </span>
                        )}
                      </div>
                    </div>
                    {cat.budgeted > 0 && (
                      <div className="mt-2">
                        <ProgressBar spent={spent} budgeted={cat.budgeted} fixed={cat.fixed || cat.type === 'savings'} />
                        {cat.type === 'savings' ? (() => {
                          const catExp = expensesForMonth(month).filter(e => e.categoryId === cat.id)
                          const bd = getSavingsBreakdown(catExp)
                          const parts: string[] = []
                          if (bd.target > 0) parts.push(`Target ${formatCurrency(bd.target)}`)
                          if (bd.manual > 0) parts.push(`Manual ${formatCurrency(bd.manual)}`)
                          if (bd.surplus > 0) parts.push(`Surplus ${formatCurrency(bd.surplus)}`)
                          return <p className="mt-1" style={{ fontSize: 16, color: 'var(--color-ink-soft)' }}>{parts.join(' · ')}</p>
                        })() : (
                          <p className="mt-1" style={{ fontSize: 16, color: 'var(--color-ink-soft)' }}>
                            {remaining >= 0 ? `${formatCurrency(remaining)} remaining` : `${formatCurrency(-remaining)} over`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Expense rows for this line item */}
                  <ExpenseRows categoryId={cat.id} onExpenseClick={onExpenseClick} />
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
