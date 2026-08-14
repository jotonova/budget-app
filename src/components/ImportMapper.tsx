import { useState, useMemo, type CSSProperties } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import { parseAmount, extractStatementDate, normalizeMerchant } from '../lib/import/format'
import { headerSignature, type ImportProfile, type AmountMapping } from '../lib/import/profiles'
import type { GuessResult } from '../lib/import/guess'
import { formatCurrency } from '../lib/utils'

interface Props {
  fileName: string
  headers: string[]
  rows: Record<string, string>[]
  guess: GuessResult
  onConfirm: (profile: ImportProfile) => void
  onCancel: () => void
}

const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']

/** "Does this look right?" — pre-filled from the smart guess, with a live signed
 *  preview. Confirm saves it as that bank's profile; Adjust opens manual mapping. */
export default function ImportMapper({ fileName, headers, rows, guess, onConfirm, onCancel }: Props) {
  const isMobile = useIsMobile()
  const [adjust, setAdjust] = useState(guess.confidence === 'low')
  const [bankName, setBankName] = useState('')
  const [dateCol, setDateCol] = useState(guess.dateCol ?? '')
  const [descCol, setDescCol] = useState(guess.descriptionCol ?? '')
  const [dateFormat, setDateFormat] = useState(guess.dateFormat)
  const [mode, setMode] = useState<'signed' | 'debitCredit'>(guess.amount?.mode ?? 'signed')
  const [amountCol, setAmountCol] = useState(guess.amount?.mode === 'signed' ? guess.amount.amountCol : '')
  const [negativeMeans, setNegativeMeans] = useState<'out' | 'in'>(guess.amount?.mode === 'signed' ? guess.amount.negativeMeans : 'out')
  const [debitCol, setDebitCol] = useState(guess.amount?.mode === 'debitCredit' ? guess.amount.debitCol : '')
  const [creditCol, setCreditCol] = useState(guess.amount?.mode === 'debitCredit' ? guess.amount.creditCol : '')

  const amount: AmountMapping = mode === 'signed'
    ? { mode: 'signed', amountCol, negativeMeans }
    : { mode: 'debitCredit', debitCol, creditCol }

  const complete = !!dateCol && !!descCol && (mode === 'signed' ? !!amountCol : !!debitCol && !!creditCol)

  const preview = useMemo(() => rows.slice(0, 5).map(r => {
    const date = extractStatementDate(r[dateCol], dateFormat)
    let amt = NaN
    if (mode === 'signed') { const v = parseAmount(r[amountCol]); amt = negativeMeans === 'out' ? v : -v }
    else {
      const d = parseAmount(r[debitCol]); const c = parseAmount(r[creditCol])
      if (!Number.isNaN(d) && Math.abs(d) > 0) amt = -Math.abs(d)
      else if (!Number.isNaN(c) && Math.abs(c) > 0) amt = Math.abs(c)
    }
    return { date, desc: (r[descCol] ?? '').trim(), merchant: normalizeMerchant(r[descCol]), amt }
  }), [rows, dateCol, descCol, dateFormat, mode, amountCol, negativeMeans, debitCol, creditCol])

  function confirm() {
    const profile: ImportProfile = {
      id: 'user-' + headerSignature(headers),
      displayName: bankName.trim() || 'My bank',
      headerSignature: headerSignature(headers),
      dateCol, descriptionCol: descCol, dateFormat, amount, builtIn: false,
    }
    onConfirm(profile)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 200, backgroundColor: 'rgba(26,41,66,0.55)', padding: 16 }} onClick={onCancel}>
      <div className="rounded-xl" style={{ backgroundColor: 'var(--color-parchment)', border: '1px solid var(--color-gold)', boxShadow: '0 8px 40px rgba(26,41,66,0.3)', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? 20 : 28 }} onClick={e => e.stopPropagation()}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-ink-soft)', marginBottom: 4 }}>
          New bank · {fileName}
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-navy)', margin: '0 0 4px' }}>
          {adjust ? 'Map your columns' : 'Does this look right?'}
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)', marginBottom: 16 }}>
          {adjust ? 'Tell us which column is which — the preview updates as you go.' : "We guessed how to read this file. Check the preview below, then confirm."}
        </p>

        {/* Manual mapping controls (Adjust / low-confidence) */}
        {adjust && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <Field label="Date column"><Select value={dateCol} onChange={setDateCol} options={headers} isMobile={isMobile} /></Field>
            <Field label="Date format"><Select value={dateFormat} onChange={setDateFormat} options={DATE_FORMATS} isMobile={isMobile} /></Field>
            <Field label="Description column"><Select value={descCol} onChange={setDescCol} options={headers} isMobile={isMobile} /></Field>
            <Field label="Amount is…">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Seg active={mode === 'signed'} onClick={() => setMode('signed')}>One signed column</Seg>
                <Seg active={mode === 'debitCredit'} onClick={() => setMode('debitCredit')}>Two columns (out / in)</Seg>
              </div>
            </Field>
            {mode === 'signed' ? (
              <>
                <Field label="Amount column"><Select value={amountCol} onChange={setAmountCol} options={headers} isMobile={isMobile} /></Field>
                <Field label="A negative number means">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Seg active={negativeMeans === 'out'} onClick={() => setNegativeMeans('out')}>Money out</Seg>
                    <Seg active={negativeMeans === 'in'} onClick={() => setNegativeMeans('in')}>Money in</Seg>
                  </div>
                </Field>
              </>
            ) : (
              <>
                <Field label="Money-out column (withdrawals)"><Select value={debitCol} onChange={setDebitCol} options={headers} isMobile={isMobile} /></Field>
                <Field label="Money-in column (deposits)"><Select value={creditCol} onChange={setCreditCol} options={headers} isMobile={isMobile} /></Field>
              </>
            )}
          </div>
        )}

        {/* Live signed preview */}
        <div style={{ border: '1px solid var(--color-parchment-dark)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {preview.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i > 0 ? '1px solid var(--color-parchment-dark)' : 'none', backgroundColor: 'white' }}>
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, backgroundColor: Number.isNaN(p.amt) ? '#eee' : p.amt < 0 ? '#f4ece7' : '#e7f4ea', color: Number.isNaN(p.amt) ? '#999' : p.amt < 0 ? '#8a5a2b' : '#1e7d43' }}>
                {Number.isNaN(p.amt) ? '?' : p.amt < 0 ? 'OUT' : 'IN'}
              </span>
              <span style={{ flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink-soft)', minWidth: 76 }}>{p.date ?? '—'}</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.desc || '—'}</span>
              <span style={{ flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: Number.isNaN(p.amt) ? '#c00' : p.amt < 0 ? 'var(--color-ink)' : '#1e7d43' }}>
                {Number.isNaN(p.amt) ? 'error' : `${p.amt < 0 ? '−' : '+'}${formatCurrency(Math.abs(p.amt))}`}
              </span>
            </div>
          ))}
        </div>

        {/* Bank name */}
        <Field label="Save as (bank name)">
          <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Chase Checking" style={{ ...ctl(isMobile), width: '100%' }} />
        </Field>

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button onClick={confirm} disabled={!complete} style={{ ...btn(true), opacity: complete ? 1 : 0.5, cursor: complete ? 'pointer' : 'not-allowed' }}>
            {adjust ? 'Use this mapping' : 'Yes, looks right'}
          </button>
          {!adjust && <button onClick={() => setAdjust(true)} style={linkBtn}>Adjust…</button>}
          <button onClick={onCancel} style={linkBtn}>Cancel</button>
        </div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink-soft)', marginTop: 12 }}>
          We'll remember this for next time — future imports from this bank skip straight to review.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-soft)', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}
function Select({ value, onChange, options, isMobile }: { value: string; onChange: (v: string) => void; options: string[]; isMobile: boolean }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...ctl(isMobile), width: '100%' }}>
      <option value="" disabled>Choose…</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
function Seg({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '10px 12px', borderRadius: 6, minHeight: 44, border: `1px solid ${active ? 'var(--color-navy)' : 'var(--color-parchment-dark)'}`, backgroundColor: active ? 'var(--color-navy)' : 'white', color: active ? 'var(--color-parchment)' : 'var(--color-ink)', cursor: 'pointer' }}>{children}</button>
}
function ctl(isMobile: boolean): CSSProperties {
  return { fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-gold)', backgroundColor: 'white', outline: 'none', minHeight: isMobile ? 46 : 44 }
}
function btn(primary: boolean): CSSProperties {
  return { fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '14px 24px', borderRadius: 7, minHeight: 48, border: primary ? 'none' : '1px solid var(--color-navy)', backgroundColor: primary ? 'var(--color-navy)' : 'transparent', color: primary ? 'var(--color-parchment)' : 'var(--color-navy)', cursor: 'pointer' }
}
const linkBtn: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, minHeight: 44, padding: '0 8px' }
