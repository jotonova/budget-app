import { useEffect, useMemo, useRef, useState } from 'react'
import { useLedgerStore } from '../store/ledgerStore'
import { useAuthStore } from '../store/authStore'
import { useHouseholdStore } from '../store/householdStore'
import { useProfileStore } from '../store/profileStore'
import { markDeviceOnboarded } from '../lib/persistence'
import { useIsMobile } from '../lib/useIsMobile'
import { generateId, formatCurrency } from '../lib/utils'
import { formatInviteCode } from '../lib/inviteCode'

interface Props {
  onClose: () => void
}

// ── Income frequency → monthly conversion ──────────────────────────────────────
// The ledger stores a single monthly income amount per source (same field as
// Settings). Frequency here is a UI convenience that converts to that monthly
// amount before it is stored — it does not change the data model.

type Frequency = 'monthly' | 'weekly' | 'biweekly' | 'yearly'

const FREQ_LABEL: Record<Frequency, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  yearly: 'Yearly',
}
const FREQ_TO_MONTHLY: Record<Frequency, number> = {
  monthly: 1,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  yearly: 1 / 12,
}

function toMonthly(amountStr: string, freq: Frequency): number {
  const n = parseFloat(amountStr)
  if (isNaN(n) || n < 0) return 0
  return Math.round(n * FREQ_TO_MONTHLY[freq] * 100) / 100
}
function parseBudget(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) || n < 0 ? 0 : n
}

// ── Suggested starter categories ───────────────────────────────────────────────

interface Suggested { name: string; essential: boolean; type?: 'savings' }
const SUGGESTED: Suggested[] = [
  { name: 'Housing/Rent', essential: true },
  { name: 'Utilities', essential: true },
  { name: 'Groceries', essential: true },
  { name: 'Transportation', essential: true },
  { name: 'Insurance', essential: true },
  { name: 'Phone & Internet', essential: true },
  { name: 'Savings', essential: true, type: 'savings' },
  { name: 'Dining Out', essential: false },
  { name: 'Entertainment', essential: false },
  { name: 'Subscriptions', essential: false },
  { name: 'Personal', essential: false },
  { name: 'Misc', essential: false },
]

interface IncomeRow { id: string; name: string; amount: string; freq: Frequency }
interface CatRow { id: string; name: string; essential: boolean; type?: 'savings'; checked: boolean; budget: string }

