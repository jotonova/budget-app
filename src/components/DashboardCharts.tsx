import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { useLedgerStore } from '../store/ledgerStore'
import { formatCurrency, getCurrentMonth } from '../lib/utils'
import { useIsMobile } from '../lib/useIsMobile'

// ── Stacked pace bars ─────────────────────────────────────────────────────────

function PaceBars({ elapsed, used, elapsedLabel, usedLabel, pacingLabel }: {
  elapsed: number
  used: number
  elapsedLabel: string
  usedLabel: string
  pacingLabel: string
}) {
  const diff = used * 100 - elapsed * 100
  let pacing = 'pacing on track'
  if (diff > 10) pacing = 'pacing high'
  else if (diff > 5) pacing = 'pacing slightly high'
  else if (diff < -10) pacing = 'well ahead of schedule'
  else if (diff < -5) pacing = 'pacing comfortably under'

  const budgetBarColor = diff > 5 ? 'var(--color-burgundy)' : 'var(--color-navy-soft, #2563eb)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '8px 0' }}>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)', marginBottom: 20, textAlign: 'center' }}>
        The Pace of the {pacingLabel}
      </p>

      {/* Month / Period elapsed bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>{elapsedLabel}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--color-navy)', fontWeight: 600 }}>{Math.round(elapsed * 100)}%</span>
        </div>
        <div style={{ height: 10, backgroundColor: 'var(--color-parchment-dark)', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(elapsed * 100, 100)}%`, height: '100%', backgroundColor: 'var(--color-navy)', borderRadius: 5, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Budget used bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>{usedLabel}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: budgetBarColor, fontWeight: 600 }}>{Math.round(used * 100)}%</span>
        </div>
        <div style={{ height: 10, backgroundColor: 'var(--color-parchment-dark)', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(used * 100, 100)}%`, height: '100%', backgroundColor: budgetBarColor, borderRadius: 5, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-ink)', textAlign: 'center', lineHeight: 1.6 }}>
        {Math.round(used * 100)}% of budget used with {Math.round(elapsed * 100)}% of the {pacingLabel.toLowerCase()} elapsed — <strong>{pacing}</strong>.
      </p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const SLICE_COLORS = {
  essential:    '#0f172a',  // navy
  nonessential: '#2563eb',  // navy-soft
  savings:      '#64748b',  // gold-deep
  remaining:    '#cbd5e1',  // gold
}

export default function DashboardCharts() {
  const isMobile = useIsMobile()
  const data = useLedgerStore(s => s.data)
  const expensesForMonth = useLedgerStore(s => s.expensesForMonth)
  const totalIncome = useLedgerStore(s => s.totalIncome)

  const month = getCurrentMonth()
  const income = totalIncome()

  const { essentialSpent, nonEssentialSpent, savingsSpent } = useMemo(() => {
    if (!data) return { essentialSpent: 0, nonEssentialSpent: 0, savingsSpent: 0 }
    const expenses = expensesForMonth(month)
    let essential = 0, nonEssential = 0, savings = 0
    for (const e of expenses) {
      const cat = data.categories.find(c => c.id === e.categoryId)
      if (!cat) continue
      if (cat.type === 'savings') savings += e.amount
      else if (cat.essential) essential += e.amount
      else nonEssential += e.amount
    }
    return { essentialSpent: essential, nonEssentialSpent: nonEssential, savingsSpent: savings }
  }, [data, expensesForMonth, month])

  const remaining = Math.max(0, income - essentialSpent - nonEssentialSpent - savingsSpent)

  const pieData = [
    { name: 'Essential', value: essentialSpent, color: SLICE_COLORS.essential },
    { name: 'Non-Essential', value: nonEssentialSpent, color: SLICE_COLORS.nonessential },
    { name: 'Savings', value: savingsSpent, color: SLICE_COLORS.savings },
    { name: 'Remaining', value: remaining, color: SLICE_COLORS.remaining },
  ].filter(d => d.value > 0)

  // Pocket watch: month elapsed
  const now = new Date()
  const [yr, mn] = month.split('-').map(Number)
  const daysInMonth = new Date(yr!, mn!, 0).getDate()
  const monthElapsed = Math.min(now.getDate() / daysInMonth, 1)
  const totalBudgeted = data?.categories.reduce((s, c) => s + c.budgeted, 0) ?? income
  const totalSpent = essentialSpent + nonEssentialSpent + savingsSpent
  const budgetUsed = totalBudgeted > 0 ? Math.min(totalSpent / totalBudgeted, 1) : 0

  return (
    <div className="grid gap-6 mb-8" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>

      {/* ── Pie chart in pocket watch frame ─── */}
      <div className="rounded-lg" style={{ border: '1px solid var(--color-gold)', backgroundColor: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)', marginBottom: 6, textAlign: 'center' }}>
          Month at a Glance
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', textAlign: 'center', marginBottom: 12 }}>
          {formatCurrency(totalSpent)} of {formatCurrency(income)}
        </p>

        {pieData.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 236, padding: '8px 0' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
              No spending recorded yet this month.
            </p>
          </div>
        ) : (
          <>
            {/* Donut */}
            {(() => {
              const donutPx = isMobile ? 176 : 220
              return (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', padding: '8px 0' }}>
                  <PieChart width={donutPx} height={donutPx} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={pieData}
                      cx={donutPx / 2}
                      cy={donutPx / 2}
                      innerRadius={isMobile ? 50 : 62}
                      outerRadius={isMobile ? 83 : 104}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      strokeWidth={1}
                      stroke="var(--color-parchment)"
                      isAnimationActive={false}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{ fontFamily: 'var(--font-body)', fontSize: 14, border: '1px solid var(--color-gold)', borderRadius: 6 }}
                    />
                  </PieChart>
                </div>
              )
            })()}

            {/* Legend below the donut */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '5px 12px', marginTop: 14 }}>
              {pieData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: d.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)' }}>
                    {d.name} — {formatCurrency(d.value)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Pace bars ─── */}
      <div className="rounded-lg p-5" style={{ border: '1px solid var(--color-gold)', backgroundColor: 'white' }}>
        <PaceBars
          elapsed={monthElapsed}
          used={budgetUsed}
          elapsedLabel="Month elapsed"
          usedLabel="Budget used"
          pacingLabel="Month"
        />
      </div>
    </div>
  )
}
