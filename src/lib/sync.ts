import type { LedgerData } from './types'
import { loadLedger, saveLedger } from './persistence'
import { loadCloud, saveCloud } from './cloud'

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
  return mode.kind === 'cloud' ? loadCloud(mode.householdId) : loadLedger()
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
  return saveLedger(next)
}
