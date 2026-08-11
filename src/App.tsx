import { useEffect, useState } from 'react'
import { loadLedger } from './lib/persistence'
import { isWeb, isDesktop } from './lib/platform'
import { useIsMobile } from './lib/useIsMobile'
import WebSignIn from './components/WebSignIn'
import MobileNav from './components/MobileNav'
import { useLedgerStore } from './store/ledgerStore'
import { useAuthStore } from './store/authStore'
import { useHouseholdStore } from './store/householdStore'
import { useProfileStore } from './store/profileStore'
import Dashboard from './components/Dashboard'
import AddExpense from './components/AddExpense'
import CategoryDetail from './components/CategoryDetail'
import LedgerView from './components/LedgerView'
import SettingsScreen from './components/SettingsScreen'
import YearToDate from './components/YearToDate'
import ExpenseModal from './components/ExpenseModal'
import Onboarding from './components/Onboarding'
import Toast from './components/Toast'
import { formatCurrency } from './lib/utils'
import type { Expense } from './lib/types'

type Page = 'dashboard' | 'add-expense' | 'category-detail' | 'ledger' | 'settings' | 'ytd'

interface ToastData {
  id: string
  message: string
  /** expenseId present for add-undo; deletedExpense present for delete-undo */
  expenseId?: string
  deletedExpense?: Expense
}

