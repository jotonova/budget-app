import { useMemo } from 'react'
import SceneHeader from './scenes/SceneHeader'
import { useIsMobile } from '../lib/useIsMobile'
import GroupCard, { StandaloneCard } from './GroupCard'
import AlertBanner from './AlertBanner'
import DashboardCharts from './DashboardCharts'
import { useLedgerStore } from '../store/ledgerStore'
import { formatCurrency, getCurrentMonth, formatDateLong, today } from '../lib/utils'
import type { Expense } from '../lib/types'

interface Props {
  onAddExpense: () => void
  onExpenseClick: (expense: Expense) => void
  onCategoryClick: (categoryId: string) => void
  onViewLedger: () => void
  onSettings: () => void
  onYearToDate: () => void
}

function insightForDay(totalIncome: number, totalSpent: number): string {
  const month = getCurrentMonth()
  const [year, m] = month.split('-').map(Number)
  const daysInMonth = new Date(year!, m!, 0).getDate()
  const dayOfMonth = new Date().getDate()
  const dailyBudget = totalIncome / daysInMonth
  const expectedByNow = dailyBudget * dayOfMonth
  const diff = totalSpent - expectedByNow

  if (diff < -50) return `Spending is running ${formatCurrency(Math.abs(diff))} ahead of pace — well done.`
  if (diff > 100) return `Spending is ${formatCurrency(diff)} above the day-${dayOfMonth} pace. A mindful week ahead will set things right.`
  return `All is in good order. The household accounts balance well for the ${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}.`
}

