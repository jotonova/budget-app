import { useAuthStore } from '../store/authStore'
import HouseholdPanel from './HouseholdPanel'

/**
 * Cloud-sync account controls shown at the top of Settings.
 * Stage 1: sign in / out only — signing in does NOT yet change or sync data.
 */
export default function AccountPanel() {
  const configured = useAuthStore(s => s.configured)
  const status = useAuthStore(s => s.status)
  const user = useAuthStore(s => s.user)
  const error = useAuthStore(s => s.error)
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle)
  const signOut = useAuthStore(s => s.signOut)
  const clearError = useAuthStore(s => s.clearError)

  if (!configured) {
    return (
      <div style={panel}>
        <p style={{ ...text, color: 'var(--color-ink-soft)', margin: 0 }}>
          Cloud sync isn't configured on this build — the app runs fully local.
        </p>
      </div>
    )
  }

  return (
    <div style={panel}>
      {status === 'signed-in' && user ? (
        <>
          <div style={row}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={label}>Signed in</p>
              <p style={{ ...text, margin: 0 }}>{user.email}</p>
            </div>
            <button style={ghost} onClick={() => signOut()}>Sign out</button>
          </div>
          <HouseholdPanel />
        </>
      ) : (
        <div style={row}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <p style={label}>Cloud sync</p>
            <p style={{ ...text, color: 'var(--color-ink-soft)', margin: 0 }}>
              Sign in to share this budget with a partner. Live two-way sync is coming next — for
              now this only signs you in; your local budget is unchanged.
            </p>
          </div>
          <button
            style={{ ...primary, opacity: status === 'signing-in' ? 0.7 : 1 }}
            disabled={status === 'signing-in'}
            onClick={() => { clearError(); signInWithGoogle() }}
          >
            {status === 'signing-in' ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
      )}
      {error && <p style={{ ...text, color: 'var(--color-burgundy)', marginTop: 10, marginBottom: 0 }}>{error}</p>}
    </div>
  )
}

const panel: React.CSSProperties = {
  border: '1px solid var(--color-gold)',
  borderRadius: 8,
  backgroundColor: 'white',
  padding: '16px 20px',
  marginBottom: 24,
}
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }
const label: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--color-ink-soft)', margin: '0 0 4px',
}
const text: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)' }
const primary: React.CSSProperties = {
  padding: '10px 20px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
  borderRadius: 6, border: 'none', backgroundColor: 'var(--color-navy)',
  color: 'var(--color-parchment)', cursor: 'pointer', whiteSpace: 'nowrap',
}
const ghost: React.CSSProperties = {
  padding: '10px 18px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
  borderRadius: 6, border: '1px solid var(--color-navy)', backgroundColor: 'transparent',
  color: 'var(--color-navy)', cursor: 'pointer', whiteSpace: 'nowrap',
}
