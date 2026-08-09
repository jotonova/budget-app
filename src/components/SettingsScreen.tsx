import { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { save, open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import SceneHeader from './scenes/SceneHeader'
import AccountPanel from './AccountPanel'
import { useLedgerStore } from '../store/ledgerStore'
import { persistChange } from '../lib/sync'
import { formatCurrency, generateId } from '../lib/utils'
import type { Category, Group, PaymentMethod } from '../lib/types'

interface Props {
  onBack: () => void
  onRerunSetup: () => void
}

// ── Sortable category row ──────────────────────────────────────────────────────

interface SortableCatProps {
  cat: Category
  onEdit: () => void
  onDelete: () => void
}

function SortableCategory({ cat, onEdit, onDelete }: SortableCatProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderTop: '1px solid var(--color-parchment-dark)',
        backgroundColor: 'white',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: 'var(--color-ink-soft)', fontSize: 16, userSelect: 'none', lineHeight: 1 }}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)' }}>
        {cat.name}
        {cat.fixed && <span style={{ marginLeft: 6, fontSize: 15, color: 'var(--color-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>fixed</span>}
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', minWidth: 80, textAlign: 'right' }}>
        {cat.budgeted > 0 ? formatCurrency(cat.budgeted) : 'no budget'}
      </span>
      <button onClick={onEdit} style={iconBtn}>✎</button>
      <button onClick={onDelete} style={{ ...iconBtn, color: 'var(--color-burgundy)' }}>✕</button>
    </div>
  )
}

// ── Sortable payment method row ───────────────────────────────────────────────

interface SortablePMProps {
  method: PaymentMethod
  onEdit: () => void
  onDelete: () => void
}

function SortablePaymentMethod({ method, onEdit, onDelete }: SortablePMProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: method.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderTop: '1px solid var(--color-parchment-dark)',
        backgroundColor: 'white',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: 'var(--color-ink-soft)', fontSize: 16, userSelect: 'none', lineHeight: 1 }}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)' }}>
        {method.name}
      </span>
      <button onClick={onEdit} style={iconBtn}>✎</button>
      <button onClick={onDelete} style={{ ...iconBtn, color: 'var(--color-burgundy)' }}>✕</button>
    </div>
  )
}

// ── Edit dialogs ───────────────────────────────────────────────────────────────

interface EditCatDialogProps {
  cat: Category
  groups: Group[]
  onSave: (updates: Partial<Category>) => void
  onClose: () => void
}

function EditCatDialog({ cat, groups, onSave, onClose }: EditCatDialogProps) {
  const [name, setName] = useState(cat.name)
  const [budgeted, setBudgeted] = useState(cat.budgeted > 0 ? String(cat.budgeted) : '')
  const [fixed, setFixed] = useState(cat.fixed)
  const [essential, setEssential] = useState(cat.essential)
  const [groupId, setGroupId] = useState(cat.groupId ?? '')
  const [alertThreshold, setAlertThreshold] = useState(cat.alertThreshold)
  const [notes, setNotes] = useState(cat.notes)

  function handleSave() {
    if (!name.trim()) return
    const b = parseFloat(budgeted)
    onSave({
      name: name.trim(),
      budgeted: isNaN(b) || b < 0 ? 0 : b,
      fixed,
      essential,
      groupId: groupId || null,
      alertThreshold,
      notes: notes.trim(),
    })
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={modalTitle}>Edit Category</h2>

        <label style={lbl}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inp} />

        <label style={lbl}>Monthly Budget ($)</label>
        <input value={budgeted} onChange={e => setBudgeted(e.target.value.replace(/[^\d.]/g,''))} placeholder="0 = no budget" style={inp} />

        <label style={lbl}>Group</label>
        <select value={groupId} onChange={e => setGroupId(e.target.value)} style={inp}>
          <option value="">— No group (standalone) —</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)' }}>
            <input type="checkbox" checked={fixed} onChange={e => setFixed(e.target.checked)} style={{ accentColor: 'var(--color-navy)' }} />
            Fixed bill
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)' }}>
            <input type="checkbox" checked={essential} onChange={e => setEssential(e.target.checked)} style={{ accentColor: 'var(--color-navy)' }} />
            Essential
          </label>
        </div>

        <label style={lbl}>Alert threshold ({alertThreshold}%)</label>
        <input type="range" min={50} max={100} value={alertThreshold} onChange={e => setAlertThreshold(Number(e.target.value))} style={{ width: '100%', marginBottom: 16, accentColor: 'var(--color-navy)' }} />

        <label style={lbl}>Notes (optional)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inp, marginBottom: 20 }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} style={primaryBtn}>Save</button>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Settings screen ───────────────────────────────────────────────────────