export default function Dashboard({ onAddExpense, onExpenseClick, onCategoryClick, onViewLedger, onSettings, onYearToDate }: Props) {
  const data = useLedgerStore(s => s.data)
  const totalSpentFn = useLedgerStore(s => s.totalSpent)
  const totalIncomeFn = useLedgerStore(s => s.totalIncome)

  const month = getCurrentMonth()
  const totalIncome = totalIncomeFn()
  const totalSpent = totalSpentFn(month)
  const available = totalIncome - totalSpent

  const essentialGroups = useMemo(
    () => data?.groups.filter(g => g.essential).sort((a, b) => a.order - b.order) ?? [],
    [data],
  )
  const nonEssentialGroups = useMemo(
    () => data?.groups.filter(g => !g.essential).sort((a, b) => a.order - b.order) ?? [],
    [data],
  )
  const essentialStandalones = useMemo(
    () => data?.categories.filter(c => c.essential && c.groupId === null).sort((a, b) => a.order - b.order) ?? [],
    [data],
  )
  const nonEssentialStandalones = useMemo(
    () => data?.categories.filter(c => !c.essential && c.groupId === null).sort((a, b) => a.order - b.order) ?? [],
    [data],
  )

  const categoriesForGroup = (groupId: string) =>
    data?.categories.filter(c => c.groupId === groupId).sort((a, b) => a.order - b.order) ?? []

  const insight = insightForDay(totalIncome, totalSpent)
  const dateLabel = formatDateLong(today())
  const isMobile = useIsMobile()

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader
        title={data?.settings.appTitle?.trim() || 'My Budget'}
        subtitle={data?.settings.budgetName?.trim() || `Est. 2026  ·  ${dateLabel}`}
      />
      <AlertBanner />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '20px 16px 96px' : '32px 24px 64px' }}>

        {/* ── Hero card ────────────────────────────────────────────────── */}
        <div
          className="rounded-xl mb-8 p-8 text-center"
          style={{ backgroundColor: 'var(--color-navy)', boxShadow: '0 2px 16px rgba(26,41,66,0.18)' }}
        >
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: 8 }}>
            Available this month
          </p>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 600, color: 'var(--color-parchment)', lineHeight: 1.1 }}>
            {formatCurrency(available)}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'rgba(244,237,224,0.65)', marginTop: 8 }}>
            of {formatCurrency(totalIncome)} monthly income
          </p>
          {/* Mini income breakdown */}
          <div className="flex justify-center gap-8 mt-5" style={{ borderTop: '1px solid rgba(201,184,138,0.3)', paddingTop: 16 }}>
            {data?.income.sources.map(s => (
              <div key={s.id}>
                <p style={{ fontSize: 15, color: 'rgba(244,237,224,0.5)', marginBottom: 2 }}>{s.name}</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-parchment)' }}>{formatCurrency(s.monthly)}</p>
              </div>
            ))}
          </div>
        </div>

        {data && data.categories.length === 0 ? (
          /* ── Blank-canvas empty state ─────────────────────────────────── */
          <div
            className="rounded-xl mb-8 p-10 text-center"
            style={{ backgroundColor: 'var(--color-parchment-light)', border: '1px dashed var(--color-gold-deep)' }}
          >
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-navy)', marginBottom: 10 }}>
              Your budget is a blank canvas
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 20px' }}>
              Add your income sources and spending categories in Settings to start tracking your monthly budget.
            </p>
            <ActionButton primary onClick={onSettings}>Open Settings</ActionButton>
          </div>
        ) : (
        <>
        {/* ── Essential section ─────────────────────────────────────────── */}
        <SectionHeader label="Essential" />

        {/* Essential groups — 2-column grid */}
        {essentialGroups.length > 0 && (
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', alignItems: 'start' }}>
            {essentialGroups.map(group => (
              <GroupCard
                key={group.id}
                group={group}
                categories={categoriesForGroup(group.id)}
                onExpenseClick={onExpenseClick}
                onCategoryClick={onCategoryClick}
              />
            ))}
          </div>
        )}

        {/* Essential standalones */}
        {essentialStandalones.length > 0 && (
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', alignItems: 'start' }}>
            {essentialStandalones.map(cat => (
              <StandaloneCard key={cat.id} category={cat} onExpenseClick={onExpenseClick} onCategoryClick={onCategoryClick} />
            ))}
          </div>
        )}

        {/* ── Non-Essential section ─────────────────────────────────────── */}
        <SectionHeader label="Non-Essential" />

        {nonEssentialGroups.length > 0 && (
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', alignItems: 'start' }}>
            {nonEssentialGroups.map(group => (
              <GroupCard
                key={group.id}
                group={group}
                categories={categoriesForGroup(group.id)}
                onExpenseClick={onExpenseClick}
                onCategoryClick={onCategoryClick}
              />
            ))}
          </div>
        )}

        {nonEssentialStandalones.length > 0 && (
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', alignItems: 'start' }}>
            {nonEssentialStandalones.map(cat => (
              <StandaloneCard key={cat.id} category={cat} onExpenseClick={onExpenseClick} onCategoryClick={onCategoryClick} />
            ))}
          </div>
        )}

        {/* ── Charts ────────────────────────────────────────────────────── */}
        <DashboardCharts />
        </>
        )}

        {/* ── Insight card ──────────────────────────────────────────────── */}
        <div
          className="rounded-lg p-6 mt-6 mb-8"
          style={{ backgroundColor: 'var(--color-parchment-light)', border: '1px solid var(--color-gold)' }}
        >
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-soft)', marginBottom: 8 }}>
            A note for today
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 18, color: 'var(--color-ink)', lineHeight: 1.7 }}>
            "{insight}"
          </p>
        </div>

        {/* ── Action buttons ────────────────────────────────────────────── */}
        <div className="flex gap-4 flex-wrap">
          <ActionButton primary onClick={onAddExpense}>Add Expense</ActionButton>
          <ActionButton onClick={onViewLedger}>View Budget</ActionButton>
          <ActionButton onClick={onYearToDate}>Year to Date</ActionButton>
          <ActionButton onClick={onSettings}>Settings</ActionButton>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 mb-5 mt-2" style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8 }}>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--color-navy)',
      }}>
        {label}
      </span>
    </div>
  )
}

function ActionButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '14px 28px',
        borderRadius: 6,
        border: primary ? 'none' : `1px solid var(--color-navy)`,
        backgroundColor: primary ? 'var(--color-navy)' : 'transparent',
        color: primary ? 'var(--color-parchment)' : 'var(--color-navy)',
        cursor: 'pointer',
        minHeight: 48,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {children}
    </button>
  )
}
