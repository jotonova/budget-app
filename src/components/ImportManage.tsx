import { useState, type CSSProperties } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import { useEscape } from '../lib/useEscape'
import { useLedgerStore } from '../store/ledgerStore'
import { formatCurrency } from '../lib/utils'

interface Props { onClose: () => void }

type Tab = 'skipped' | 'rules' | 'profiles'

export default function ImportManage({ onClose }: Props) {
  const isMobile = useIsMobile()
  const data = useLedgerStore(s => s.data)
  const unskipPending = useLedgerStore(s => s.unskipPending)
  const deleteMerchantRule = useLedgerStore(s => s.deleteMerchantRule)
  const deleteImportProfile = useLedgerStore(s => s.deleteImportProfile)
  const [tab, setTab] = useState<Tab>('skipped')
  useEscape(onClose)

  const skipped = (data?.pendingTransactions ?? []).filter(p => p.status === 'skipped').slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  const rules = data?.merchantRules ?? []
  const profiles = data?.settings.importProfiles ?? []
  const categoryName = (id: string) => data?.categories.find(c => c.id === id)?.name ?? '—'

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'skipped', label: 'Skipped', count: skipped.length },
    { key: 'rules', label: 'Merchant rules', count: rules.length },
    { key: 'profiles', label: 'Bank profiles', count: profiles.length },
  ]

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 200, backgroundColor: 'rgba(26,41,66,0.55)', padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Manage imports" className="rounded-xl" style={{ backgroundColor: 'var(--color-parchment)', border: '1px solid var(--color-gold)', boxShadow: '0 8px 40px rgba(26,41,66,0.3)', width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? 18 : 26 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--color-navy)', margin: 0 }}>Manage imports</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--color-ink-soft)', minHeight: 44, minWidth: 44 }}>×</button>
        </div>

        {/* Tabs */}
        <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '9px 14px', minHeight: 44, borderRadius: 6, border: `1px solid ${tab === t.key ? 'var(--color-navy)' : 'var(--color-parchment-dark)'}`, backgroundColor: tab === t.key ? 'var(--color-navy)' : 'white', color: tab === t.key ? 'var(--color-parchment)' : 'var(--color-ink)', cursor: 'pointer' }}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Skipped */}
        {tab === 'skipped' && (
          skipped.length === 0 ? <Empty>No skipped transactions.</Empty> : (
            <List>
              {skipped.map(p => (
                <Row key={p.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={rowMain}>{p.rawDescription || '(no description)'}</p>
                    <p style={rowSub}>{p.date} · {p.direction === 'credit' ? '+' : '−'}{formatCurrency(Math.abs(p.amount))}{p.skipReason ? ` · ${p.skipReason}` : ''}</p>
                  </div>
                  <MiniBtn onClick={() => unskipPending(p.id)}>Un-skip</MiniBtn>
                </Row>
              ))}
            </List>
          )
        )}

        {/* Merchant rules */}
        {tab === 'rules' && (
          rules.length === 0 ? <Empty>No merchant rules yet. Approve a row and choose “Remember” to add one.</Empty> : (
            <List>
              {rules.map(r => (
                <Row key={r.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={rowMain}>“{r.match}”</p>
                    <p style={rowSub}>→ {categoryName(r.categoryId)}</p>
                  </div>
                  <MiniBtn danger onClick={() => deleteMerchantRule(r.id)}>Delete</MiniBtn>
                </Row>
              ))}
            </List>
          )
        )}

        {/* Bank profiles */}
        {tab === 'profiles' && (
          profiles.length === 0 ? <Empty>No saved bank profiles yet. They're created when you confirm a new bank's columns.</Empty> : (
            <List>
              {profiles.map(pr => (
                <Row key={pr.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={rowMain}>{pr.displayName}</p>
                    <p style={rowSub}>{pr.amount.mode === 'debitCredit' ? 'Two-column (out/in)' : 'Single signed amount'} · {pr.dateFormat}</p>
                  </div>
                  <MiniBtn danger onClick={() => deleteImportProfile(pr.id)}>Forget</MiniBtn>
                </Row>
              ))}
            </List>
          )
        )}
      </div>
    </div>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', backgroundColor: 'white', border: '1px solid var(--color-parchment-dark)' }}>{children}</div>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 15, color: 'var(--color-ink-soft)', padding: '20px 0', textAlign: 'center' }}>{children}</p>
}
function MiniBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} style={{ flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '8px 14px', minHeight: 44, borderRadius: 6, border: `1px solid ${danger ? 'var(--color-burgundy)' : 'var(--color-navy)'}`, backgroundColor: 'transparent', color: danger ? 'var(--color-burgundy)' : 'var(--color-navy)', cursor: 'pointer' }}>{children}</button>
}
const rowMain: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const rowSub: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-ink-soft)', margin: '2px 0 0' }
