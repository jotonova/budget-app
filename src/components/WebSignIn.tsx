import { useAuthStore } from '../store/authStore'

/** Full-screen sign-in gate for the web build (cloud-only). */
export default function WebSignIn() {
  const configured = useAuthStore(s => s.configured)
  const status = useAuthStore(s => s.status)
  const error = useAuthStore(s => s.error)
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle)
  const clearError = useAuthStore(s => s.clearError)

  const loading = status === 'loading'
  const signingIn = status === 'signing-in'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--color-parchment)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 380, textAlign: 'center',
        backgroundColor: 'var(--color-parchment-light)', border: '1px solid var(--color-parchment-dark)',
        borderRadius: 14, padding: '40px 28px', boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
      }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: 'var(--color-navy)', margin: '0 0 8px' }}>
          Budget
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', lineHeight: 1.6, margin: '0 0 24px' }}>
          Sign in to view and edit your shared household budget, synced live with your desktop app.
        </p>

        {configured ? (
          <button
            onClick={() => { clearError(); signInWithGoogle() }}
            disabled={loading || signingIn}
            style={{
              width: '100%', padding: '14px 20px', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
              borderRadius: 8, border: 'none', backgroundColor: 'var(--color-navy)', color: 'var(--color-parchment)',
              cursor: (loading || signingIn) ? 'default' : 'pointer', opacity: (loading || signingIn) ? 0.7 : 1, minHeight: 48,
            }}
          >
            {loading ? 'Loading…' : signingIn ? 'Redirecting to Google…' : 'Sign in with Google'}
          </button>
        ) : (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-burgundy)' }}>
            Cloud sync isn't configured for this site.
          </p>
        )}

        {error && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-burgundy)', marginTop: 14, marginBottom: 0 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
