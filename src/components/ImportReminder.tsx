import { useState } from 'react'
import { useLedgerStore } from '../store/ledgerStore'

/** Gentle nudge shown when it's been ≥ the configured interval since the last
 *  statement import. Only appears after a first import; dismissible per session. */
export default function ImportReminder({ onImport }: { onImport: () => void }) {
  const settings = useLedgerStore(s => s.data?.settings)
  const [dismissed, setDismissed] = useState(false)
  if (!settings || dismissed) return null

  const days = settings.importReminderDays ?? 7
  if (days <= 0 || !settings.lastImportAt) return null
  const elapsed = Math.floor((Date.now() - Date.parse(settings.lastImportAt)) / 86400000)
  if (elapsed < days) return null

  return (
    <div style={{ backgroundColor: 'var(--color-parchment-light)', borderBottom: '1px solid var(--color-gold)', padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink)' }}>
        It's been <strong>{elapsed} days</strong> since your last statement import.
      </span>
      <button onClick={onImport} style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', padding: '6px 14px', minHeight: 36, borderRadius: 6, border: 'none', backgroundColor: 'var(--color-navy)', color: 'var(--color-parchment)', cursor: 'pointer' }}>
        Import now
      </button>
      <button onClick={() => setDismissed(true)} style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, minHeight: 36 }}>
        Not now
      </button>
    </div>
  )
}