export default function SettingsScreen({ onBack, onRerunSetup }: Props) {
  const data = useLedgerStore(s => s.data)
  const init = useLedgerStore(s => s.init)
  const addPaymentMethod = useLedgerStore(s => s.addPaymentMethod)
  const updatePaymentMethod = useLedgerStore(s => s.updatePaymentMethod)
  const deletePaymentMethod = useLedgerStore(s => s.deletePaymentMethod)
  const reorderPaymentMethods = useLedgerStore(s => s.reorderPaymentMethods)

  const [activeSection, setActiveSection] = useState<'income' | 'categories' | 'paymentMethods' | 'defaults' | 'backup'>('income')
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editingPM, setEditingPM] = useState<PaymentMethod | null>(null)
  const [editingPMName, setEditingPMName] = useState('')
  const [newPMName, setNewPMName] = useState('')
  const [confirmDeletePM, setConfirmDeletePM] = useState<PaymentMethod | null>(null)
  const [feedback, setFeedback] = useState('')
  const [backupError, setBackupError] = useState('')

  // Local copies for editing
  const [incomeSources, setIncomeSources] = useState(() => data?.income.sources ?? [])
  const [categories, setCategories] = useState(() => (data?.categories ?? []).slice().sort((a, b) => a.order - b.order))
  const [groups, setGroups] = useState(() => (data?.groups ?? []).slice().sort((a, b) => a.order - b.order))
  const paymentMethods = useMemo(
    () => (data?.paymentMethods ?? []).slice().sort((a, b) => a.order - b.order),
    [data?.paymentMethods],
  )
  const [settings, setSettings] = useState(() => data?.settings ?? {
    alertThresholdDefault: 0.9, currency: 'USD' as const, monthStartDay: 1, appTitle: 'My Budget', onboarded: true,
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function persist(overrides?: { income?: typeof incomeSources; cats?: typeof categories; grps?: typeof groups; sett?: typeof settings }) {
    if (!data) return
    const next = {
      ...data,
      income: { sources: overrides?.income ?? incomeSources },
      categories: overrides?.cats ?? categories,
      groups: overrides?.grps ?? groups,
      settings: overrides?.sett ?? settings,
    }
    init(next)
    persistChange(data, next).catch(console.error)
  }

  function flash(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 3000)
  }

  // ── Income ──

  function handleIncomeChange(id: string, field: 'name' | 'monthly', value: string) {
    setIncomeSources(prev => {
      const next = prev.map(s => s.id === id ? { ...s, [field]: field === 'monthly' ? (parseFloat(value) || 0) : value } : s)
      persist({ income: next })
      return next
    })
  }

  function handleAddIncome() {
    const next = [...incomeSources, { id: generateId(), name: 'New Source', monthly: 0 }]
    setIncomeSources(next)
    persist({ income: next })
  }

  function handleDeleteIncome(id: string) {
    const next = incomeSources.filter(s => s.id !== id)
    setIncomeSources(next)
    persist({ income: next })
  }

  // ── Categories ──

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setCategories(prev => {
      const oldIdx = prev.findIndex(c => c.id === active.id)
      const newIdx = prev.findIndex(c => c.id === over.id)
      const next = arrayMove(prev, oldIdx, newIdx).map((c, i) => ({ ...c, order: i }))
      persist({ cats: next })
      return next
    })
  }

  function handlePMDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = paymentMethods.findIndex(m => m.id === active.id)
    const newIdx = paymentMethods.findIndex(m => m.id === over.id)
    const next = arrayMove(paymentMethods, oldIdx, newIdx).map((m, i) => ({ ...m, order: i }))
    reorderPaymentMethods(next)
  }

  function handleSaveCat(cat: Category, updates: Partial<Category>) {
    setCategories(prev => {
      const next = prev.map(c => c.id === cat.id ? { ...c, ...updates } : c)
      persist({ cats: next })
      return next
    })
    // Sync groups essential flag if needed
    setEditingCat(null)
    flash('Category saved.')
  }

  function handleDeleteCat(id: string) {
    setCategories(prev => {
      const next = prev.filter(c => c.id !== id)
      persist({ cats: next })
      return next
    })
    flash('Category deleted.')
  }

  function handleAddCategory() {
    const newCat: Category = {
      id: generateId(),
      name: 'New Category',
      budgeted: 0,
      essential: false,
      fixed: false,
      groupId: null,
      alertThreshold: settings.alertThresholdDefault,
      order: categories.length,
      notes: '',
    }
    setCategories(prev => {
      const next = [...prev, newCat]
      persist({ cats: next })
      return next
    })
    setEditingCat(newCat)
  }

  // ── Defaults ──

  function handleSettingChange<K extends keyof typeof settings>(key: K, value: typeof settings[K] | undefined) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      persist({ sett: next })
      return next
    })
  }

  // ── Backup ──

  async function handleBackupNow() {
    setBackupError('')
    try {
      const path = await save({
        defaultPath: `casanova-budget-backup-${new Date().toISOString().slice(0,10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!path || !data) return
      await invoke('write_ledger', { path, content: JSON.stringify(data, null, 2) })
      flash('Backup saved.')
    } catch (err) {
      setBackupError(String(err))
    }
  }

  async function handleRestoreBackup() {
    setBackupError('')
    try {
      const path = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      }) as string | null
      if (!path) return
      const content = await invoke<string>('read_ledger', { path })
      const restored = JSON.parse(content)
      init(restored)
      setIncomeSources(restored.income.sources)
      setCategories(restored.categories.slice().sort((a: Category, b: Category) => a.order - b.order))
      setGroups(restored.groups.slice().sort((a: Group, b: Group) => a.order - b.order))
      setSettings(restored.settings)
      flash('Data restored from backup.')
    } catch (err) {
      setBackupError(String(err))
    }
  }

  const catIds = useMemo(() => categories.map(c => c.id), [categories])
  const pmIds = useMemo(() => paymentMethods.map(m => m.id), [paymentMethods])

  const sectionTabs: Array<{ key: typeof activeSection; label: string }> = [
    { key: 'income', label: 'Income' },
    { key: 'categories', label: 'Categories' },
    { key: 'paymentMethods', label: 'Payment Methods' },
    { key: 'defaults', label: 'Defaults' },
    { key: 'backup', label: 'Backup' },
  ]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-parchment)' }}>
      <SceneHeader
        title="Settings"
        subtitle="Manage your budget configuration"
      />

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px 80px' }}>

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

        {/* Account / cloud sync */}
        <AccountPanel />

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '2px double var(--color-navy)', paddingBottom: 12 }}>
          {sectionTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveSection(t.key)}
              style={{
                padding: '8px 20px',
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                borderRadius: 6,
                border: `1px solid ${activeSection === t.key ? 'var(--color-navy)' : 'var(--color-gold)'}`,
                backgroundColor: activeSection === t.key ? 'var(--color-navy)' : 'transparent',
                color: activeSection === t.key ? 'var(--color-parchment)' : 'var(--color-ink)',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Feedback */}
        {feedback && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-navy)', marginBottom: 16, fontStyle: 'italic' }}>
            ✓ {feedback}
          </p>
        )}

        {/* ── INCOME ── */}
        {activeSection === 'income' && (
          <div>
            <SectionH>Income Sources</SectionH>
            <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white', marginBottom: 16 }}>
              {incomeSources.map((src, i) => (
                <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderTop: i > 0 ? '1px solid var(--color-parchment-dark)' : 'none' }}>
                  <input
                    value={src.name}
                    onChange={e => handleIncomeChange(src.id, 'name', e.target.value)}
                    style={{ flex: 1, ...inlineInp }}
                    placeholder="Source name"
                  />
                  <span style={{ color: 'var(--color-ink-soft)', fontSize: 20, fontFamily: 'var(--font-display)' }}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={src.monthly === 0 ? '' : String(src.monthly)}
                    onChange={e => handleIncomeChange(src.id, 'monthly', e.target.value)}
                    style={{ width: 120, ...inlineInp, textAlign: 'right' }}
                    placeholder="0.00"
                  />
                  <button onClick={() => handleDeleteIncome(src.id)} style={{ ...iconBtn, color: 'var(--color-burgundy)' }}>✕</button>
                </div>
              ))}
              {incomeSources.length === 0 && (
                <p style={{ padding: '20px', fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--color-ink-soft)', fontSize: 16 }}>
                  No income sources yet.
                </p>
              )}
            </div>
            <button onClick={handleAddIncome} style={addBtn}>+ Add Source</button>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', marginTop: 16 }}>
              Total monthly income: <strong style={{ color: 'var(--color-navy)' }}>{formatCurrency(incomeSources.reduce((s, src) => s + src.monthly, 0))}</strong>
            </p>
          </div>
        )}

        {/* ── CATEGORIES ── */}
        {activeSection === 'categories' && (
          <div>
            <SectionH>Categories</SectionH>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', marginBottom: 16 }}>
              Drag rows to reorder. Click ✎ to edit a category's name, budget, group, and alert threshold.
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={catIds} strategy={verticalListSortingStrategy}>
                <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white', marginBottom: 16 }}>
                  {categories.map(cat => (
                    <SortableCategory
                      key={cat.id}
                      cat={cat}
                      onEdit={() => setEditingCat(cat)}
                      onDelete={() => handleDeleteCat(cat.id)}
                    />
                  ))}
                  {categories.length === 0 && (
                    <p style={{ padding: '20px', fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--color-ink-soft)', fontSize: 16 }}>
                      No categories yet.
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>
            <button onClick={handleAddCategory} style={addBtn}>+ Add Category</button>
          </div>
        )}

        {/* ── PAYMENT METHODS ── */}
        {activeSection === 'paymentMethods' && (
          <div>
            <SectionH>Payment Methods</SectionH>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', marginBottom: 16 }}>
              Drag rows to reorder. Click ✎ to rename. Deleting a method reassigns its expenses to Unassigned.
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePMDragEnd}>
              <SortableContext items={pmIds} strategy={verticalListSortingStrategy}>
                <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'white', marginBottom: 16 }}>
                  {paymentMethods.map(m => (
                    <SortablePaymentMethod
                      key={m.id}
                      method={m}
                      onEdit={() => { setEditingPM(m); setEditingPMName(m.name) }}
                      onDelete={() => setConfirmDeletePM(m)}
                    />
                  ))}
                  {paymentMethods.length === 0 && (
                    <p style={{ padding: '20px', fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--color-ink-soft)', fontSize: 16 }}>
                      No payment methods yet.
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add new */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={newPMName}
                onChange={e => setNewPMName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newPMName.trim()) {
                    addPaymentMethod(newPMName.trim())
                    setNewPMName('')
                    flash('Payment method added.')
                  }
                }}
                placeholder="New method name…"
                style={{ ...inp, flex: 1, marginBottom: 0 }}
              />
              <button
                onClick={() => {
                  if (!newPMName.trim()) return
                  addPaymentMethod(newPMName.trim())
                  setNewPMName('')
                  flash('Payment method added.')
                }}
                style={addBtn}
              >
                + Add
              </button>
            </div>
          </div>
        )}

        {/* ── DEFAULTS ── */}
        {activeSection === 'defaults' && (
          <div>
            <SectionH>Defaults & Display</SectionH>

            <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, backgroundColor: 'white', overflow: 'hidden' }}>
              {/* Header title & subtitle */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-parchment-dark)' }}>
                <label style={lbl} htmlFor="set-app-title">Header Title</label>
                <input
                  id="set-app-title"
                  type="text"
                  value={settings.appTitle ?? ''}
                  onChange={e => handleSettingChange('appTitle', e.target.value)}
                  placeholder="My Budget"
                  style={{ ...inlineInp, width: '100%', maxWidth: 360, display: 'block' }}
                />
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', margin: '6px 0 18px' }}>
                  The large title at the top of the Dashboard.
                </p>
                <label style={lbl} htmlFor="set-budget-name">Header Subtitle</label>
                <input
                  id="set-budget-name"
                  type="text"
                  value={settings.budgetName ?? ''}
                  onChange={e => handleSettingChange('budgetName', e.target.value || undefined)}
                  placeholder="e.g. Our Household"
                  style={{ ...inlineInp, width: '100%', maxWidth: 360, display: 'block' }}
                />
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', margin: '6px 0 0' }}>
                  Optional line under the title. Leave blank to show the date.
                </p>
              </div>

              {/* Alert threshold */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-parchment-dark)' }}>
                <label style={lbl}>Default Alert Threshold ({Math.round(settings.alertThresholdDefault * 100)}% of budget)</label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={Math.round(settings.alertThresholdDefault * 100)}
                  onChange={e => handleSettingChange('alertThresholdDefault', Number(e.target.value) / 100)}
                  style={{ width: '100%', accentColor: 'var(--color-navy)' }}
                />
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', marginTop: 6 }}>
                  Variable categories send a notification when spending crosses this percentage.
                </p>
              </div>

              {/* Re-run setup */}
              <div style={{ padding: '18px 20px' }}>
                <label style={lbl}>First-Run Setup</label>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', margin: '6px 0 12px' }}>
                  Reopen the guided setup to add income sources and starter categories.
                </p>
                <button
                  onClick={onRerunSetup}
                  style={{
                    padding: '10px 22px',
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: '1px solid var(--color-navy)',
                    backgroundColor: 'transparent',
                    color: 'var(--color-navy)',
                    cursor: 'pointer',
                  }}
                >
                  Re-run setup
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ── BACKUP ── */}
        {activeSection === 'backup' && (
          <div>
            <SectionH>Backup & Data</SectionH>

            {/* Tracking start date */}
            <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, backgroundColor: 'white', overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '20px' }}>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color: 'var(--color-navy)', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Tracking Start Date
                </label>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-ink-soft)', marginBottom: 12 }}>
                  The date expense tracking began. Months before this date are excluded from the Year to Date view.
                </p>
                <input
                  type="date"
                  value={settings.trackingStartDate ?? ''}
                  onChange={e => handleSettingChange('trackingStartDate', e.target.value || undefined)}
                  style={{ fontFamily: 'var(--font-body)', fontSize: 14, border: '1px solid var(--color-gold)', borderRadius: 6, padding: '8px 12px', color: 'var(--color-ink)', backgroundColor: 'white' }}
                />
              </div>
            </div>

            <div style={{ border: '1px solid var(--color-gold)', borderRadius: 8, backgroundColor: 'white', overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--color-parchment-dark)' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, color: 'var(--color-ink)', marginBottom: 6 }}>
                  Export Backup
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', marginBottom: 14 }}>
                  Save a complete copy of all budget data as a JSON file.
                </p>
                <button onClick={handleBackupNow} style={primaryBtn}>Save Backup…</button>
              </div>
              <div style={{ padding: '20px' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, color: 'var(--color-ink)', marginBottom: 6 }}>
                  Restore from Backup
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink-soft)', marginBottom: 14 }}>
                  Replace all current data with a previously saved backup. This cannot be undone.
                </p>
                <button onClick={handleRestoreBackup} style={{ ...primaryBtn, backgroundColor: 'var(--color-burgundy)' }}>
                  Restore Backup…
                </button>
              </div>
            </div>
            {backupError && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-burgundy)' }}>{backupError}</p>
            )}
          </div>
        )}
      </div>

      {/* Edit category dialog */}
      {editingCat && (
        <EditCatDialog
          cat={editingCat}
          groups={groups}
          onSave={updates => handleSaveCat(editingCat, updates)}
          onClose={() => setEditingCat(null)}
        />
      )}

      {/* Edit payment method dialog */}
      {editingPM && (
        <div style={backdrop} onClick={() => setEditingPM(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={modalTitle}>Rename Payment Method</h2>
            <label style={lbl}>Name</label>
            <input
              value={editingPMName}
              onChange={e => setEditingPMName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && editingPMName.trim()) {
                  updatePaymentMethod(editingPM.id, editingPMName.trim())
                  setEditingPM(null)
                  flash('Payment method updated.')
                }
              }}
              autoFocus
              style={{ ...inp, marginBottom: 20 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  if (!editingPMName.trim()) return
                  updatePaymentMethod(editingPM.id, editingPMName.trim())
                  setEditingPM(null)
                  flash('Payment method updated.')
                }}
                style={primaryBtn}
              >
                Save
              </button>
              <button onClick={() => setEditingPM(null)} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete payment method */}
      {confirmDeletePM && (
        <div style={backdrop} onClick={() => setConfirmDeletePM(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={modalTitle}>Delete Payment Method</h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--color-ink)', marginBottom: 20 }}>
              Delete <strong>{confirmDeletePM.name}</strong>? Any expenses assigned to it will become Unassigned.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  deletePaymentMethod(confirmDeletePM.id)
                  setConfirmDeletePM(null)
                  flash('Payment method deleted.')
                }}
                style={{ ...primaryBtn, backgroundColor: 'var(--color-burgundy)' }}
              >
                Delete
              </button>
              <button onClick={() => setConfirmDeletePM(null)} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionH({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '2px double var(--color-navy)', paddingBottom: 8, marginBottom: 20 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-navy)' }}>
        {children}
      </span>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-soft)',
  marginBottom: 8,
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--color-ink)',
  border: '1px solid var(--color-gold)',
  borderRadius: 6,
  outline: 'none',
  backgroundColor: 'white',
  marginBottom: 14,
  boxSizing: 'border-box',
}

const inlineInp: React.CSSProperties = {
  padding: '8px 10px',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--color-ink)',
  border: '1px solid var(--color-gold)',
  borderRadius: 6,
  outline: 'none',
  backgroundColor: 'transparent',
}

const primaryBtn: React.CSSProperties = {
  padding: '12px 24px',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  backgroundColor: 'var(--color-navy)',
  color: 'var(--color-parchment)',
  border: 'none',
  borderRadius: 7,
  cursor: 'pointer',
  minHeight: 44,
}

const ghostBtn: React.CSSProperties = {
  padding: '12px 20px',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  color: 'var(--color-ink-soft)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: 'var(--color-ink-soft)',
  padding: '2px 6px',
  lineHeight: 1,
}

const addBtn: React.CSSProperties = {
  padding: '10px 20px',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  border: '1px dashed var(--color-gold)',
  borderRadius: 6,
  backgroundColor: 'transparent',
  color: 'var(--color-ink)',
  cursor: 'pointer',
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(26,41,66,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
}

const modal: React.CSSProperties = {
  backgroundColor: 'var(--color-parchment)',
  border: '1px solid var(--color-gold)',
  borderRadius: 12,
  boxShadow: '0 8px 40px rgba(26,41,66,0.3)',
  width: '100%',
  maxWidth: 480,
  padding: 32,
  margin: 16,
}

const modalTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 20,
  fontWeight: 500,
  color: 'var(--color-navy)',
  margin: '0 0 20px',
  paddingBottom: 14,
  borderBottom: '2px double var(--color-navy)',
}
