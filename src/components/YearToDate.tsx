import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import SceneHeader from './scenes/SceneHeader'
import { useLedgerStore } from '../store/ledgerStore'
import { useIsMobile } from '../lib/useIsMobile'
import { formatCurrency, getCurrentMonth } from '../lib/utils'
import type { Expense } from '../lib/types'

interface Props {
  onBack: () => void
}

function PaceBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color }}>{Math.round(pct * 100)}%</span>
      </div>
      <div style={{ height: 10, backgroundColor: 'var(--color-parchment-dark)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct * 100, 100)}%`, height: '100%', backgroundColor: color, borderRadius: 5, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

const YEAR = new Date().getFullYear()
const SLICE_COLORS = ['#0f172a', '#2563eb', '#64748b', '#cbd5e1']

function allMonthsThisYear(): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    format(new Date(YEAR, i, 1), 'yyyy-MM'),
  )
}

export default function YearToDate({ onBack }: Props) {
  const isMobile = useIsMobile()
  const data = useLedgerStore(s => s.data)
  const expensesForMonth = useLedgerStore(s => s.expensesForMonth)
  const totalIncome = useLedgerStore(s => s.totalIncome)
  const oneTimeIncomeForYear = useLedgerStore(s => s.oneTimeIncomeForYear)

  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const currentMonth = getCurrentMonth()
  const income = totalIncome()
  const allMonths = useMemo(() => allMonthsThisYear(), [])

  // trackingStartDate as YYYY-MM for comparison (default: start of year)
  const trackingStartMonth = useMemo(() => {
    const d = data?.settings.trackingStartDate
    return d ? d.slice(0, 7) : `${YEAR}-01`
  }, [data])

  // Aggregate YTD from live expenses + history
  function getExpensesForPastMonth(month: string): Expense[] {
    if (month === currentMonth) return expensesForMonth(month)
    const archived = data?.history.find(h => h.month === month)
    if (archived) return archived.expenses
    return expensesForMonth(month) // fallback for current partial data
  }

  const monthSummaries = useMemo(() => {
    return allMonths.map(month => {
      const beforeTracking = month < trackingStartMonth
      const expenses = beforeTracking ? [] : getExpensesForPastMonth(month)
      const spent = expenses.reduce((s, e) => s + e.amount, 0)
      const budgeted = data?.categories.reduce((s, c) => s + c.budgeted, 0) ?? income
      const variance = income - spent
      let status: 'completed' | 'current' | 'future' = 'future'
      const now = getCurrentMonth()
      if (month < now) status = 'completed'
      else if (month === now) status = 'current'
      return { month, spent, budgeted, variance, status, expenses, beforeTracking }
    })
  }, [allMonths, data, expensesForMonth, currentMonth, trackingStartMonth])

  const ytdTotals = useMemo(() => {
    let totalSpent = 0, savingsSpent = 0, essentialSpent = 0, nonEssentialSpent = 0
    for (const { expenses, status, beforeTracking } of monthSummaries) {
      if (status === 'future' || beforeTracking) continue
      for (const e of expenses) {
        const cat = data?.categories.find(c => c.id === e.categoryId)
        if (!cat) continue
        if (cat.type === 'savings') savingsSpent += e.amount
        else if (cat.essential) essentialSpent += e.amount
        else nonEssentialSpent += e.amount
        totalSpent += e.amount
      }
    }
    const completedMonths = monthSummaries.filter(m => m.status !== 'future' && !m.beforeTracking).length
    // Recurring income accrued + any one-time income received this year (additive).
    const totalIncomeSoFar = income * completedMonths + oneTimeIncomeForYear(String(YEAR))
    const net = totalIncomeSoFar - totalSpent
    return { totalSpent, savingsSpent, essentialSpent, nonEssentialSpent, net, totalIncomeSoFar }
  }, [monthSummaries, data, income, oneTimeIncomeForYear])

  const ytdRemaining = Math.max(0, ytdTotals.totalIncomeSoFar - ytdTotals.totalSpent)

  // Tracking period elapsed (0–1): from trackingStartMonth to end of year
  const trackingElapsed = useMemo(() => {
    const now = new Date()
    const [startYear, startMonth] = trackingStartMonth.split('-').map(Number)
    const trackingStart = new Date(startYear, startMonth - 1, 1)
    const endOfYear = new Date(YEAR + 1, 0, 1)
    if (endOfYear <= trackingStart) return 0
    return Math.min(Math.max((now.getTime() - trackingStart.getTime()) / (endOfYear.getTime() - trackingStart.getTime()), 0), 1)
  }, [trackingStartMonth])

  const ytdBudgetUsed = useMemo(() => {
    const totalBudgeted = data?.categories.reduce((s, c) => s + c.budgeted, 0) ?? income
    const trackedMonths = monthSummaries.filter(m => m.status !== 'future' && !m.beforeTracking).length
    const totalBudgetedSoFar = totalBudgeted * trackedMonths
    return totalBudgetedSoFar > 0 ? Math.min(ytdTotals.totalSpent / totalBudgetedSoFar, 1) : 0
  }, [data, monthSummaries, ytdTotals.totalSpent, income])

  const pieData = [
    { name: 'Essential', value: ytdTotals.essentialSpent, color: SLICE_COLORS[0] },
    { name: 'Non-Essential', value: ytdTotals.nonEssentialSpent, color: SLICE_COLORS[1] },
    { name: 'Savings', value: ytdTotals.savingsSpent, color: SLICE_COLORS[2] },
    { name: 'Remaining', value: ytdRemaining, color: SLICE_COLORS[3] },
  ].filter(d => d.value > 0)

  function ytdInsight(): string {
    const savedPct = ytdTotals.totalIncomeSoFar > 0
      ? ytdTotals.savingsSpent / ytdTotals.totalIncomeSoFar
      : 0
    if (savedPct >= 0.10) return `A fine year of stewardship — ${Math.round(savedPct * 100)}% of income saved so far.`
    if (ytdTotals.essentialSpent < ytdTotals.totalIncomeSoFar * 0.55) return 'Essentials are running well within budget. A measured household indeed.'
    if (ytdTotals.net > 0) return `Steady progress through the year — ${formatCurrency(ytdTotals.net)} net across ${monthSummaries.filter(m => m.status !== 'future' && !m.beforeTracking).length} months.`
    return 'The accounts are closely balanced. Continued care will see the year through in good order.'
  }

  function catBreakdown(expenses: Expense[]) {
    if (!data) return []
    const map = new Map<string, number>()
    for (const e of expenses) map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount)
    return [...map.entries()]
      .map(([catId, amt]) => ({
        name: data.categories.find(c => c.id === catId)?.name ?? catId,
        amount: amt,
      }))
      .sort((a, b) => b.amount - a.amount)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader
        title="Year in Review"
        subtitle={`Year to Date  ·  ${YEAR}`}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '20px 16px 96px' : '32px 24px 80px' }}>

        {/* Back */}
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: 0, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.4 }}>
            <path d="M9 2L5 7l4 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </button>

        {/* ── YTD hero card ── */}
        <div
          className="rounded-xl mb-8 p-8"
          style={{ backgroundColor: 'var(--color-navy)', boxShadow: '0 2px 16px rgba(26,41,66,0.18)' }}
        >
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: 16 }}>
            Year to Date
          </p>
          <div className="grid gap-6" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)' }}>
            {[
              { label: 'Total Income', value: ytdTotals.totalIncomeSoFar },
              { label: 'Total Spent', value: ytdTotals.totalSpent },
              { label: 'Total Saved', value: ytdTotals.savingsSpent },
              { label: 'Net', value: ytdTotals.net },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'rgba(244,237,224,0.55)', marginBottom: 4 }}>{label}</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--color-parchment)', lineHeight: 1 }}>
                  {formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Monthly summary rows ── */}
        <div style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8, marginBottom: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
            Monthly Summary
          </span>
          {data?.settings.trackingStartDate && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', fontStyle: 'italic' }}>
              Tracking began {format(new Date(data.settings.trackingStartDate + 'T12:00:00'), 'MMMM d, yyyy')}
            </span>
          )}
        </div>

        <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white', marginBottom: 32 }}>
          {allMonths.map((month, i) => {
            const summary = monthSummaries[i]!
            const isFuture = summary.status === 'future'
            const isCurrent = summary.status === 'current'
            const isBeforeTracking = summary.beforeTracking
            const pct = income > 0 ? Math.min(summary.spent / income, 1) : 0
            const isExpanded = expandedMonth === month
            const breakdown = isExpanded ? catBreakdown(summary.expenses) : []

            return (
              <div key={month} style={{ borderTop: i > 0 ? '1px solid var(--color-parchment-dark)' : 'none' }}>
                <button
                  onClick={() => !isFuture && !isBeforeTracking && setExpandedMonth(isExpanded ? null : month)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '76px 1fr 64px 72px' : '120px 1fr 80px 90px',
                    alignItems: 'center',
                    padding: isMobile ? '13px 12px' : '14px 20px',
                    background: 'none',
                    border: 'none',
                    cursor: isFuture || isBeforeTracking ? 'default' : 'pointer',
                    gap: 12,
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => !isFuture && !isBeforeTracking && (e.currentTarget.style.backgroundColor = 'var(--color-parchment-light)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: isFuture || isBeforeTracking ? 'var(--color-ink-soft)' : 'var(--color-navy)', fontStyle: isFuture || isBeforeTracking ? 'italic' : 'normal' }}>
                    {format(new Date(Number(month.slice(0,4)), Number(month.slice(5,7))-1, 1), 'MMMM')}
                  </span>
                  <div>
                    {isBeforeTracking ? (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', fontStyle: 'italic' }}>before tracking began</span>
                    ) : isFuture ? (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', fontStyle: 'italic' }}>not yet</span>
                    ) : isCurrent ? (
                      <div>
                        <div style={{ height: 6, backgroundColor: 'var(--color-parchment-dark)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: 'var(--color-navy)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', fontStyle: 'italic' }}> in progress</span>
                      </div>
                    ) : (
                      <div style={{ height: 6, backgroundColor: 'var(--color-parchment-dark)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: 'var(--color-navy)', borderRadius: 3 }} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: isFuture || isBeforeTracking ? 'var(--color-ink-soft)' : 'var(--color-ink)', textAlign: 'right' }}>
                    {isFuture || isBeforeTracking ? '' : formatCurrency(summary.spent)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, textAlign: 'right', color: isFuture || isBeforeTracking ? 'transparent' : summary.variance >= 0 ? 'var(--color-navy)' : 'var(--color-burgundy)' }}>
                    {isFuture || isBeforeTracking ? '' : (summary.variance >= 0 ? '+' : '') + formatCurrency(summary.variance)}
                  </span>
                </button>

                {isExpanded && breakdown.length > 0 && (
                  <div style={{ backgroundColor: 'var(--color-parchment-light)', borderTop: '1px solid var(--color-parchment-dark)', padding: '10px 20px' }}>
                    {breakdown.map(({ name, amount }) => (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)' }}>{name}</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-navy)' }}>{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── YTD pace bars ── */}
        <div style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8, marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
            The Pace of the Year
          </span>
        </div>

        <div className="rounded-lg p-6 mb-8" style={{ border: '1px solid var(--color-gold)', backgroundColor: 'white' }}>
          <PaceBar label="Period elapsed" pct={trackingElapsed} color="var(--color-navy)" />
          {(() => {
            const diff = ytdBudgetUsed * 100 - trackingElapsed * 100
            const budgetColor = diff > 5 ? 'var(--color-burgundy)' : '#2563eb'
            let pacing = 'pacing on track'
            if (diff > 10) pacing = 'pacing high'
            else if (diff > 5) pacing = 'pacing slightly high'
            else if (diff < -10) pacing = 'well ahead of schedule'
            else if (diff < -5) pacing = 'pacing comfortably under'
            return (
              <>
                <PaceBar label="YTD budget used" pct={ytdBudgetUsed} color={budgetColor} />
                <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-ink)', lineHeight: 1.6, marginTop: 4 }}>
                  {Math.round(ytdBudgetUsed * 100)}% of the tracked period's budget used with {Math.round(trackingElapsed * 100)}% of the period elapsed — <strong>{pacing}</strong>.
                </p>
              </>
            )
          })()}
        </div>

        {/* ── YTD pie chart ── */}
        <div style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8, marginBottom: 16 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
            Year at a Glance
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          {pieData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 200, border: '1px solid var(--color-gold)', borderRadius: 12, backgroundColor: 'white', padding: 24 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
                No spending recorded yet this year.
              </p>
            </div>
          ) : (
            <>
              {/* Donut */}
              {(() => {
                const donutPx = isMobile ? 188 : 240
                return (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', border: '1px solid var(--color-gold)', borderRadius: 12, backgroundColor: 'white', padding: 24 }}>
                    <PieChart width={donutPx} height={donutPx} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={pieData}
                        cx={donutPx / 2}
                        cy={donutPx / 2}
                        innerRadius={isMobile ? 53 : 68}
                        outerRadius={isMobile ? 88 : 112}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        strokeWidth={1}
                        stroke="var(--color-parchment)"
                        isAnimationActive={false}
                      >
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        formatter={(v) => formatCurrency(Number(v))}
                        contentStyle={{ fontFamily: 'var(--font-body)', fontSize: 16, border: '1px solid var(--color-gold)', borderRadius: 6 }}
                      />
                    </PieChart>
                  </div>
                )
              })()}

              {/* Legend below the donut */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '5px 14px', marginTop: 14 }}>
                {pieData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: d.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)' }}>
                      {d.name} — {formatCurrency(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Insight card ── */}
        <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--color-parchment-light)', border: '1px solid var(--color-gold)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-soft)', marginBottom: 8 }}>
            A year in review
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 17, color: 'var(--color-ink)', lineHeight: 1.7 }}>
            "{ytdInsight()}"
          </p>
        </div>
      </div>
    </div>
  )
}