export default function Onboarding({ onClose }: Props) {
  const commitOnboarding = useLedgerStore(s => s.commitOnboarding)
  const updateSettings = useLedgerStore(s => s.updateSettings)

  // Sharing step
  const authConfigured = useAuthStore(s => s.configured)
  const authStatus = useAuthStore(s => s.status)
  const authError = useAuthStore(s => s.error)
  const email = useAuthStore(s => s.user?.email)
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle)
  const profileMode = useProfileStore(s => s.mode)
  const profileHouseholdName = useProfileStore(s => s.householdName)
  const hs = useHouseholdStore()
  const isOwner = hs.households.find(h => h.householdId === hs.currentId)?.role === 'owner'
  const isMobile = useIsMobile()

  const [step, setStep] = useState(0)
  // True once the user JOINS an existing household during setup. Joiners skip the
  // income/categories entry steps and commit nothing — the household already has
  // its data — so two partners can't create duplicate rows.
  const [joined, setJoined] = useState(false)
  const [shareName, setShareName] = useState('Our Household')
  const [shareCode, setShareCode] = useState('')
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [budgetName, setBudgetName] = useState('')
  const [income, setIncome] = useState<IncomeRow[]>([{ id: generateId(), name: '', amount: '', freq: 'monthly' }])
  const [cats, setCats] = useState<CatRow[]>(() =>
    SUGGESTED.map(s => ({ id: generateId(), name: s.name, essential: s.essential, type: s.type, checked: true, budget: '' })),
  )
  const [newCatName, setNewCatName] = useState('')
  const [newCatEssential, setNewCatEssential] = useState(true)

  const dialogRef = useRef<HTMLDivElement>(null)

  // ── Derived payload ──────────────────────────────────────────────────────────
  const builtIncome = useMemo(
    () => income
      .map(r => ({ name: r.name.trim(), monthly: toMonthly(r.amount, r.freq) }))
      .filter(r => r.name !== '' && r.monthly > 0),
    [income],
  )
  const builtCategories = useMemo(
    () => cats
      .filter(c => c.checked && c.name.trim() !== '')
      .map(c => ({ name: c.name.trim(), essential: c.essential, budgeted: parseBudget(c.budget), type: c.type })),
    [cats],
  )
  const totalMonthlyIncome = builtIncome.reduce((s, r) => s + r.monthly, 0)

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function markDone() {
    // `onboarded` is a per-device flag. In cloud mode commitOnboarding writes to
    // the household (which doesn't store it), so stamp the local file directly.
    if (useProfileStore.getState().mode === 'cloud') await markDeviceOnboarded()
    else updateSettings({ onboarded: true })
  }
  async function handleSkip() {
    await markDone()
    onClose()
  }
  async function handleFinish() {
    // A joiner enters nothing — committing would duplicate the household's data.
    if (!joined) {
      commitOnboarding({
        budgetName: budgetName.trim() || undefined,
        income: builtIncome,
        categories: builtCategories,
      })
    }
    await markDone()
    onClose()
  }
  async function copyInvite() {
    if (!hs.invite) return
    try { await navigator.clipboard.writeText(hs.invite.code); setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 1500) } catch { /* visible to type */ }
  }

  // Joiners follow a shortened flow: Welcome → Share → You're all set.
  const stepOrder = joined ? [0, 1, 5] : [0, 1, 2, 3, 4, 5]
  const posInFlow = Math.max(0, stepOrder.indexOf(step))
  const totalVisible = stepOrder.length
  const isLast = posInFlow === totalVisible - 1
  const next = () => setStep(stepOrder[Math.min(posInFlow + 1, totalVisible - 1)])
  const back = () => setStep(stepOrder[Math.max(posInFlow - 1, 0)])

  // ── Focus trap + keyboard nav + scroll lock ───────────────────────────────────
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  useEffect(() => {
    const node = dialogRef.current
    if (!node) return
    const getFocusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'),
      ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)

    getFocusable()[0]?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); handleSkip(); return }
      if (e.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const titleId = 'onboarding-step-title'

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(15,23,42,0.55)', padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          backgroundColor: 'var(--color-parchment-light)', borderRadius: 14,
          boxShadow: '0 12px 48px rgba(15,23,42,0.35)', overflow: 'hidden',
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* Progress */}
        <div style={{ padding: '20px 28px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {Array.from({ length: totalVisible }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 6, borderRadius: 3, flex: i === posInFlow ? '0 0 28px' : '0 0 10px',
                  backgroundColor: i <= posInFlow ? 'var(--color-navy-soft)' : 'var(--color-parchment-dark)',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ink-soft)' }}>
            Step {posInFlow + 1} of {totalVisible}
          </span>
        </div>

        {/* Step content */}
        <div style={{ padding: '18px 28px 24px', overflowY: 'auto', flex: 1 }}>
          {step === 0 && (
            <div>
              <h2 id={titleId} style={h2Style}>Welcome to your budget</h2>
              <p style={bodyStyle}>
                Let's set up your budget. It lives on this device by default. On the next step you can
                choose to share it with a partner and sync live — set that up first so everything you
                add flows straight to both of you. This quick setup is optional; you can skip anytime.
              </p>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 id={titleId} style={h2Style}>Share with a partner?</h2>
              <p style={bodyStyle}>
                Keep this budget in sync with a partner — live on both your devices. Setting it up now
                means everything you add next goes straight to your shared household. Prefer to keep it
                on this device? Skip this; you can share later from Settings.
              </p>

              {!authConfigured ? (
                <p style={{ ...bodyStyle, color: 'var(--color-ink-soft)' }}>
                  Cloud sharing isn't available in this build — continuing on this device only.
                </p>
              ) : profileMode === 'cloud' ? (
                <div style={{ border: '1px solid var(--color-navy-soft)', backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: 8, padding: '14px 16px' }}>
                  <p style={{ ...bodyStyle, margin: 0, color: 'var(--color-navy-soft)', fontWeight: 600 }}>
                    ● Sharing live with {profileHouseholdName ?? 'your household'} ({hs.members.length} member{hs.members.length === 1 ? '' : 's'})
                  </p>
                  <p style={{ ...bodyStyle, marginTop: 6, marginBottom: isOwner ? 12 : 0, color: 'var(--color-ink-soft)' }}>
                    Anything you add next appears on your partner's device.
                  </p>
                  {isOwner && (hs.invite ? (
                    <div>
                      <label style={labelStyle}>Invite code — send it to your partner</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 20, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--color-navy)' }}>{formatInviteCode(hs.invite.code)}</code>
                        <button style={ghostBtn} onClick={copyInvite}>{copiedInvite ? 'Copied!' : 'Copy'}</button>
                      </div>
                    </div>
                  ) : (
                    <button style={ghostBtn} disabled={hs.busy} onClick={() => hs.generateInvite()}>{hs.busy ? 'Working…' : 'Generate invite code'}</button>
                  ))}
                </div>
              ) : authStatus === 'signed-in' ? (
                <div>
                  <p style={{ ...bodyStyle, color: 'var(--color-ink-soft)' }}>Signed in as {email}.</p>
                  <label style={labelStyle}>Create a household</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    <input style={{ ...inputStyle, flex: '1 1 160px' }} value={shareName} onChange={e => setShareName(e.target.value)} placeholder="Household name" />
                    <button style={primaryBtn} disabled={hs.busy} onClick={() => hs.createHousehold(shareName)}>{hs.busy ? 'Working…' : 'Create'}</button>
                  </div>
                  <label style={labelStyle}>Or join with a partner's code</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: '1 1 140px', letterSpacing: '0.1em' }} value={shareCode} onChange={e => setShareCode(e.target.value)} placeholder="e.g. ABCD 2345" />
                    <button style={ghostBtn} disabled={hs.busy || !shareCode.trim()} onClick={async () => { hs.clearError(); await hs.joinByCode(shareCode); if (!useHouseholdStore.getState().error) { setJoined(true); setShareCode('') } }}>{hs.busy ? 'Working…' : 'Join'}</button>
                  </div>
                  {hs.error && <p style={{ ...bodyStyle, color: 'var(--color-burgundy)', marginTop: 10 }}>{hs.error}</p>}
                </div>
              ) : (
                <div>
                  <button style={primaryBtn} disabled={authStatus === 'signing-in'} onClick={() => signInWithGoogle()}>
                    {authStatus === 'signing-in' ? 'Signing in…' : 'Sign in with Google'}
                  </button>
                  <p style={{ ...bodyStyle, color: 'var(--color-ink-soft)', marginTop: 12 }}>
                    Sign in to create or join a shared household. You can also skip and stay on this device.
                  </p>
                  {authError && <p style={{ ...bodyStyle, color: 'var(--color-burgundy)', marginTop: 6 }}>{authError}</p>}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 id={titleId} style={h2Style}>Name your budget</h2>
              <p style={bodyStyle}>Give it a name if you like — this shows in the header. You can leave it blank.</p>
              <label style={labelStyle} htmlFor="ob-budget-name">Budget name (optional)</label>
              <input
                id="ob-budget-name"
                type="text"
                value={budgetName}
                onChange={e => setBudgetName(e.target.value)}
                placeholder="e.g. Our Household"
                style={inputStyle}
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 id={titleId} style={h2Style}>Add your income</h2>
              <p style={bodyStyle}>Add one or more income sources. Optional — you can add these later.</p>
              {income.map(row => {
                const preview = row.freq !== 'monthly' ? toMonthly(row.amount, row.freq) : 0
                return (
                  <div key={row.id} style={{ marginBottom: 14, padding: 14, border: '1px solid var(--color-gold)', borderRadius: 8, backgroundColor: 'white' }}>
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => setIncome(prev => prev.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                      placeholder="Source name (e.g. Salary)"
                      aria-label="Income source name"
                      style={{ ...inputStyle, marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-gold)', borderRadius: 6, backgroundColor: 'white', flex: '1 1 130px' }}>
                        <span style={{ padding: '0 10px', color: 'var(--color-ink-soft)' }}>$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={e => setIncome(prev => prev.map(r => r.id === row.id ? { ...r, amount: e.target.value.replace(/[^\d.]/g, '') } : r))}
                          placeholder="0.00"
                          aria-label="Income amount"
                          style={{ ...inputStyle, border: 'none', padding: '10px 10px 10px 0' }}
                        />
                      </div>
                      <select
                        value={row.freq}
                        onChange={e => setIncome(prev => prev.map(r => r.id === row.id ? { ...r, freq: e.target.value as Frequency } : r))}
                        aria-label="Income frequency"
                        style={{ ...inputStyle, flex: '0 0 auto', width: 'auto', cursor: 'pointer' }}
                      >
                        {(Object.keys(FREQ_LABEL) as Frequency[]).map(f => (
                          <option key={f} value={f}>{FREQ_LABEL[f]}</option>
                        ))}
                      </select>
                      {income.length > 1 && (
                        <button onClick={() => setIncome(prev => prev.filter(r => r.id !== row.id))} style={{ ...linkBtn, ...(isMobile ? { padding: '10px 12px', minHeight: 44 } : {}) }} aria-label="Remove income source">Remove</button>
                      )}
                    </div>
                    {preview > 0 && (
                      <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', margin: '8px 0 0' }}>
                        ≈ {formatCurrency(preview)}/mo
                      </p>
                    )}
                  </div>
                )
              })}
              <button
                onClick={() => setIncome(prev => [...prev, { id: generateId(), name: '', amount: '', freq: 'monthly' }])}
                style={{ ...ghostBtn, marginTop: 4 }}
              >
                + Add another source
              </button>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 id={titleId} style={h2Style}>Starter categories</h2>
              <p style={bodyStyle}>Pick the categories to start with. Only the checked ones are created. You can set a monthly budget now or later.</p>
              {(['Essential', 'Non-Essential'] as const).map(groupLabel => {
                const essential = groupLabel === 'Essential'
                const rows = cats.filter(c => c.essential === essential)
                return (
                  <div key={groupLabel} style={{ marginBottom: 18 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-navy)', margin: '0 0 8px' }}>
                      {groupLabel}
                    </p>
                    {rows.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '10px 0' : '7px 0' }}>
                        <input
                          type="checkbox"
                          checked={c.checked}
                          onChange={e => setCats(prev => prev.map(x => x.id === c.id ? { ...x, checked: e.target.checked } : x))}
                          aria-label={`Include ${c.name}`}
                          style={{ width: isMobile ? 24 : 17, height: isMobile ? 24 : 17, accentColor: 'var(--color-navy-soft)', flexShrink: 0, cursor: 'pointer' }}
                        />
                        <span
                          onClick={isMobile ? () => setCats(prev => prev.map(x => x.id === c.id ? { ...x, checked: !x.checked } : x)) : undefined}
                          style={{ flex: 1, fontSize: 15, color: c.checked ? 'var(--color-ink)' : 'var(--color-ink-soft)', cursor: isMobile ? 'pointer' : undefined, padding: isMobile ? '6px 0' : 0 }}
                        >{c.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-gold)', borderRadius: 6, backgroundColor: c.checked ? 'white' : 'var(--color-parchment)', width: 120 }}>
                          <span style={{ padding: '0 8px', color: 'var(--color-ink-soft)', fontSize: 14 }}>$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={c.budget}
                            disabled={!c.checked}
                            onChange={e => setCats(prev => prev.map(x => x.id === c.id ? { ...x, budget: e.target.value.replace(/[^\d.]/g, '') } : x))}
                            placeholder="0"
                            aria-label={`${c.name} monthly budget`}
                            style={{ ...inputStyle, border: 'none', padding: '7px 8px 7px 0', fontSize: 14, backgroundColor: 'transparent' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}

              {/* Add your own */}
              <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-parchment-dark)' }}>
                <label style={labelStyle} htmlFor="ob-new-cat">Add your own</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    id="ob-new-cat"
                    type="text"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                    placeholder="Category name"
                    style={{ ...inputStyle, flex: '1 1 160px' }}
                  />
                  <select
                    value={newCatEssential ? 'essential' : 'non'}
                    onChange={e => setNewCatEssential(e.target.value === 'essential')}
                    aria-label="New category group"
                    style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
                  >
                    <option value="essential">Essential</option>
                    <option value="non">Non-Essential</option>
                  </select>
                  <button onClick={addCustom} style={ghostBtn} disabled={!newCatName.trim()}>Add</button>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 id={titleId} style={h2Style}>You're all set</h2>
              {joined ? (
                <>
                  <p style={bodyStyle}>
                    You've joined <strong>{profileHouseholdName ?? 'the household'}</strong>. Your partner's
                    budget loads when you finish, and anything either of you adds syncs live.
                  </p>
                  <p style={{ ...bodyStyle, color: 'var(--color-ink-soft)' }}>
                    Nothing to enter here — the household already has its income and categories. Add
                    expenses from the Dashboard.
                  </p>
                </>
              ) : (
                <>
                  <p style={bodyStyle}>
                    {budgetName.trim() ? <><strong>{budgetName.trim()}</strong> is ready. </> : null}
                    We'll add{' '}
                    <strong>{builtIncome.length}</strong> income {builtIncome.length === 1 ? 'source' : 'sources'}
                    {totalMonthlyIncome > 0 ? ` (${formatCurrency(totalMonthlyIncome)}/mo)` : ''} and{' '}
                    <strong>{builtCategories.length}</strong> {builtCategories.length === 1 ? 'category' : 'categories'}
                    {profileMode === 'cloud'
                      ? <> to your shared household <strong>{profileHouseholdName ?? ''}</strong> — live for your partner.</>
                      : '.'}
                  </p>
                  <p style={{ ...bodyStyle, color: 'var(--color-ink-soft)' }}>
                    You can change everything anytime in Settings, and add expenses from the Dashboard.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid var(--color-parchment-dark)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {posInFlow > 0 ? (
            <button onClick={back} style={ghostBtn}>Back</button>
          ) : <span />}
          <button onClick={handleSkip} style={{ ...linkBtn, marginLeft: 'auto' }}>Skip for now</button>
          {!isLast ? (
            <button onClick={next} style={primaryBtn}>Next</button>
          ) : (
            <button onClick={handleFinish} style={primaryBtn}>Done</button>
          )}
        </div>
      </div>
    </div>
  )

  function addCustom() {
    const name = newCatName.trim()
    if (!name) return
    setCats(prev => [...prev, { id: generateId(), name, essential: newCatEssential, checked: true, budget: '' }])
    setNewCatName('')
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700,
  color: 'var(--color-navy)', margin: '0 0 10px', letterSpacing: '-0.01em',
}
const bodyStyle: React.CSSProperties = {
  fontSize: 15, lineHeight: 1.6, color: 'var(--color-ink)', margin: '0 0 16px',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em',
  color: 'var(--color-navy)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 15, fontFamily: 'var(--font-body)',
  color: 'var(--color-ink)', border: '1px solid var(--color-gold)', borderRadius: 6,
  backgroundColor: 'white', outline: 'none', boxSizing: 'border-box',
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 26px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
  borderRadius: 6, border: 'none', backgroundColor: 'var(--color-navy)',
  color: 'var(--color-parchment)', cursor: 'pointer',
}
const ghostBtn: React.CSSProperties = {
  padding: '10px 20px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
  borderRadius: 6, border: '1px solid var(--color-navy)', backgroundColor: 'transparent',
  color: 'var(--color-navy)', cursor: 'pointer',
}
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--color-ink-soft)', fontSize: 14,
  fontFamily: 'var(--font-body)', cursor: 'pointer', padding: '6px 4px', textDecoration: 'underline',
}
