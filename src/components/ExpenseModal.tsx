import { useState } from 'react'
import type { Expense } from '../lib/types'
import { today, yesterday, tomorrow } from '../lib/utils'
import { useLedgerStore } from '../store/ledgerStore'

interface Props {
  expense: Expense
  categoryName: string
  onSave: (id: string, updates: { amount: number; date: string; description: string; paymentMethodId?: string; categoryId: string }) => void
  onDelete: (expense: Expense) => void
  onCancel: () => void
}

export default function ExpenseModal({ expense, categoryName, onSave, onDelete, onCancel }: Props) {
  const data = useLedgerStore(s => s.data)
  const [amount, setAmount] = useState(expense.amount.toFixed(2))
  const [date, setDate] = useState(expense.date)
  const [description, setDescription] = useState(expense.description)
  const [paymentMethodId, setPaymentMethodId] = useState(expense.paymentMethodId ?? '')
  const [categoryId, setCategoryId] = useState(expense.categoryId)
  const [error, setError] = useState('')

  const groups = (data?.groups ?? []).slice().sort((a, b) => a.order - b.order)
  const categories = data?.categories ?? []
  const standalones = categories.filter(c => c.groupId === null).sort((a, b) => a.order - b.order)
  const liveCategoryName = categories.find(c => c.id === categoryId)?.name ?? categoryName

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Keep an optional leading minus (refunds are negative), digits and one dot.
    let v = e.target.value.replace(/[^\d.-]/g, '')
    v = v.replace(/(?!^)-/g, '') // only a leading minus
    const parts = v.replace('-', '').split('.')
    if (parts.length > 2) return
    if (parts[1] && parts[1].length > 2) return
    setAmount(v)
  }

  function handleSave() {
    const parsed = parseFloat(amount)
    // Allow negative amounts (refunds/credits); reject only empty, non-numeric, or zero.
    if (!amount || isNaN(parsed) || parsed === 0) {
      setError('Please enter a valid amount (negative is allowed for a refund).')
      return
    }
    if (!categoryId) {
      setError('Please choose a category.')
      return
    }
    setError('')
    onSave(expense.id, {
      amount: parsed,
      date,
      description: description.trim(),
      categoryId,
      ...(paymentMethodId ? { paymentMethodId } : { paymentMethodId: undefined }),
    })
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 200, backgroundColor: 'rgba(26,41,66,0.55)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl"
        style={{
          backgroundColor: 'var(--color-parchment)',
          border: '1px solid var(--color-gold)',
          boxShadow: '0 8px 40px rgba(26,41,66,0.3)',
          width: '100%',
          maxWidth: 480,
          padding: 32,
          margin: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6" style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 16 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-ink-soft)', marginBottom: 4 }}>
            Editing entry
          </p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--color-navy)', margin: 0 }}>
            {liveCategoryName}
          </h2>
        </div>

        {/* Category */}
        <div className="mb-5">
          <label style={label}>Category</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', fontSize: 16, fontFamily: 'var(--font-body)',
              color: 'var(--color-ink)', border: '1px solid var(--color-gold)', borderRadius: 8,
              backgroundColor: 'white', outline: 'none', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath stroke='%235a6d8c' stroke-width='1.5' fill='none' stroke-linecap='round' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 40,
            }}
          >
            <option value="" disabled>Choose category…</option>
            {groups.map(g => {
              const cats = categories.filter(c => c.groupId === g.id).sort((a, b) => a.order - b.order)
              if (cats.length === 0) return null
              return <optgroup key={g.id} label={g.name}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            })}
            {standalones.length > 0 && <optgroup label="Other">{standalones.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
          </select>
        </div>

        {/* Amount */}
        <div className="mb-5">
          <label style={label}>Amount</label>
          <div className="flex items-center" style={{ border: '1px solid var(--color-gold)', borderRadius: 8, backgroundColor: 'white', overflow: 'hidden' }}>
            <span style={{ padding: '0 14px', fontSize: 24, fontFamily: 'var(--font-display)', color: 'var(--color-ink-soft)' }}>$</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={handleAmountChange}
              onFocus={e => e.target.select()}
              autoFocus
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 28,
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                color: 'var(--color-navy)',
                padding: '12px 12px 12px 0',
                backgroundColor: 'transparent',
              }}
            />
          </div>
        </div>

        {/* Date */}
        <div className="mb-5">
          <label style={label}>Date</label>
          <div className="flex gap-2 mb-2">
            {[
              { lbl: 'Yesterday', val: yesterday() },
              { lbl: 'Today',     val: today() },
              { lbl: 'Tomorrow',  val: tomorrow() },
            ].map(opt => (
              <button
                key={opt.lbl}
                onClick={() => setDate(opt.val)}
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderRadius: 5,
                  border: `1px solid ${date === opt.val ? 'var(--color-navy)' : 'var(--color-gold)'}`,
                  backgroundColor: date === opt.val ? 'var(--color-navy)' : 'white',
                  color: date === opt.val ? 'var(--color-parchment)' : 'var(--color-ink)',
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                {opt.lbl}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 16,
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
        <div className="mb-6">
          <label style={label}>
            Description <span style={{ fontWeight: 400, color: 'var(--color-ink-soft)' }}>(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="e.g. Safeway…"
            style={{
              width: '100%',
              padding: '12px 14px',
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

        {/* Payment Method */}
        <div className="mb-5">
          <label style={label}>
            Payment Method <span style={{ fontWeight: 400, color: 'var(--color-ink-soft)' }}>(optional)</span>
          </label>
          <select
            value={paymentMethodId}
            onChange={e => setPaymentMethodId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 16,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-gold)',
              borderRadius: 8,
              backgroundColor: 'white',
              outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath stroke='%235a6d8c' stroke-width='1.5' fill='none' stroke-linecap='round' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: 40,
            }}
          >
            <option value="">Unassigned</option>
            {(data?.paymentMethods ?? []).slice().sort((a, b) => a.order - b.order).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <p style={{ color: 'var(--color-burgundy)', fontFamily: 'var(--font-body)', fontSize: 14, marginBottom: 14 }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '14px 20px',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              backgroundColor: 'var(--color-navy)',
              color: 'var(--color-parchment)',
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
              minHeight: 48,
            }}
          >
            Save
          </button>
          <button
            onClick={() => onDelete(expense)}
            style={{
              padding: '14px 20px',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              backgroundColor: 'transparent',
              color: 'var(--color-burgundy)',
              border: '1px solid var(--color-burgundy)',
              borderRadius: 7,
              cursor: 'pointer',
              minHeight: 48,
            }}
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '14px 16px',
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

const label: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-soft)',
  marginBottom: 8,
}
