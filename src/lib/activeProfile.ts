import { setMode, loadData } from './sync'
import { useLedgerStore } from '../store/ledgerStore'
import { useAuthStore } from '../store/authStore'
import { startRealtime, stopRealtime } from './realtime'
import { clearVersions } from './cloudVersions'

/**
 * Switches the visible budget between the local file and a cloud household, and
 * (in cloud mode) starts the realtime subscription. Cloud mode = signed in AND a
 * household is active. Switching never touches the local ledger.json, so
 * returning to local mode restores it verbatim.
 */
let lastKey = 'local'

export async function applyProfile(signedIn: boolean, householdId: string | null): Promise<void> {
  const key = signedIn && householdId ? `cloud:${householdId}` : 'local'
  if (key === lastKey) return
  lastKey = key

  stopRealtime()
  clearVersions()
  setMode(signedIn && householdId ? { kind: 'cloud', householdId } : { kind: 'local' })

  try {
    const data = await loadData()
    useLedgerStore.getState().init(data)
    if (signedIn && householdId) {
      startRealtime(householdId, useAuthStore.getState().user?.id ?? '')
    }
  } catch (e) {
    console.error('Profile switch failed:', e)
    lastKey = '__retry__' // allow a later effect run to retry
  }
}

/** Force a re-fetch of the active profile (manual "Refresh"; realtime usually
 *  makes this unnecessary now, but it's a handy belt-and-suspenders pull). */
export async function reloadActiveProfile(): Promise<void> {
  const data = await loadData()
  useLedgerStore.getState().init(data)
}
