import { useState, type CSSProperties } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import { BANK_GUIDES, type BankGuide } from '../lib/import/banks'

interface Props {
  onChooseFile: () => void
  onCancel: () => void
}

/** "Import your statement" — pick a bank → plain-language export steps → choose
 *  file. The file then flows into the normal detect/guess → review pipeline. */
export default function ImportWizard({ onChooseFile, onCancel }: Props) {
  const isMobile = useIsMobile()
  const [bank, setBank] = useState<BankGuide | null>(null)

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 200, backgroundColor: 'rgba(26,41,66,0.55)', padding: 16 }} onClick={onCancel}>
      <div className="rounded-xl" style={{ backgroundColor: 'var(--color-parchment)', border: '1px solid var(--color-gold)', boxShadow: '0 8px 40px rgba(26,41,66,0.3)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? 20 : 28 }} onClick={e => e.stopPropagation()}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-ink-soft)', marginBottom: 4 }}>
          Import your statement
        </p>

        {!bank ? (
          <>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-navy)', margin: '0 0 4px' }}>
              Which bank is this from?
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', marginBottom: 16 }}>
              We'll show you how to download the file.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BANK_GUIDES.map(b => (
                <button key={b.id} onClick={() => setBank(b)} style={choice(isMobile)}>
                  {b.name}
                  <svg width="16" height="16" viewBox="0 0 14 14" style={{ stroke: 'var(--color-ink-soft)', fill: 'none', strokeWidth: 1.5 }}><path d="M2 7h10M8 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button onClick={onCancel} style={linkBtn}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-navy)', margin: '0 0 12px' }}>
              {bank.name}
            </h2>
            <ol style={{ margin: '0 0 14px', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bank.steps.map((step, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', backgroundColor: 'var(--color-navy)', color: 'var(--color-parchment)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>{i + 1}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)', lineHeight: 1.5, paddingTop: 2 }}>{step}</span>
                </li>
              ))}
            </ol>
            {bank.note && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)', lineHeight: 1.6, backgroundColor: 'var(--color-parchment-light)', border: '1px solid var(--color-gold)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                {bank.note}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button onClick={onChooseFile} style={btnPrimary(isMobile)}>Choose file</button>
              <button onClick={() => setBank(null)} style={linkBtn}>Back</button>
              <button onClick={onCancel} style={linkBtn}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function choice(isMobile: boolean): CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left', padding: '16px 18px', minHeight: 56, borderRadius: 10, border: '1px solid var(--color-gold)', backgroundColor: 'white', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600, color: 'var(--color-navy)', width: '100%', minWidth: isMobile ? undefined : 0 }
}
function btnPrimary(isMobile: boolean): CSSProperties {
  return { fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '14px 28px', borderRadius: 7, minHeight: 48, border: 'none', backgroundColor: 'var(--color-navy)', color: 'var(--color-parchment)', cursor: 'pointer', flex: isMobile ? 1 : undefined }
}
const linkBtn: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-ink-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, minHeight: 44, padding: '0 8px' }
