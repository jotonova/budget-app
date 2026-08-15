import type { LedgerData } from './types'
import { loadLedger, saveLedger } from './persistence'
import { loadCloud, saveCloud } from './cloud'
import { isWeb } from './platform'

/**
 * The single backend router. Local mode writes the whole ledger.json (Phase 1
 * behavior, unchanged); cloud mode diffs prev→next and upserts changed rows.
 * The store and Settings call one path — persistChange — and never branch.
 */
export type Mode = { kind: 'local' } | { kind: 'cloud'; householdId: string }

let mode: Mode = { kind: 'local' }
let onCloudError: ((e: unknown) => void) | null = null

export function getMode(): Mode { return mode }
export function setMode(m: Mode): void { mode = m }
export function isCloud(): boolean { return mode.kind === 'cloud' }

/** Register a sink for silent cloud write-through failures (profileStore uses it). */
export function setSyncErrorHandler(fn: ((e: unknown) => void) | null): void { onCloudError = fn }

export async function loadData(): Promise<LedgerData> {
  if (mode.kind === 'cloud') return loadCloud(mode.householdId)
  // Backstop: the local path uses Tauri file APIs that don't exist on the web
  // build. Web is always cloud once signed in; if we somehow get here, fail
  // clearly rather than throwing a cryptic "invoke of undefined".
  if (isWeb) throw new Error('No local budget on the web app — sign in to a household.')
  return loadLedger()
}

export async function persistChange(prev: LedgerData | null, next: LedgerData): Promise<void> {
  if (mode.kind === 'cloud') {
    try {
      await saveCloud(mode.householdId, prev, next)
    } catch (e) {
      onCloudError?.(e) // surface instead of silently losing a write
      throw e
    }
    return
  }
  if (isWeb) throw new Error('No local budget on the web app — sign in to a household.')
  return saveLedger(next)
}
