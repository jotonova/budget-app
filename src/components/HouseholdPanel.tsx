import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useHouseholdStore } from '../store/householdStore'
import { useProfileStore } from '../store/profileStore'
import { reloadActiveProfile } from '../lib/activeProfile'
import { formatInviteCode } from '../lib/inviteCode'

export default function HouseholdPanel() {
  const userId = useAuthStore(s => s.user?.id)
  const email = useAuthStore(s => s.user?.email)
  const hs = useHouseholdStore()
  const profileMode = useProfileStore(s => s.mode)
  const profileHouseholdId = useProfileStore(s => s.householdId)
  const profileHouseholdName = useProfileStore(s => s.householdName)
  const switching = useProfileStore(s => s.switching)
  const importing = useProfileStore(s => s.importing)
  const syncError = useProfileStore(s => s.syncError)

  const [newName, setNewName] = useState('Our Household')
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    if (userId) hs.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const current = hs.households.find(h => h.householdId === hs.currentId) || null
  const isOwner = current?.role === 'owner'
  const activeCloudHere = profileMode === 'cloud' && !!current && profileHouseholdId === current.householdId

  async function copyCode() {
    if (!hs.invite) return
    try {
      await navigator.clipboard.writeText(hs.invite.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* code is visible to type manually */ }
  }

  async function doImport() {
    setImportMsg('')
    try {
      const n = await useProfileStore.getState().importLocalIntoHousehold()
      setImportMsg(n > 0
        ? `Imported ${n} new item${n === 1 ? '' : 's'} into the household.`
        : 'Nothing new to import — everything from your local budget is already in this household.')
    } catch { /* syncError surfaces the reason */ }
    setConfirmImport(false)
  }

  const joinRow = (
    <div style={{ marginTop: 12 }}>
      <p style={label}>Join a household by code</p>
      <div style={rowWrap}>
        <input
          style={{ ...input, flex: 1, minWidth: 140, letterSpacing: '0.1em' }}
          value={joinCode}
          onChange={e => setJoinCode(e.target.value)}
          placeholder="e.g. ABCD 2345"
        />
        <button
          style={ghost}
          disabled={hs.busy || !joinCode.trim()}
          onClick={() => { hs.clearError(); hs.joinByCode(joinCode).then(() => setJoinCode('')) }}
        >
          {hs.busy ? 'Working…' : 'Join'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-parchment-dark)' }}>
      {/* Active profile indicator */}
      <div style={banner(profileMode === 'cloud')}>
        {profileMode === 'cloud'
          ? <>● Live sync — <strong>{profileHouseholdName ?? 'household'}</strong></>
          : <>○ Local budget (offline, on this device)</>}
        {switching && <span style={{ fontWeight: 400 }}> · switching…</span>}
      </div>
      {syncError && (
        <div style={errBox}>
          <span style={{ flex: 1 }}>{syncError}</span>
          <button style={linkBtnSmall} onClick={() => useProfileStore.getState().setSyncError(null)}>dismiss</button>
        </div>
      )}

      {hs.loading && !current ? (
        <p style={{ ...muted, marginTop: 8 }}>Loading household…</p>
      ) : current ? (
        <>
          <div style={rowWrap}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={label}>Household</p>
              <p style={{ ...text, margin: 0, fontWeight: 600 }}>{current.name}</p>
              <p style={{ ...muted, margin: '2px 0 0' }}>
                You are {current.role === 'owner' ? 'the owner' : 'a member'}.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {hs.households.length > 1 && (
                <select value={hs.currentId ?? ''} onChange={e => hs.setCurrent(e.target.value)} style={input}>
                  {hs.households.map(h => <option key={h.householdId} value={h.householdId}>{h.name}</option>)}
                </select>
              )}
              {activeCloudHere && (
                <button
                  style={ghost}
                  disabled={refreshing}
                  onClick={async () => { setRefreshing(true); try { await reloadActiveProfile() } finally { setRefreshing(false) } }}
                  title="Changes sync live automatically — this forces a full re-pull"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              )}
            </div>
          </div>

          {/* Switch controls */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {activeCloudHere ? (
              <button style={ghost} disabled={switching} onClick={() => useProfileStore.getState().useLocal()}>
                Switch to Local
              </button>
            ) : (
              <button
                style={primary}
                disabled={switching}
                onClick={() => useProfileStore.getState().useHousehold(current.householdId, current.name)}
              >
                {switching ? 'Switching…' : 'Use this household (live sync)'}
              </button>
            )}
          </div>

          <p style={{ ...label, marginTop: 16 }}>Members ({hs.members.length})</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 4px' }}>
            {hs.members.map(m => (
              <li key={m.userId} style={{ ...text, display: 'flex', justifyContent: 'space-between', padding: '4px 0', gap: 12 }}>
                <span>{m.userId === userId ? `${email ?? 'You'} (you)` : `Member · ${m.userId.slice(0, 8)}`}</span>
                <span style={{ ...muted, textTransform: 'capitalize' }}>{m.role}</span>
              </li>
            ))}
          </ul>

          {isOwner && (
            <div style={{ marginTop: 8 }}>
              {hs.invite ? (
                <div style={box}>
                  <p style={label}>Invite code</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <code style={codeStyle}>{formatInviteCode(hs.invite.code)}</code>
                    <button style={ghost} onClick={copyCode}>{copied ? 'Copied!' : 'Copy'}</button>
                  </div>
                  <p style={{ ...muted, marginTop: 6 }}>
                    Expires {new Date(hs.invite.expiresAt).toLocaleDateString()} · used {hs.invite.uses} of {hs.invite.maxUses}. Share it with your partner.
                  </p>
                </div>
              ) : (
                <button style={primary} disabled={hs.busy} onClick={() => hs.generateInvite()}>
                  {hs.busy ? 'Working…' : 'Generate invite code'}
                </button>
              )}
            </div>
          )}

          {/* One-time import of the local budget into this household */}
          {activeCloudHere && (
            <div style={{ marginTop: 16 }}>
              {!confirmImport ? (
                <button style={ghost} disabled={importing} onClick={() => { setImportMsg(''); setConfirmImport(true) }}>
                  Import my local budget into this household
                </button>
              ) : (
                <div style={box}>
                  <p style={{ ...text, marginTop: 0 }}>
                    Upload your local budget — income, groups, categories, payment methods, expenses, and settings —
                    into <strong>{current.name}</strong>? Your local data stays untouched.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={primary} disabled={importing} onClick={doImport}>{importing ? 'Importing…' : 'Confirm import'}</button>
                    <button style={ghost} disabled={importing} onClick={() => setConfirmImport(false)}>Cancel</button>
                  </div>
                </div>
              )}
              {importMsg && <p style={{ ...muted, marginTop: 8 }}>{importMsg}</p>}
            </div>
          )}

          {joinRow}
        </>
      ) : (
        <>
          <p style={label}>Create a household</p>
          <div style={rowWrap}>
            <input
              style={{ ...input, flex: 1, minWidth: 160 }}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Household name"
            />
            <button style={primary} disabled={hs.busy} onClick={() => hs.createHousehold(newName)}>
              {hs.busy ? 'Working…' : 'Create'}
            </button>
          </div>
          {joinRow}
        </>
      )}

      {hs.error && <p style={{ ...text, color: 'var(--color-burgundy)', marginTop: 10, marginBottom: 0 }}>{hs.error}</p>}
    </div>
  )
}

const banner = (cloud: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, padding: '8px 12px',
  borderRadius: 6, marginBottom: 10,
  color: cloud ? 'var(--color-navy-soft)' : 'var(--color-ink-soft)',
  backgroundColor: cloud ? 'rgba(37,99,235,0.08)' : 'var(--color-parchment)',
  border: `1px solid ${cloud ? 'var(--color-navy-soft)' : 'var(--color-parchment-dark)'}`,
})
const errBox: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-body)', fontSize: 13,
  color: 'var(--color-burgundy)', backgroundColor: 'rgba(220,38,38,0.07)',
  border: '1px solid var(--color-burgundy)', borderRadius: 6, padding: '8px 12px', marginBottom: 10,
}
const rowWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
const label: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--color-ink-soft)', margin: '0 0 6px',
}
const text: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)' }
const muted: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-ink-soft)' }
const input: React.CSSProperties = {
  padding: '9px 11px', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink)',
  border: '1px solid var(--color-gold)', borderRadius: 6, outline: 'none', backgroundColor: 'white',
}
const box: React.CSSProperties = {
  border: '1px dashed var(--color-gold-deep)', borderRadius: 8, padding: '12px 14px',
  backgroundColor: 'var(--color-parchment-light)',
}
const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 22, fontWeight: 700,
  letterSpacing: '0.18em', color: 'var(--color-navy)',
}
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
const linkBtnSmall: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--color-burgundy)', fontSize: 12,
  fontFamily: 'var(--font-body)', cursor: 'pointer', textDecoration: 'underline', padding: 0, flexShrink: 0,
}
