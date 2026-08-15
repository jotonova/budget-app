import Papa from 'papaparse'
import type { PendingTransaction, TxnDirection } from '../types'
import type { ImportProfile } from './profiles'
import { parseAmount, extractStatementDate, normalizeMerchant } from './format'
import { generateId } from '../utils'

export interface ParsedRow {
  ok: boolean
  date: string
  rawDescription: string
  merchant: string
  amount: number            // signed: <0 money out, >0 money in
  direction: TxnDirection
  dedupKey: string
  error?: string
}

export interface ParseResult {
  profile: ImportProfile
  headers: string[]
  rows: ParsedRow[]
  counts: { total: number; parsed: number; debit: number; credit: number; failed: number }
}

/** Stable-ish de-dup key for a CSV transaction. Keeps the (whitespace-collapsed)
 *  raw description so distinct transactions don't collide, and appends an
 *  occurrence index so two legitimately-identical same-day charges get distinct
 *  keys while a re-import of the same file reproduces the same keys. */
function dedupKey(date: string, amount: number, rawDescription: string, occurrence: number): string {
  const desc = rawDescription.replace(/\s+/g, ' ').trim().toLowerCase()
  return `csv:${date}|${amount.toFixed(2)}|${desc}#${occurrence}`
}

/** Read just the header row so a profile can be auto-detected before the full parse. */
export function readHeaders(text: string): string[] {
  const res = Papa.parse<Record<string, string>>(text, { header: true, preview: 1, transformHeader: h => h.trim() })
  return res.meta.fields ?? []
}

/** Parse into headers + row objects — used by the smart-guess mapper for preview. */
export function parseCsvRows(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim() })
  return { headers: res.meta.fields ?? [], rows: res.data }
}

/** Parse raw CSV text into normalized rows using a profile. Pure — no store
 *  writes, no side effects. */
export function parseStatement(text: string, profile: ImportProfile): ParseResult {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim(),
  })
  const headers = res.meta.fields ?? []
  const occ = new Map<string, number>()
  const rows: ParsedRow[] = []

  for (const r of res.data) {
    const rawDate = r[profile.dateCol] ?? ''
    const rawDescription = (r[profile.descriptionCol] ?? '').trim()
    const date = extractStatementDate(rawDate, profile.dateFormat)

    let amount = NaN
    if (profile.amount.mode === 'signed') {
      const v = parseAmount(r[profile.amount.amountCol])
      amount = profile.amount.negativeMeans === 'out' ? v : -v
    } else {
      const d = parseAmount(r[profile.amount.debitCol])
      const c = parseAmount(r[profile.amount.creditCol])
      if (!Number.isNaN(d) && Math.abs(d) > 0) amount = -Math.abs(d)
      else if (!Number.isNaN(c) && Math.abs(c) > 0) amount = Math.abs(c)
    }

    if (!date || Number.isNaN(amount)) {
      rows.push({ ok: false, date: date ?? '', rawDescription, merchant: '', amount: NaN, direction: 'debit', dedupKey: '', error: !date ? 'no date' : 'no amount' })
      continue
    }

    const direction: TxnDirection = amount < 0 ? 'debit' : 'credit'
    const base = `${date}|${amount.toFixed(2)}|${rawDescription.toLowerCase()}`
    const n = occ.get(base) ?? 0
    occ.set(base, n + 1)

    rows.push({
      ok: true,
      date,
      rawDescription,
      merchant: normalizeMerchant(rawDescription),
      amount,
      direction,
      dedupKey: dedupKey(date, amount, rawDescription, n),
    })
  }

  const parsed = rows.filter(r => r.ok)
  return {
    profile,
    headers,
    rows,
    counts: {
      total: rows.length,
      parsed: parsed.length,
      debit: parsed.filter(r => r.direction === 'debit').length,
      credit: parsed.filter(r => r.direction === 'credit').length,
      failed: rows.length - parsed.length,
    },
  }
}

/** Turn OK parsed rows into fresh PendingTransaction records, dropping any whose
 *  dedupKey already exists (re-import / overlap) or repeats within this file.
 *  Pure — the caller persists via the store. `now` is injected for determinism. */
export function toPendingTransactions(
  rows: ParsedRow[],
  existingKeys: Set<string>,
  now: string,
  importBatchId?: string,
): PendingTransaction[] {
  const out: PendingTransaction[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.ok) continue
    if (existingKeys.has(r.dedupKey) || seen.has(r.dedupKey)) continue
    seen.add(r.dedupKey)
    out.push({
      id: generateId(),
      dedupKey: r.dedupKey,
      source: 'csv',
      date: r.date,
      merchant: r.merchant,
      rawDescription: r.rawDescription,
      amount: r.amount,
      direction: r.direction,
      status: 'pending',
      createdAt: now,
      ...(importBatchId ? { importBatchId } : {}),
    })
  }
  return out
}
