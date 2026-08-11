import { useState, useRef, useEffect, useMemo } from 'react'
import SceneHeader from './scenes/SceneHeader'
import { useLedgerStore } from '../store/ledgerStore'
import { useIsMobile } from '../lib/useIsMobile'
import { formatCurrency, today, yesterday, tomorrow } from '../lib/utils'
import type { Category } from '../lib/types'

interface Props {
  onSaved: (message: string, expenseId: string) => void
  onCancel: () => void
  initialCategoryId?: string
}

export default function AddExpense({ onSaved, onCancel, initialCategoryId }: Props) {
  const isMobile = useIsMobile()
  const data = useLedgerStore(s => s.data)
  const addExpense = useLedgerStore(s => s.addExpense)

  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? '')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  // Grouped category options: most recently used first (simplified: alphabetical for Phase 1)
  const allCategories = useMemo(() => {
    if (!data) return []
    const grouped: Array<{ label: string; options: Category[] }> = []

    const essentialGroups = data.groups.filter(g => g.essential).sort((a, b) => a.order - b.order)
    const nonEssentialGroups = data.groups.filter(g => !g.essential).sort((a, b) => a.order - b.order)

    const buildGroupSection = (groups: typeof essentialGroups, label: string) => {
      const opts: Category[] = []
      for (const grp of groups) {
        const cats = data.categories.filter(c => c.groupId === grp.id).sort((a, b) => a.order - b.order)
        opts.push(...cats)
      }
      const standalones = data.categories.filter(c => c.groupId === null && c.essential === (label === 'Essential')).sort((a, b) => a.order - b.order)
      opts.push(...standalones)
      if (opts.length) grouped.push({ label, options: opts })
    }

    buildGroupSection(essentialGroups, 'Essential')
    buildGroupSection(nonEssentialGroups, 'Non-Essential')
    return grouped
  }, [data])

  const flatCategories = useMemo(() => allCategories.flatMap(g => g.options), [allCategories])

  const selectedCategory = flatCategories.find(c => c.id === categoryId)

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^\d.]/g, '')
    // Allow one decimal point
    const parts = val.split('.')
    if (parts.length > 2) return
    if (parts[1] && parts[1].length > 2) return
    setAmount(val)
  }

  function handleSave() {
    const parsed = parseFloat(amount)
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid amount.')
      amountRef.current?.focus()
      return
    }
    if (!categoryId) {
      setError('Please choose a category.')
      return
    }
    setError('')

    const id = addExpense({
      categoryId,
      amount: parsed,
      date,
      description: description.trim(),
      ...(paymentMethodId ? { paymentMethodId } : {}),
    })

    const catName = selectedCategory?.name ?? 'expense'
    onSaved(`Saved ${formatCurrency(parsed)} to ${catName}`, id)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader
        title="Add Expense"
        subtitle="Record a new expense"
      />


      <div style={{ maxWidth: 600, margin: '0 auto', padding: isMobile ? '24px 16px 96px' : '40px 24px 80px' }}>

        {/* Amount */}
        <div className="mb-8">
          <label style={labelStyle}>Amount</label>
          <div className="flex items-center" style={{ border: '1px solid var(--color-gold)', borderRadius: 8, backgroundColor: 'white', overflow: 'hidden' }}>
            <span style={{ padding: '0 16px', fontSize: 32, fontFamily: 'var(--font-display)', color: 'var(--color-ink-soft)' }}>$</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.00"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 40,
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                color: 'var(--color-navy)',
                padding: '16px 16px 16px 0',
                backgroundColor: 'transparent',
              }}
            />
          </div>
        </div>

        {/* Category */}
        <div className="mb-8">
          <label style={labelStyle}>Category</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 18,
              fontFamily: 'var(--font-body)',
              color: categoryId ? 'var(--color-ink)' : 'var(--color-ink-soft)',
              border: '1px solid var(--color-gold)',
              borderRadius: 8,
              backgroundColor: 'white',
              outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath stroke='%235a6d8c' stroke-width='1.5' fill='none' stroke-linecap='round' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: 44,
            }}
          >
            <option value="">Choose a category…</option>
            {allCategories.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Payment Method */}
        <div className="mb-8">
          <label style={labelStyle}>
            Payment Method <span style={{ color: 'var(--color-ink-soft)', fontWeight: 400 }}>(optional)</span>
          </label>
          <select
            value={paymentMethodId}
            onChange={e => setPaymentMethodId(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 18,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-gold)',
              borderRadius: 8,
              backgroundColor: 'white',
              outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath stroke='%235a6d8c' stroke-width='1.5' fill='none' stroke-linecap='round' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: 44,
            }}
          >
            <option value="">Unassigned</option>
            {(data?.paymentMethods ?? []).slice().sort((a, b) => a.order - b.order).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="mb-8">
          <label style={labelStyle}>Date</label>
          {/* Quick buttons */}
          <div className="flex gap-3 mb-3">
            {[
              { label: 'Yesterday', value: yesterday() },
              { label: 'Today', value: today() },
              { label: 'Tomorrow', value: tomorrow() },
            ].map(opt => (
              <button
                key={opt.label}
                onClick={() => setDate(opt.value)}
                style={{
                  padding: '8px 18px',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderRadius: 6,
                  border: `1px solid ${date === opt.value ? 'var(--color-navy)' : 'var(--color-gold)'}`,
                  backgroundColor: date === opt.value ? 'var(--color-navy)' : 'white',
                  color: date === opt.value ? 'var(--color-parchment)' : 'var(--color-ink)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  minHeight: 44,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 17,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-gold)',
              borderRadius: 8,
              backgroundColor: 'white',
              outline: 'none',
            }}
          />
        </div>

        {/* Description */}
        <div className="mb-8">
          <label style={labelStyle}>
            Description <span style={{ color: 'var(--color-ink-soft)', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Safeway, monthly bill…"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 18,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-gold)',
              borderRadius: 8,
              backgroundColor: 'white',
              outline: 'none',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="mb-5" style={{ color: 'var(--color-burgundy)', fontFamily: 'var(--font-body)', fontSize: 15 }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-5">
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '18px 32px',
              fontSize: 16,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              backgroundColor: 'var(--color-navy)',
              color: 'var(--color-parchment)',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              minHeight: 56,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Save Entry
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '18px 24px',
              fontSize: 15,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-ink-soft)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-soft)',
  marginBottom: 10,
}
