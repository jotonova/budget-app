// ── Field transforms — pure, unit-testable, no I/O ────────────────────────────
// These handle the messy realities of bank CSVs: currency-decorated amounts and
// dates with text prefixes. Shared across every profile.

/** Parse a statement amount that may be currency-decorated. Handles:
 *  "- $1,234.56", "+ $12", "( $42.00 )", "-42.00", "1234.5", "$0.00", "".
 *  Returns a SIGNED number, or NaN if there's no number at all. */
export function parseAmount(raw: string | undefined | null): number {
  if (raw == null) return NaN
  let s = String(raw).trim()
  if (s === '') return NaN

  let sign = 1
  // Accounting-style parentheses = negative.
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1).trim() }
  // Leading +/- (possibly followed by a space and/or currency symbol).
  const lead = s.match(/^([+-])\s*/)
  if (lead) { if (lead[1] === '-') sign = -1; s = s.slice(lead[0].length) }

  // Strip currency symbols, spaces, and thousands separators.
  s = s.replace(/[$£€\s,]/g, '')
  if (s === '' || Number.isNaN(Number(s))) return NaN
  return sign * Math.abs(Number(s))
}

/** Extract an ISO YYYY-MM-DD date from a cell that may carry a prefix such as
 *  "Tuesday - 08/11/2026". Assumes US MM/DD/YYYY (PNC); also accepts a bare ISO
 *  date. Returns null if no date is found. */
export function extractStatementDate(raw: string | undefined | null, _format = 'MM/DD/YYYY'): string | null {
  if (raw == null) return null
  const s = String(raw)

  // Already ISO (YYYY-MM-DD) anywhere in the cell.
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // US MM/DD/YYYY (or M/D/YYYY) anywhere in the cell (ignores weekday prefix).
  const md = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (md) {
    const mm = md[1]!.padStart(2, '0')
    const dd = md[2]!.padStart(2, '0')
    return `${md[3]}-${mm}-${dd}`
  }
  return null
}

/** Reduce a raw bank description to a normalized merchant token used for rule
 *  matching (§6). Deliberately conservative — strips obvious transaction noise
 *  but keeps enough to identify the merchant. NOT used for dedup (which keeps
 *  the raw description to avoid over-merging distinct transactions). */
export function normalizeMerchant(raw: string | undefined | null): string {
  if (!raw) return ''
  return String(raw)
    .toUpperCase()
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')            // embedded dates
    .replace(/#?\b\d{4,}\b/g, ' ')                                 // long store/txn numbers
    .replace(/\bX{3,}\d*\b/g, ' ')                                 // masked card digits
    .replace(/\b(POS|PURCHASE|DEBIT|CARD|PAYMENT|RECURRING|ACH|WEB|EFT|ID|REF)\b/g, ' ')
    .replace(/[^A-Z0-9&' ]+/g, ' ')                               // punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
