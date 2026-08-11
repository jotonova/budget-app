interface Props {
  active: 'dashboard' | 'ledger' | 'add-expense' | 'settings' | 'other'
  onNavigate: (target: 'dashboard' | 'ledger' | 'add-expense' | 'settings') => void
}

/** Bottom tab bar — mobile only. Thumb-reachable, safe-area aware. */
export default function MobileNav({ active, onNavigate }: Props) {
  const items = [
    { key: 'dashboard' as const, label: 'Home', icon: <HomeIcon /> },
    { key: 'ledger' as const, label: 'Budget', icon: <ListIcon /> },
    { key: 'add-expense' as const, label: 'Add', icon: <PlusIcon />, primary: true },
    { key: 'settings' as const, label: 'Settings', icon: <GearIcon /> },
  ]
  return (
    <nav
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
        display: 'flex', alignItems: 'stretch',
        backgroundColor: 'white',
        borderTop: '1px solid var(--color-parchment-dark)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 12px rgba(15,23,42,0.06)',
      }}
    >
      {items.map(it => {
        const isActive = active === it.key
        const color = isActive ? 'var(--color-navy)' : 'var(--color-ink-soft)'
        return (
          <button
            key={it.key}
            onClick={() => onNavigate(it.key)}
            aria-label={it.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, minHeight: 56, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer', color,
              fontFamily: 'var(--font-body)', padding: '6px 0',
            }}
          >
            {it.primary ? (
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: '50%',
                backgroundColor: 'var(--color-navy)', color: 'var(--color-parchment)',
              }}>{it.icon}</span>
            ) : (
              <span style={{ color }}>{it.icon}</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color }}>{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

const S = { width: 22, height: 22, fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
function HomeIcon() { return <svg viewBox="0 0 24 24" style={{ ...S, stroke: 'currentColor' }}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg> }
function ListIcon() { return <svg viewBox="0 0 24 24" style={{ ...S, stroke: 'currentColor' }}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg> }
function PlusIcon() { return <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' }}><path d="M12 5v14M5 12h14" /></svg> }
function GearIcon() { return <svg viewBox="0 0 24 24" style={{ ...S, stroke: 'currentColor' }}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 00-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 000 2l-2 1.5 2 3.5 2.4-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.4 1 2-3.5-2-1.5a7 7 0 00.1-1z" /></svg> }
