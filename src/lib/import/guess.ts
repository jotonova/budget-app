import type { AmountMapping } from './profiles'
import { parseAmount, extractStatementDate } from './format'

// ── Smart column auto-guessing for unknown banks ──────────────────────────────
// Given a header row + a sample of data rows, guess which column is the date,
// which is the description, and how the amount is encoded (single signed vs a
// debit/credit two-column pair) + the sign convention. Pure, testable.

export interface GuessResult {
  confidence: 'high' | 'low'
  dateCol: string | null
  descriptionCol: string | null
  dateFormat: string
  amount: AmountMapping | null
  reasons: string[]
}

const DATE_HDR = /date|posted|trans(action)?/i
const DEBIT_HDR = /withdraw|debit|payment|charge|paid\s*out|money\s*out|\bout\b/i
const CREDIT_HDR = /deposit|credit|paid\s*in|money\s*in|\bin\b/i
const DESC_HDR = /desc|payee|merchant|name|memo|detail|narrat|reference|transaction/i

interface ColStat {
  col: string; dateRatio: number; numRatio: number; avgLen: number; distinct: number; nonEmpty: number; neg: number; pos: number
}

function statFor(col: string, sample: Record<string, string>[]): ColStat {
  let dateN = 0, numN = 0, textLen = 0, nonEmpty = 0, neg = 0, pos = 0
  const distinct = new Set<string>()
  for (const r of sample) {
    const v = (r[col] ?? '').trim()
    if (v === '') continue
    nonEmpty++; distinct.add(v); textLen += v.length
    if (extractStatementDate(v)) dateN++
    const amt = parseAmount(v)
    if (!Number.isNaN(amt)) { numN++; if (amt < 0) neg++; else pos++ }
  }
  return { col, dateRatio: nonEmpty ? dateN / nonEmpty : 0, numRatio: nonEmpty ? numN / nonEmpty : 0, avgLen: nonEmpty ? textLen / nonEmpty : 0, distinct: distinct.size, nonEmpty, neg, pos }
}

function guessDateFormat(values: string[]): string {
  let iso = 0, dmy = 0, mdy = 0
  for (const v of values) {
    if (/\d{4}-\d{2}-\d{2}/.test(v)) { iso++; continue }
    const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (m) { if (parseInt(m[1]!, 10) > 12) dmy++; else mdy++ }
  }
  if (iso >= mdy && iso >= dmy && iso > 0) return 'YYYY-MM-DD'
  if (dmy > mdy) return 'DD/MM/YYYY'
  return 'MM/DD/YYYY'
}

export function guessMapping(headers: string[], rows: Record<string, string>[]): GuessResult {
  const sample = rows.slice(0, 25)
  const reasons: string[] = []
  const stats = headers.map(h => statFor(h, sample))

  // Date column: header hint + high parseable-date ratio.
  const dateCand = stats
    .map(s => ({ s, score: (DATE_HDR.test(s.col) ? 0.5 : 0) + s.dateRatio }))
    .filter(x => x.s.dateRatio >= 0.5 || (DATE_HDR.test(x.s.col) && x.s.dateRatio > 0))
    .sort((a, b) => b.score - a.score)[0]?.s ?? null
  const dateCol = dateCand?.col ?? null
  if (dateCol) reasons.push(`Date column: “${dateCol}”`)

  // Amount: numeric columns (excluding the date column).
  const numeric = stats.filter(s => s.col !== dateCol && s.numRatio >= 0.6)
  let amount: AmountMapping | null = null

  const debitByHdr = numeric.find(s => DEBIT_HDR.test(s.col) && !CREDIT_HDR.test(s.col))
  const creditByHdr = numeric.find(s => CREDIT_HDR.test(s.col) && !DEBIT_HDR.test(s.col))
  if (debitByHdr && creditByHdr && debitByHdr.col !== creditByHdr.col) {
    amount = { mode: 'debitCredit', debitCol: debitByHdr.col, creditCol: creditByHdr.col }
    reasons.push(`Two columns: out=“${debitByHdr.col}”, in=“${creditByHdr.col}”`)
  } else if (numeric.length >= 2) {
    // Two numeric columns that are mostly mutually-exclusive per row → debit/credit.
    const [a, b] = [numeric[0]!, numeric[1]!]
    let mutex = 0, both = 0
    for (const r of sample) {
      const av = parseAmount(r[a.col]); const bv = parseAmount(r[b.col])
      const aHas = !Number.isNaN(av) && Math.abs(av) > 0
      const bHas = !Number.isNaN(bv) && Math.abs(bv) > 0
      if (aHas && bHas) both++; else if (aHas || bHas) mutex++
    }
    if (mutex > both) {
      const outCol = DEBIT_HDR.test(a.col) ? a.col : DEBIT_HDR.test(b.col) ? b.col : a.col
      const inCol = outCol === a.col ? b.col : a.col
      amount = { mode: 'debitCredit', debitCol: outCol, creditCol: inCol }
      reasons.push(`Two mutually-exclusive amount columns (out=“${outCol}”, in=“${inCol}”)`)
    }
  }
  let singleNoSign = false
  if (!amount) {
    const single = numeric.slice().sort((x, y) => y.numRatio - x.numRatio)[0]
    if (single) {
      amount = { mode: 'signed', amountCol: single.col, negativeMeans: 'out' }
      singleNoSign = single.neg === 0
      reasons.push(singleNoSign ? `Single amount “${single.col}” — no negatives seen, sign unclear` : `Single signed amount: “${single.col}”`)
    }
  }

  // Description: remaining non-date, non-amount column with the most free text.
  const used = new Set<string>([dateCol ?? ''])
  if (amount?.mode === 'signed') used.add(amount.amountCol)
  if (amount?.mode === 'debitCredit') { used.add(amount.debitCol); used.add(amount.creditCol) }
  const descCand = stats
    .filter(s => !used.has(s.col))
    .map(s => ({ s, score: (DESC_HDR.test(s.col) ? 20 : 0) + s.avgLen + s.distinct }))
    .sort((a, b) => b.score - a.score)[0]?.s ?? null
  const descriptionCol = descCand?.col ?? null
  if (descriptionCol) reasons.push(`Description column: “${descriptionCol}”`)

  const dateFormat = guessDateFormat(dateCol ? sample.map(r => r[dateCol] ?? '') : [])

  const confident = !!dateCol && !!amount && !!descriptionCol && (dateCand?.dateRatio ?? 0) >= 0.7 && !singleNoSign
  return { confidence: confident ? 'high' : 'low', dateCol, descriptionCol, dateFormat, amount, reasons }
}
