import { useState } from 'react'
import SceneHeader from './scenes/SceneHeader'
import { useIsMobile } from '../lib/useIsMobile'
import { useLedgerStore } from '../store/ledgerStore'
import { formatCurrency } from '../lib/utils'
import { pickStatementFile } from '../lib/import/pickFile'
import { readHeaders, parseStatement, toPendingTransactions } from '../lib/import/parse'
import { detectProfile } from '../lib/import/profiles'

interface Props { onBack: () => void }

interface Summary {
  file: string
  profile: string
  total: number
  parsed: number
  debit: number
  credit: number
  failed: number
  added: number
  duplicates: number
}

export default function ImportReview({ onBack }: Props) {
  const data = useLedgerStore(s => s.data)
  const addPendingTransactions = useLedgerStore(s => s.addPendingTransactions)
  const isMobile = useIsMobile()

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)

  const pending = (data?.pendingTransactions ?? [])
    .filter(p => p.status === 'pending')
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

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
        file: picked.name,
        profile: profile.displayName,
        total: result.counts.total,
        parsed: result.counts.parsed,
        debit: result.counts.debit,
        credit: result.counts.credit,
        failed: result.counts.failed,
        added,
        duplicates: result.counts.parsed - added,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader title="Review Inbox" subtitle="Imported transactions awaiting your approval" />

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
            Choose a CSV exported from your bank. Nothing is added to your budget — every row lands here for you (and your partner) to review and approve.
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

        {/* Pending list header */}
        <div className="flex items-center justify-between mb-3" style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
            To review
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)' }}>
            {pending.length} pending
          </span>
        </div>

        {pending.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-ink-soft)', padding: '24px 0', textAlign: 'center' }}>
            Nothing to review. Import a statement to get started.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(p => (
              <div key={p.id} className="rounded-lg" style={{
                backgroundColor: 'white', border: '1px solid var(--color-parchment-dark)',
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '3px 7px', borderRadius: 4,
                  backgroundColor: p.direction === 'credit' ? '#e7f4ea' : '#f4ece7',
                  color: p.direction === 'credit' ? '#1e7d43' : '#8a5a2b',
                }}>
                  {p.direction === 'credit' ? 'IN' : 'OUT'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.rawDescription || '(no description)'}
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink-soft)' }}>{p.date}</p>
                </div>
                <span style={{
                  flexShrink: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600,
                  color: p.direction === 'credit' ? '#1e7d43' : 'var(--color-ink)',
                }}>
                  {p.direction === 'credit' ? '+' : '−'}{formatCurrency(Math.abs(p.amount))}
                </span>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontStyle: 'italic', color: 'var(--color-ink-soft)', textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
          These are pending only — they don't affect your budget until approved. (Approve / categorize is coming next.)
        </p>
      </div>
    </div>
  )
}