export default function App() {
  const init = useLedgerStore(s => s.init)
  const updateExpense = useLedgerStore(s => s.updateExpense)
  const deleteExpense = useLedgerStore(s => s.deleteExpense)
  const restoreExpense = useLedgerStore(s => s.restoreExpense)
  const data = useLedgerStore(s => s.data)

  const [page, setPage] = useState<Page>('dashboard')
  const [initError, setInitError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [detailCategoryId, setDetailCategoryId] = useState<string | null>(null)
  const [addExpenseCategoryId, setAddExpenseCategoryId] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isWeb) { setReady(true); return } // web has no local file; sign-in gates the app
    loadLedger()
      .then(d => {
        init(d)
        setReady(true)
        if (!d.settings.onboarded) setShowOnboarding(true)
      })
      .catch(err => { console.error('Failed to load ledger:', err); setInitError(String(err)) })
  }, [init])

  // Restore any existing cloud session (local/offline mode is unaffected).
  useEffect(() => { useAuthStore.getState().init() }, [])

  // Load the user's households as soon as they're signed in.
  const authStatus = useAuthStore(s => s.status)
  const activeHousehold = useHouseholdStore(s => s.currentId)
  useEffect(() => {
    if (authStatus === 'signed-in') useHouseholdStore.getState().load()
  }, [authStatus])

  // Switch the visible budget between local and the active cloud household.
  // (Signed in + a household => cloud mode; otherwise local. Local file untouched.)
  const activeHouseholdName = useHouseholdStore(
    s => s.households.find(h => h.householdId === s.currentId)?.name ?? null,
  )
  useEffect(() => {
    if (!ready) return
    const signedIn = authStatus === 'signed-in'
    const hid = signedIn ? activeHousehold : null
    if (hid) useProfileStore.getState().useHousehold(hid, activeHouseholdName ?? 'Household')
    else if (isDesktop) useProfileStore.getState().useLocal() // web has no local mode
  }, [authStatus, activeHousehold, activeHouseholdName, ready])

  // ── AddExpense callbacks ───────────────────────────────────────────────────

  function handleSaved(message: string, expenseId: string) {
    setToast({ id: crypto.randomUUID(), message, expenseId })
    setPage('dashboard')
  }

  function handleUndoAdd() {
    if (toast?.expenseId) deleteExpense(toast.expenseId)
    setToast(null)
  }

  // ── ExpenseModal callbacks ─────────────────────────────────────────────────

  function handleExpenseSave(id: string, updates: { amount: number; date: string; description: string; paymentMethodId?: string }) {
    updateExpense(id, updates)
    setEditingExpense(null)
  }

  function handleExpenseDelete(expense: Expense) {
    const catName = data?.categories.find(c => c.id === expense.categoryId)?.name ?? 'entry'
    deleteExpense(expense.id)
    setEditingExpense(null)
    setToast({
      id: crypto.randomUUID(),
      message: `Deleted ${formatCurrency(expense.amount)} from ${catName}`,
      deletedExpense: expense,
    })
  }

  function handleUndoDelete() {
    if (toast?.deletedExpense) restoreExpense(toast.deletedExpense)
    setToast(null)
  }

  function handleToastUndo() {
    if (toast?.deletedExpense) handleUndoDelete()
    else handleUndoAdd()
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (initError) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--color-parchment)', padding: 32,
        fontFamily: 'var(--font-body)', color: 'var(--color-navy)', textAlign: 'center',
      }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 16 }}>
          Could not open your budget
        </h1>
        <p style={{ color: 'var(--color-ink-soft)', maxWidth: 400, lineHeight: 1.7 }}>{initError}</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--color-parchment)', fontFamily: 'var(--font-display)',
        fontSize: 22, color: 'var(--color-ink-soft)', letterSpacing: '0.08em',
      }}>
        Opening your budget…
      </div>
    )
  }

  // Web is cloud-only: gate the whole app behind Google sign-in.
  if (isWeb && authStatus !== 'signed-in') {
    return <WebSignIn />
  }

  // ── Main render ────────────────────────────────────────────────────────────

  const editingCatName = editingExpense
    ? (data?.categories.find(c => c.id === editingExpense.categoryId)?.name ?? 'Entry')
    : ''

  function goToCategory(categoryId: string) {
    setDetailCategoryId(categoryId)
    setPage('category-detail')
  }

  function goAddExpenseForCategory(categoryId: string) {
    setAddExpenseCategoryId(categoryId)
    setPage('add-expense')
  }

  return (
    <>
      {page === 'add-expense' && (
        <AddExpense
          initialCategoryId={addExpenseCategoryId ?? undefined}
          onSaved={(msg, id) => { setAddExpenseCategoryId(null); handleSaved(msg, id) }}
          onCancel={() => { setAddExpenseCategoryId(null); setPage(detailCategoryId ? 'category-detail' : 'dashboard') }}
        />
      )}
      {page === 'category-detail' && detailCategoryId && (
        <CategoryDetail
          categoryId={detailCategoryId}
          onBack={() => setPage('dashboard')}
          onExpenseClick={setEditingExpense}
          onAddExpense={() => goAddExpenseForCategory(detailCategoryId)}
        />
      )}
      {page === 'ledger' && (
        <LedgerView
          onBack={() => setPage('dashboard')}
          onExpenseClick={setEditingExpense}
        />
      )}
      {page === 'settings' && (
        <SettingsScreen
          onBack={() => setPage('dashboard')}
          onRerunSetup={() => { setPage('dashboard'); setShowOnboarding(true) }}
        />
      )}
      {page === 'ytd' && (
        <YearToDate onBack={() => setPage('dashboard')} />
      )}
      {page === 'dashboard' && (
        <Dashboard
          onAddExpense={() => { setAddExpenseCategoryId(null); setPage('add-expense') }}
          onExpenseClick={setEditingExpense}
          onCategoryClick={goToCategory}
          onViewLedger={() => setPage('ledger')}
          onSettings={() => setPage('settings')}
          onYearToDate={() => setPage('ytd')}
        />
      )}

      {/* App-level expense edit modal */}
      {editingExpense && (
        <ExpenseModal
          expense={editingExpense}
          categoryName={editingCatName}
          onSave={handleExpenseSave}
          onDelete={handleExpenseDelete}
          onCancel={() => setEditingExpense(null)}
        />
      )}

      {/* App-level undo toast */}
      {toast && (
        <Toast
          key={toast.id}
          message={`${toast.message}`}
          onUndo={handleToastUndo}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* First-run onboarding overlay */}
      {showOnboarding && (
        <Onboarding onClose={() => setShowOnboarding(false)} />
      )}

      {/* Mobile bottom navigation (hidden on desktop widths) */}
      {isMobile && !showOnboarding && (
        <MobileNav
          active={
            page === 'dashboard' ? 'dashboard'
              : page === 'ledger' ? 'ledger'
              : page === 'add-expense' ? 'add-expense'
              : page === 'settings' ? 'settings'
              : 'other'
          }
          onNavigate={(target) => {
            setEditingExpense(null)
            if (target === 'add-expense') { setAddExpenseCategoryId(null); setPage('add-expense') }
            else setPage(target)
          }}
        />
      )}
    </>
  )
}
