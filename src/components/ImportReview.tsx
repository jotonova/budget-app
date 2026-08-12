import { useState, type CSSProperties } from 'react'
import SceneHeader from './scenes/SceneHeader'
import { useIsMobile } from '../lib/useIsMobile'
import { useLedgerStore } from '../store/ledgerStore'
import { formatCurrency } from '../lib/utils'
import { pickStatementFile } from '../lib/import/pickFile'
import { readHeaders, parseStatement, toPendingTransactions } from '../lib/import/parse'
import { detectProfile } from '../lib/import/profiles'
import type { PendingTransaction, Category, Group, PaymentMethod, MerchantRule } from '../lib/types'

interface Props { onBack: () => void }

interface Summary {
  file: string; profile: string
  total: number; parsed: number; debit: number; credit: number; failed: number
  added: number; duplicates: number
}

/** Find a remembered category for a merchant: exact normalized match first, then a
 *  contains-match on the stored token. */
function suggestCategory(merchant: string, rules: MerchantRule[]): string | undefined {
  if (!merchant) return undefined
  return (rules.find(r => r.match === merchant)
    ?? rules.find(r => r.match && merchant.includes(r.match)))?.categoryId
}

export default function ImportReview({ onBack }: Props) {
  const data = useLedgerStore(s => s.data)
  const addPendingTransactions = useLedgerStore(s => s.addPendingTransactions)
  const approvePending = useLedgerStore(s => s.approvePending)
  const approveSplit = useLedgerStore(s => s.approveSplit)
  const approveRefund = useLedgerStore(s => s.approveRefund)
  const approveOneTimeIncome = useLedgerStore(s => s.approveOneTimeIncome)
  const skipPending = useLedgerStore(s => s.skipPending)
  const addMerchantRule = useLedgerStore(s => s.addMerchantRule)
  const isMobile = useIsMobile()

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [tally, setTally] = useState({ approved: 0, skipped: 0 })
  const [remember, setRemember] = useState<{ merchant: string; categoryId: string } | null>(null)

  const pending = (data?.pendingTransactions ?? [])
    .filter(p => p.status === 'pending')
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const groups = (data?.groups ?? []).slice().sort((a, b) => a.order - b.order)
  const categories = data?.categories ?? []
  const paymentMethods = (data?.paymentMethods ?? []).slice().sort((a, b) => a.order - b.order)
  const merchantRules = data?.merchantRules ?? []
  const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? 'that category'

  async function handleImport() {
    setBusy(true); setErr(null); setSummary(null)
    try {
      const picked = await pickStatementFile()
      if (!picked) return
      const headers = readHeaders(picked.text)
      const profile = detectProfile(headers)
      if (!profile) {
        setErr(`This file's columns (${headers.join(', ') || 'none'}) aren't a recognized layout yet. PNC's "Account Activity" export is supported now; a custom column-mapping step is coming in a later stage.`)
        return
      }
      const result = parseStatement(picked.text, profile)
      const existing = new Set((data?.pendingTransactions ?? []).map(p => p.dedupKey))
      const candidates = toPendingTransactions(result.rows, existing, new Date().toISOString())
      const added = addPendingTransactions(candidates)
      setSummary({
        file: picked.name, profile: profile.displayName,
        total: result.counts.total, parsed: result.counts.parsed,
        debit: result.counts.debit, credit: result.counts.credit, failed: result.counts.failed,
        added, duplicates: result.counts.parsed - added,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Approve as a normal expense, then offer to remember merchant → category. */
  function handleApprove(p: PendingTransaction, categoryId: string, paymentMethodId?: string) {
    if (approvePending(p.id, categoryId, paymentMethodId)) {
      setTally(t => ({ ...t, approved: t.approved + 1 }))
      if (p.merchant && !merchantRules.some(r => r.match === p.merchant)) {
        setRemember({ merchant: p.merchant, categoryId })
      }
    }
  }
  function handleSplit(id: string, parts: { categoryId: string; amount: number }[], paymentMethodId?: string) {
    if (approveSplit(id, parts, paymentMethodId)) setTally(t => ({ ...t, approved: t.approved + 1 }))
  }
  function handleRefund(id: string, categoryId: string, paymentMethodId?: string) {
    if (approveRefund(id, categoryId, paymentMethodId)) setTally(t => ({ ...t, approved: t.approved + 1 }))
  }
  function handleIncome(id: string, label: string, note?: string) {
    if (approveOneTimeIncome(id, label, note)) setTally(t => ({ ...t, approved: t.approved + 1 }))
  }
  function handleSkip(id: string, reason?: string) {
    skipPending(id, reason)
    setTally(t => ({ ...t, skipped: t.skipped + 1 }))
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader title="Review Inbox" subtitle="Categorize each line, then approve" />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '20px 16px 96px' : '32px 24px 64px' }}>

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

        {/* Import action */}
        <div className="rounded-xl mb-6 p-6" style={{ backgroundColor: 'var(--color-parchment-light)', border: '1px solid var(--color-gold)' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--color-navy)', marginBottom: 6 }}>
            Import a statement
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', lineHeight: 1.6, marginBottom: 8 }}>
            Choose a CSV exported from your bank. Nothing is added to your budget — every row lands here for you (and your partner) to categorize and approve.
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)', lineHeight: 1.6, marginBottom: 16 }}>
            <strong>PNC:</strong> Online Banking → Account Activity → Download → CSV. PNC exports up to 90 days at a time; a weekly pull is plenty, and re-importing an overlapping range is safe (duplicates are skipped).
          </p>
          <button
            onClick={handleImport}
            disabled={busy}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '14px 28px', borderRadius: 6, border: 'none',
              backgroundColor: 'var(--color-navy)', color: 'var(--color-parchment)',
              cursor: busy ? 'wait' : 'pointer', minHeight: 48, opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Importing…' : 'Import statement (CSV)'}
          </button>
        </div>

        {/* Error */}
        {err && (
          <div className="rounded-lg mb-6 p-4" style={{ backgroundColor: '#fdecea', border: '1px solid #e6b0aa' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#922b21', lineHeight: 1.6 }}>{err}</p>
          </div>
        )}

        {/* Import summary */}
        {summary && (
          <div className="rounded-lg mb-6 p-5" style={{ backgroundColor: 'white', border: '1px solid var(--color-parchment-dark)' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--color-navy)', marginBottom: 6 }}>
              Imported {summary.file}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', lineHeight: 1.7 }}>
              Detected <strong>{summary.profile}</strong> · {summary.parsed} of {summary.total} rows parsed
              {summary.failed > 0 ? ` (${summary.failed} skipped)` : ''} · {summary.debit} out, {summary.credit} in.
              <br />
              <strong style={{ color: 'var(--color-navy)' }}>{summary.added} added</strong> to the inbox
              {summary.duplicates > 0 ? ` · ${summary.duplicates} already imported (skipped)` : ''}.
            </p>
          </div>
        )}

        {/* Remember merchant → category */}
        {remember && (
          <div className="rounded-lg mb-4 p-4" style={{ backgroundColor: '#eef4fb', border: '1px solid var(--color-navy)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>
              Always file <strong>“{remember.merchant}”</strong> under <strong>{categoryName(remember.categoryId)}</strong> next time?
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <RowButton primary onClick={() => { addMerchantRule(remember.merchant, remember.categoryId); setRemember(null) }}>Remember</RowButton>
              <RowButton onClick={() => setRemember(null)}>Not now</RowButton>
            </span>
          </div>
        )}

        {/* Pending list header */}
        <div className="flex items-center justify-between mb-3" style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
            To review
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)' }}>
            {pending.length} pending
            {(tally.approved > 0 || tally.skipped > 0) && ` · ${tally.approved} approved, ${tally.skipped} skipped`}
          </span>
        </div>

        {categories.length === 0 && pending.length > 0 && (
          <div className="rounded-lg mb-4 p-4" style={{ backgroundColor: '#fef9e7', border: '1px solid var(--color-gold)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.6 }}>
              Add spending categories in Settings first — you'll need one to approve a row into your budget.
            </p>
          </div>
        )}

        {pending.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-ink-soft)', padding: '24px 0', textAlign: 'center' }}>
            Nothing to review. Import a statement to get started.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(p => (
              <PendingRow
                key={p.id}
                p={p}
                groups={groups}
                categories={categories}
                paymentMethods={paymentMethods}
                suggestedCategoryId={suggestCategory(p.merchant, merchantRules)}
                isMobile={isMobile}
                onApprove={handleApprove}
                onSplit={handleSplit}
                onRefund={handleRefund}
                onIncome={handleIncome}
                onSkip={handleSkip}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Per-row: categorize first, then approve ────────────────────────────────────

const SKIP_REASONS = ['Transfer', 'Card payment', 'Not an expense']

function PendingRow({
  p, groups, categories, paymentMethods, suggestedCategoryId, isMobile,
  onApprove, onSplit, onRefund, onIncome, onSkip,
}: {
  p: PendingTransaction
  groups: Group[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  suggestedCategoryId?: string
  isMobile: boolean
  onApprove: (p: PendingTransaction, categoryId: string, paymentMethodId?: string) => void
  onSplit: (id: string, parts: { categoryId: string; amount: number }[], paymentMethodId?: string) => void
  onRefund: (id: string, categoryId: string, paymentMethodId?: string) => void
  onIncome: (id: string, label: string, note?: string) => void
  onSkip: (id: string, reason?: string) => void
}) {
  const isCredit = p.direction === 'credit'
  const total = Math.abs(p.amount)

  // Shared expense-side state
  const [catId, setCatId] = useState(suggestedCategoryId ?? '')
  const [pmId, setPmId] = useState('')
  // Debit sub-mode: expense (default) | split | skip
  const [debitMode, setDebitMode] = useState<'expense' | 'split' | 'skip'>('expense')
  // Split parts
  const [parts, setParts] = useState<{ categoryId: string; amount: string }[]>([{ categoryId: suggestedCategoryId ?? '', amount: total.toFixed(2) }])
  // Credit destination: null | refund | income | skip
  const [dest, setDest] = useState<'refund' | 'income' | 'skip' | null>(null)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')

  const splitSum = parts.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0)
  const remainder = total - splitSum
  const splitValid = parts.length > 0 && parts.every(x => x.categoryId && (parseFloat(x.amount) || 0) > 0) && Math.abs(remainder) < 0.005

  return (
    <div className="rounded-lg" style={{ backgroundColor: 'white', border: '1px solid var(--color-parchment-dark)', padding: '12px 14px' }}>
      {/* Top line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 7px', borderRadius: 4,
          backgroundColor: isCredit ? '#e7f4ea' : '#f4ece7', color: isCredit ? '#1e7d43' : '#8a5a2b',
        }}>
          {isCredit ? 'IN' : 'OUT'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.rawDescription || '(no description)'}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink-soft)' }}>{p.date}</p>
        </div>
        <span style={{ flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: isCredit ? '#1e7d43' : 'var(--color-ink)' }}>
          {isCredit ? '+' : '−'}{formatCurrency(total)}
        </span>
      </div>

      {/* ── Money OUT (debit): categorize first, then approve ── */}
      {!isCredit && (
        <div style={{ marginTop: 10 }}>
          {debitMode === 'expense' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <CategorySelect groups={groups} categories={categories} value={catId} onChange={setCatId} isMobile={isMobile} />
              {paymentMethods.length > 0 && (
                <PaymentSelect paymentMethods={paymentMethods} value={pmId} onChange={setPmId} isMobile={isMobile} />
              )}
              <RowButton primary disabled={!catId} onClick={() => onApprove(p, catId, pmId || undefined)}>Approve</RowButton>
              <RowButton onClick={() => setDebitMode('split')}>Split…</RowButton>
              <RowButton onClick={() => setDebitMode('skip')}>Skip…</RowButton>
            </div>
          )}

          {debitMode === 'split' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {parts.map((part, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <CategorySelect groups={groups} categories={categories} value={part.categoryId} isMobile={isMobile}
                    onChange={v => setParts(ps => ps.map((x, j) => j === i ? { ...x, categoryId: v } : x))} />
                  <input
                    inputMode="decimal" value={part.amount} placeholder="0.00"
                    onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                    style={{ ...selectStyle(isMobile), width: 100 }}
                  />
                  {parts.length > 1 && (
                    <RowButton onClick={() => setParts(ps => ps.filter((_, j) => j !== i))}>✕</RowButton>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <RowButton onClick={() => setParts(ps => [...ps, { categoryId: '', amount: Math.max(0, remainder).toFixed(2) }])}>+ Add line</RowButton>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: Math.abs(remainder) < 0.005 ? '#1e7d43' : '#8a5a2b' }}>
                  {Math.abs(remainder) < 0.005 ? '✓ balanced' : `remainder ${formatCurrency(remainder)}`} of {formatCurrency(total)}
                </span>
              </div>
              {paymentMethods.length > 0 && (
                <PaymentSelect paymentMethods={paymentMethods} value={pmId} onChange={setPmId} isMobile={isMobile} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <RowButton primary disabled={!splitValid}
                  onClick={() => onSplit(p.id, parts.map(x => ({ categoryId: x.categoryId, amount: parseFloat(x.amount) || 0 })), pmId || undefined)}>
                  Approve split
                </RowButton>
                <RowButton onClick={() => setDebitMode('expense')}>Cancel</RowButton>
              </div>
            </div>
          )}

          {debitMode === 'skip' && (
            <SkipChips onSkip={r => onSkip(p.id, r)} onCancel={() => setDebitMode('expense')} />
          )}
        </div>
      )}

      {/* ── Money IN (credit): choose destination, then confirm ── */}
      {isCredit && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)' }}>Money in:</span>
            <Segmented active={dest === 'refund'} onClick={() => setDest('refund')}>Refund → category</Segmented>
            <Segmented active={dest === 'income'} onClick={() => setDest('income')}>One-time income</Segmented>
            <Segmented active={dest === 'skip'} onClick={() => setDest('skip')}>Skip</Segmented>
          </div>

          {dest === 'refund' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <CategorySelect groups={groups} categories={categories} value={catId} onChange={setCatId} isMobile={isMobile} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink-soft)' }}>reduces that category's spending</span>
              <RowButton primary disabled={!catId} onClick={() => onRefund(p.id, catId, pmId || undefined)}>Approve refund</RowButton>
            </div>
          )}

          {dest === 'income' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input value={label} placeholder="Label (e.g. Tax refund, Gift)" onChange={e => setLabel(e.target.value)} style={{ ...selectStyle(isMobile), minWidth: 200 }} />
              <input value={note} placeholder="Note (optional)" onChange={e => setNote(e.target.value)} style={{ ...selectStyle(isMobile), minWidth: 160 }} />
              <RowButton primary onClick={() => onIncome(p.id, label, note || undefined)}>Add income</RowButton>
            </div>
          )}

          {dest === 'skip' && (
            <SkipChips onSkip={r => onSkip(p.id, r)} onCancel={() => setDest(null)} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Small pieces ───────────────────────────────────────────────────────────────

function CategorySelect({ groups, categories, value, onChange, isMobile }: {
  groups: Group[]; categories: Category[]; value: string; onChange: (v: string) => void; isMobile: boolean
}) {
  const standalones = categories.filter(c => c.groupId === null).sort((a, b) => a.order - b.order)
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle(isMobile)}>
      <option value="" disabled>Choose category…</option>
      {groups.map(g => {
        const cats = categories.filter(c => c.groupId === g.id).sort((a, b) => a.order - b.order)
        if (cats.length === 0) return null
        return <optgroup key={g.id} label={g.name}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
      })}
      {standalones.length > 0 && <optgroup label="Other">{standalones.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
    </select>
  )
}

function PaymentSelect({ paymentMethods, value, onChange, isMobile }: {
  paymentMethods: PaymentMethod[]; value: string; onChange: (v: string) => void; isMobile: boolean
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle(isMobile)}>
      <option value="">Payment method (optional)</option>
      {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}

function SkipChips({ onSkip, onCancel }: { onSkip: (reason?: string) => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)' }}>Reason:</span>
      {SKIP_REASONS.map(r => <RowButton key={r} onClick={() => onSkip(r)}>{r}</RowButton>)}
      <RowButton onClick={() => onSkip()}>Skip (no reason)</RowButton>
      <RowButton onClick={onCancel}>Cancel</RowButton>
    </div>
  )
}

function selectStyle(isMobile: boolean): CSSProperties {
  return {
    fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)',
    padding: isMobile ? '10px 10px' : '8px 10px', borderRadius: 6,
    border: '1px solid var(--color-parchment-dark)', backgroundColor: 'white',
    minHeight: isMobile ? 44 : undefined, maxWidth: '100%',
  }
}

function Segmented({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 6, minHeight: 40,
      border: `1px solid ${active ? 'var(--color-navy)' : 'var(--color-parchment-dark)'}`,
      backgroundColor: active ? 'var(--color-navy)' : 'transparent',
      color: active ? 'var(--color-parchment)' : 'var(--color-ink)', cursor: 'pointer',
    }}>{children}</button>
  )
}

function RowButton({ children, onClick, primary, disabled }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
      padding: '8px 14px', borderRadius: 6, minHeight: 40,
      border: primary ? 'none' : '1px solid var(--color-navy)',
      backgroundColor: primary ? 'var(--color-navy)' : 'transparent',
      color: primary ? 'var(--color-parchment)' : 'var(--color-navy)',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}
