import { loadData } from './sync'
import { useLedgerStore } from '../store/ledgerStore'

/** Force a re-fetch of the active profile (manual "Refresh from cloud"). Respects
 *  whichever mode is active; realtime usually makes this unnecessary. */
export async function reloadActiveProfile(): Promise<void> {
  const data = await loadData()
  useLedgerStore.getState().init(data)
}
