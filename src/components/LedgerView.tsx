import { useState, useMemo } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from '../lib/platform'
import { downloadFile } from '../lib/webFiles'
import SceneHeader from './scenes/SceneHeader'
import { useLedgerStore } from '../store/ledgerStore'
import { useIsMobile } from '../lib/useIsMobile'
import { formatCurrency, formatDateShort, getCurrentMonth } from '../lib/utils'
import { buildLedgerPdf } from '../lib/exportPdf'
import type { Expense } from '../lib/types'
import { format, subMonths } from 'date-fns'

interface Props {
  onBack: () => void
  onExpenseClick: (expense: Expense) => void
}

type SortKey = 'date' | 'amount' | 'category'
type SortDir = 'asc' | 'desc'

function buildMonthOptions(): { label: string; value: string }[] {
  const opts = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i)
    opts.push({ label: format(d, 'MMMM yyyy'), value: format(d, 'yyyy-MM') })
  }
  return opts
}

export default function LedgerView({ onBack, onExpenseClick }: Props) {
  const isMobile = useIsMobile()
  const data = useLedgerStore(s => s.data)
  const expensesForMonth = useLedgerStore(s => s.expensesForMonth)

  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showCatFilter, setShowCatFilter] = useState(false)
  const [exportError, setExportError] = useState('')

  const allExpenses = useMemo(() => expensesForMonth(selectedMonth), [expensesForMonth, selectedMonth])

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>()
    if (!data) return m
    for (const c of data.categories) m.set(c.id, c.name)
    return m
  }, [data])

  const groupMap = useMemo(() => {
    const m = new Map<string, string>()
    if (!data) return m
    for (const g of data.groups) m.set(g.id, g.name)
    return m
  }, [data])

  const catLabel = (catId: string) => {
    const cat = data?.categories.find(c => c.id === catId)
    if (!cat) return categoryMap.get(catId) ?? catId
    const grpName = cat.groupId ? groupMap.get(cat.groupId) : null
    return grpName ? `${grpName} › ${cat.name}` : cat.name
  }

  const filtered = useMemo(() => {
    let list = allExpenses
    if (selectedCategories.length > 0) {
      list = list.filter(e => selectedCategories.includes(e.categoryId))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (categoryMap.get(e.categoryId) ?? '').toLowerCase().includes(q) ||
        formatCurrency(e.amount).includes(q),
      )
    }
    return list.slice().sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date') cmp = a.date.localeCompare(b.date)
      else if (sortKey === 'amount') cmp = a.amount - b.amount
      else cmp = catLabel(a.categoryId).localeCompare(catLabel(b.categoryId))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [allExpenses, selectedCategories, search, sortKey, sortDir, categoryMap])

  const total = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function toggleCategory(id: string) {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    )
  }

  async function handleExportPDF() {
    setExportError('')
    try {
      if (!data) return
      const pdf = buildLedgerPdf({ expenses: filtered, data, month: selectedMonth, catLabel })
      if (isDesktop) {
        const path = await save({
          defaultPath: `Budget-${selectedMonth}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (!path) return
        const bytes = pdf.output('arraybuffer')
        const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)))
        await invoke('write_bytes', { path, base64Content: b64 })
      } else {
        pdf.save(`Budget-${selectedMonth}.pdf`) // browser download
      }
    } catch (err) {
      setExportError(String(err))
    }
  }

  async function handleExportCSV() {
    setExportError('')
    try {
      const header = 'Date,Category,Description,Amount\n'
      const rows = filtered.map(e =>
        `${e.date},"${catLabel(e.categoryId).replace(/"/g, '""')}","${e.description.replace(/"/g, '""')}",${e.amount.toFixed(2)}`,
      ).join('\n')
      const content = header + rows
      if (isDesktop) {
        const path = await save({
          defaultPath: `ledger-${selectedMonth}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        })
        if (!path) return
        await invoke('write_ledger', { path, content })
      } else {
        downloadFile(`ledger-${selectedMonth}.csv`, content, 'text/csv;charset=utf-8')
      }
    } catch (err) {
      setExportError(String(err))
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ opacity: 0.3 }}> ↕</span>
    return <span>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  const allCats = data?.categories ?? []

  const paymentMethodTotals = useMemo(() => {
    const methods = (data?.paymentMethods ?? []).slice().sort((a, b) => a.order - b.order)
    const totals = methods.map(m => ({
      id: m.id,
      name: m.name,
      total: allExpenses.filter(e => e.paymentMethodId === m.id).reduce((s, e) => s + e.amount, 0),
    }))
    const unassignedTotal = allExpenses
      .filter(e => !e.paymentMethodId)
      .reduce((s, e) => s + e.amount, 0)
    return { methods: totals, unassignedTotal }
  }, [data?.paymentMethods, allExpenses])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader
        title="Budget Ledger"
        subtitle="A complete record of household accounts"
      />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: isMobile ? '20px 16px 96px' : '32px 24px 80px' }}>

        {/* Back */}
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: 0, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.4 }}>
            <path d="M9 2L5 7l4 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </button>

        {/* ── Filter bar ── */}
        <div
          className="rounded-lg mb-6 p-4"
          style={{ backgroundColor: 'white', border: '1px solid var(--color-gold)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {/* Month picker */}
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 14, border: '1px solid var(--color-gold)', borderRadius: 6, backgroundColor: 'white', color: 'var(--color-ink)', outline: 'none' }}
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Category filter toggle */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowCatFilter(v => !v)}
              style={{
                padding: '8px 14px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                border: `1px solid ${selectedCategories.length > 0 ? 'var(--color-navy)' : 'var(--color-gold)'}`,
                borderRadius: 6,
                backgroundColor: selectedCategories.length > 0 ? 'var(--color-navy)' : 'white',
                color: selectedCategories.length > 0 ? 'var(--color-parchment)' : 'var(--color-ink)',
                cursor: 'pointer',
              }}
            >
              {selectedCategories.length > 0 ? `${selectedCategories.length} categories` : 'All categories'}
            </button>
            {showCatFilter && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 50,
                  marginTop: 4,
                  backgroundColor: 'white',
                  border: '1px solid var(--color-gold)',
                  borderRadius: 8,
                  boxShadow: '0 4px 20px rgba(26,41,66,0.15)',
                  padding: '8px 0',
                  minWidth: 240,
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {allCats.map(cat => (
                  <label
                    key={cat.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 16px' : '7px 16px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-parchment-light)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      style={{ accentColor: 'var(--color-navy)', width: isMobile ? 22 : undefined, height: isMobile ? 22 : undefined, flexShrink: 0 }}
                    />
                    {catLabel(cat.id)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Text search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries…"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 14, border: '1px solid var(--color-gold)', borderRadius: 6, outline: 'none', color: 'var(--color-ink)', backgroundColor: 'white' }}
          />

          {/* Clear */}
          {(selectedCategories.length > 0 || search) && (
            <button
              onClick={() => { setSelectedCategories([]); setSearch('') }}
              style={{ padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 13, border: 'none', background: 'none', color: 'var(--color-ink-soft)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Clear
            </button>
          )}

          {/* Export PDF (primary) */}
          <button
            onClick={handleExportPDF}
            style={{ padding: '8px 16px', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', borderRadius: 6, backgroundColor: 'var(--color-navy)', color: 'var(--color-parchment)', cursor: 'pointer' }}
          >
            Export Report
          </button>
          {/* Export CSV (secondary) */}
          <button
            onClick={handleExportCSV}
            style={{ padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 12, border: '1px solid var(--color-gold)', borderRadius: 6, backgroundColor: 'transparent', color: 'var(--color-ink-soft)', cursor: 'pointer' }}
          >
            CSV
          </button>
        </div>

        {exportError && (
          <p style={{ color: 'var(--color-burgundy)', fontFamily: 'var(--font-body)', fontSize: 14, marginBottom: 12 }}>{exportError}</p>
        )}

        {/* ── Table ── */}
        <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white' }}>
          {/* Sticky header (hidden on mobile — rows become cards) */}
          {!isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 1fr 100px 40px',
              backgroundColor: 'var(--color-navy)',
              padding: '12px 20px',
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            {[
              { label: 'Date', key: 'date' as SortKey },
              { label: 'Category', key: 'category' as SortKey },
              { label: 'Description', key: null },
              { label: 'Amount', key: 'amount' as SortKey },
              { label: '', key: null },
            ].map((col, i) => (
              <span
                key={i}
                onClick={col.key ? () => toggleSort(col.key!) : undefined}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--color-gold)',
                  cursor: col.key ? 'pointer' : 'default',
                  userSelect: 'none',
                  textAlign: i === 3 ? 'right' : 'left',
                }}
              >
                {col.label}{col.key && <SortIcon col={col.key} />}
              </span>
            ))}
          </div>
          )}

          {/* Rows */}
          {filtered.length === 0 ? (
            <p style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--color-ink-soft)', fontSize: 16 }}>
              No entries match the current filters.
            </p>
          ) : (
            filtered.map((expense, i) => (
              <button
                key={expense.id}
                onClick={() => onExpenseClick(expense)}
                className="w-full text-left"
                style={{
                  display: isMobile ? 'flex' : 'grid',
                  flexDirection: isMobile ? 'column' : undefined,
                  gap: isMobile ? 3 : undefined,
                  gridTemplateColumns: isMobile ? undefined : '120px 1fr 1fr 100px 40px',
                  padding: isMobile ? '12px 16px' : '13px 20px',
                  minHeight: isMobile ? 56 : undefined,
                  background: 'none',
                  border: 'none',
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopStyle: 'solid',
                  borderTopColor: 'var(--color-parchment-dark)',
                  cursor: 'pointer',
                  alignItems: isMobile ? 'stretch' : 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-parchment-light)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {isMobile ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {catLabel(expense.categoryId)}
                      </span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--color-navy)', flexShrink: 0 }}>
                        {formatCurrency(expense.amount)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {expense.description || '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', flexShrink: 0 }}>
                        {formatDateShort(expense.date)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)' }}>
                      {formatDateShort(expense.date)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                      {catLabel(expense.categoryId)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                      {expense.description || '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, color: 'var(--color-navy)', textAlign: 'right' }}>
                      {formatCurrency(expense.amount)}
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" style={{ stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.4 }}>
                        <path d="M2 7h10M8 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </>
                )}
              </button>
            ))
          )}

          {/* Footer */}
          {filtered.length > 0 && (
            <div
              style={{
                display: isMobile ? 'flex' : 'grid',
                justifyContent: isMobile ? 'space-between' : undefined,
                gridTemplateColumns: isMobile ? undefined : '120px 1fr 1fr 100px 40px',
                padding: isMobile ? '12px 16px' : '12px 20px',
                borderTop: '2px double var(--color-navy)',
                backgroundColor: 'var(--color-parchment-light)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', gridColumn: isMobile ? undefined : '1 / 4' }}>
                {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--color-navy)', textAlign: 'right' }}>
                {formatCurrency(total)}
              </span>
            </div>
          )}
        </div>
        {/* ── Monthly Totals by Payment Method ── */}
        {(data?.paymentMethods ?? []).length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8, marginBottom: 16 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
                Monthly Totals by Payment Method
              </span>
            </div>
            <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white' }}>
              {paymentMethodTotals.methods.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 20px',
                    borderTop: i > 0 ? '1px solid var(--color-parchment-dark)' : 'none',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)' }}>{m.name}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, color: m.total > 0 ? 'var(--color-navy)' : 'var(--color-ink-soft)' }}>
                    {formatCurrency(m.total)}
                  </span>
                </div>
              ))}
              {paymentMethodTotals.unassignedTotal > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 20px',
                    borderTop: '1px solid var(--color-parchment-dark)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', fontStyle: 'italic' }}>Unassigned</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, color: 'var(--color-ink-soft)' }}>
                    {formatCurrency(paymentMethodTotals.unassignedTotal)}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderTop: '2px double var(--color-navy)',
                  backgroundColor: 'var(--color-parchment-light)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-soft)' }}>
                  Total
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--color-navy)' }}>
                  {formatCurrency(allExpenses.reduce((s, e) => s + e.amount, 0))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
