// Data-driven per-bank export guides. Add a bank by appending an entry — the
// wizard renders whatever is here, so no code changes are needed to support more.

export interface BankGuide {
  id: string
  name: string
  /** Plain-language, numbered export steps. */
  steps: string[]
  /** Optional caveat shown under the steps (e.g. a date-range cap). */
  note?: string
}

export const BANK_GUIDES: BankGuide[] = [
  {
    id: 'pnc',
    name: 'PNC Bank',
    steps: [
      'Sign in to PNC Online Banking (or the PNC mobile app).',
      'Open your checking account and go to Account Activity.',
      'Pick a date range, then choose Download / Export.',
      'Select the CSV (spreadsheet) format and save the file.',
    ],
    note: 'PNC lets you download up to 90 days at a time. For your first import, grab the last 90 days; after that a weekly pull is plenty. Overlapping ranges are safe — duplicates are skipped automatically.',
  },
  {
    id: 'other',
    name: 'Another bank or card',
    steps: [
      'Sign in to your bank or card website.',
      'Open the account and look for “Download”, “Export”, or “Statements”.',
      'Choose CSV (spreadsheet) format for a date range.',
      'Save the file — bring it here and we’ll figure out the columns for you.',
    ],
    note: 'First time with a new bank? We auto-detect the columns and just ask you to confirm — usually one tap.',
  },
]
