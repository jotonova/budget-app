# Phase 4 — Bank / Card Statement Import (Path A: file import, no live bank link)

**Status:** Design / planning only. No app code in this pass.
**Branch:** `phase-4-import` (off `main` @ `f5fd2f7`).
**Targets:** Desktop (Tauri) **and** web/PWA from the single `vite build` bundle — every native touchpoint branches on `isDesktop`/`isWeb` exactly like Phase 3.

## 0. Goal & guardrails

Let a household member import a **statement file** (CSV, and ideally OFX/QFX) exported from their bank or card, land every line in a **shared "to review" list** that both partners can see and clear, and — only after a human approves each row — turn approved lines into normal expenses (or refunds / one-time income). **Nothing touches the budget until approved.** This is Path A: no Plaid, no live bank connection, no stored bank credentials.

Non-negotiables carried from earlier phases:
- **Build once.** One bundle; desktop unchanged; web/mobile/native differences stay behind `isDesktop`/`isWeb`/`isMobile`.
- **Works in both LOCAL (desktop, `ledger.json`) and CLOUD (shared household, Supabase + realtime) modes.** New data flows through the existing `LocalBackend` / `CloudBackend` interface — no new persistence path.
- **The existing expense model stays intact.** Approved rows become ordinary `Expense` records via the normal store path. New tables are *additive*.
- **Money correctness first.** Every posted transaction is reviewed by a human; approval is **idempotent** (safe under two-partner concurrency and re-imports).

---

## 1. File import (CSV + OFX/QFX) & column mapping

### 1a. File picking (desktop + web)
Reuse the Phase 3 platform-file pattern (`src/lib/webFiles.ts` already has the web half):
- **Web:** `<input type="file" accept=".csv,.ofx,.qfx,.qbo">` → `File.text()`.
- **Desktop:** Tauri dialog `open()` → returns a path → read contents (existing Rust `read_*` invoke or the `fs` plugin).
- Wrap both behind one `pickImportFile(): Promise<{ name, text } | null>` so the parser layer is platform-agnostic. Parsing itself is pure JS → identical on both targets.

### 1b. CSV — the hard part is that every bank differs
Banks disagree on: column order & headers, date format (`MM/DD/YYYY` vs `YYYY-MM-DD` vs `DD/MM/YYYY`), how they encode direction (one **signed amount** column vs **separate Debit/Credit columns** vs a `Dr/Cr` flag), thousands separators, `$`/currency glyphs, parentheses-for-negative, quoting, and encoding (UTF-8 vs Windows-1252), plus junk preamble rows before the header.

**Parser:** PapaParse (battle-tested, streams, header mode, works in browser + Tauri webview). Zero native deps.

**Column-mapping step (required):** after parse, show a mapping screen:
- Pick which column is **Date**, **Description/Payee**, and how the **amount** is encoded — the mapping model supports **three amount modes** (the parser branches on a `amountMode` discriminator so a profile captures exactly one):
  - **`signed`** — one signed amount column + a **sign convention toggle** ("a negative number means money **out**" — the common case — vs the rare inverted export).
  - **`debitCredit`** — **two separate columns**, one for money **out** and one for money **in** (each holds a positive number or is blank on a given row). This is the PNC case (see below). The parser reads: if the debit column is non-empty → `amount = -value`, `direction = 'debit'`; if the credit column is non-empty → `amount = +value`, `direction = 'credit'`. Exactly one is populated per row.
  - **`drCrFlag`** *(handled by the same mapping as `signed` + a flag column)* — one magnitude column plus a `Dr/Cr` (or `Debit/Credit`) indicator column. Lower priority; add if a bank needs it.
- Choose the **date format** (auto-guess from the data, let the user correct).
- A **live preview table** re-renders the first ~8 parsed rows with the interpretation applied (parsed date, cleaned merchant, signed amount, and a **money-in / money-out** chip) so the user *confirms the signs are right before anything imports.* This preview is the single best defense against the debit/credit-sign footgun (see Risks).

Mapping model (shape a profile stores):
```ts
type AmountMapping =
  | { mode: 'signed'; amountCol: string; negativeMeans: 'out' | 'in' }
  | { mode: 'debitCredit'; debitCol: string; creditCol: string }   // PNC: Withdrawals / Deposits
type ImportProfile = {
  id: string
  displayName: string          // "PNC Checking"
  headerSignature: string      // hash of normalized header row → auto-detect
  dateCol: string; descriptionCol: string
  dateFormat: string           // e.g. "MM/DD/YYYY"
  amount: AmountMapping
  builtIn?: boolean
}
```

**Mapping UI vs saved per-bank templates — recommendation: do BOTH, in this order.**
- Always offer the **mapping UI** (handles any bank, including one-offs).
- On a successful import, **save the mapping as a named "import profile"** keyed by a **header signature** (a hash of the normalized header row). Next time a file with the same signature is imported, auto-apply the saved profile and skip straight to preview ("Detected *PNC Checking* layout"). The user can still edit.
- Profiles are **per household** (stored like other data, synced), so either partner benefits once one of them maps a bank. Ship **built-in starter profiles** (a generic "signed amount" shape, a generic "debit/credit" shape, and named banks) as a head start — but never assume; always let the preview confirm.

**PNC (first supported bank).** Justin + Amy share one **PNC checking** account.

*Note:* the real sample (PNC "Account Activity" download → `accountActivityExport.csv`) turned out to be a **single signed `Amount`** layout, **not** the separate Withdrawals/Deposits columns first assumed. The two-column `debitCredit` mode still ships (some PNC exports and other banks use it), but the seeded PNC profile follows the real file:
- **Columns:** `Transaction Date, Transaction Description, Amount, Category`.
- **Amount is a single signed, currency-decorated column:** `- $123.45` (out) / `+ $1,234.56` (in). The shared `parseAmount()` strips a leading `+`/`-`, `$`, spaces, and thousands commas, then applies the sign → `amountMode: 'signed'`, `negativeMeans: 'out'`.
- **Date carries a weekday prefix:** cells look like `Tuesday - 08/11/2026`. Parse by extracting the first `\d{1,2}/\d{1,2}/\d{4}` (`dateFormat: MM/DD/YYYY`), ignoring the prefix.
- **`Category`** is PNC's own guess — **ignored** (our merchant rules + manual review own categorization; possible future hint).
- **Seed built-in "PNC Checking (Account Activity)" profile:** `dateCol: 'Transaction Date'`, `descriptionCol: 'Transaction Description'`, `dateFormat: 'MM/DD/YYYY'` (weekday-prefix tolerant), `amount: { mode: 'signed', amountCol: 'Amount', negativeMeans: 'out' }`. If Justin also has a Withdrawals/Deposits export, we add a second built-in profile (distinct header signature → auto-detected independently).
- **90-day export cap:** PNC only exports **up to 90 days** of history per download. Fine for the recommended weekly rhythm; surface it in the **in-app PNC import instructions** ("PNC lets you download up to 90 days at a time — for the first import, grab the last 90 days; after that a weekly pull is plenty. Overlapping ranges are safe — duplicates are skipped."). Longer back-fill = a few sequential 90-day exports, all de-duped on import (§5).

### 1c. OFX / QFX / QBO — standardized, and a dedup superpower
OFX (and its Quicken `.qfx` / QuickBooks `.qbo` variants) is a semi-structured SGML/XML format with **named fields** — no column mapping needed. Crucially, each transaction carries a bank-assigned **`FITID`** (financial-institution transaction id) that is **stable and unique per account** → the ideal dedup key (§5). Direction is explicit (`TRNAMT` sign + `TRNTYPE`), killing the sign ambiguity.

**Recommendation:** ship **CSV first** (it's what most people can export from any bank), then add **OFX/QFX as a fast follow** — not because it's harder to use (it's easier), but because the JS OFX-parsing libraries have browser-compat quirks (many assume Node). Plan a small, dependency-light SGML→JSON parser (OFX 1.x SGML and 2.x XML are both tractable) validated in the browser during its stage. Where a bank offers OFX/QFX, prefer it — the FITID makes dedup bulletproof.

**Format priority:** CSV (Stage 1) → OFX/QFX/QBO (Stage 4).

---

## 2. Shared "to review" list (per household, realtime)

Imported lines land as **pending transactions** in a new `pending_transactions` table (local: a new `pendingTransactions[]` array in `LedgerData`). They render as a **Review inbox** — a new top-level view (and a mobile bottom-nav entry / badge with the pending count).

- **Both partners see the same inbox**, live, via the existing realtime subscription (subscribe the new table exactly like `expenses`).
- Each row shows **date · description · signed amount**, a money-in/out chip, the source ("Chase Checking — imported Aug 9"), and any **duplicate / merchant-rule hints** (§5, §6).
- **Nothing hits the budget while pending.** The budget selectors ignore `pending_transactions` entirely.
- Rows are **grouped by import batch** with a header ("Chase Checking · 42 rows · 3 flagged") and bulk affordances ("skip all transfers", "approve all with a remembered category").

**Concurrency (two partners, one inbox).** A pending row moves `pending → approved | skipped`. To avoid double-posting when both act at once:
- Approval is **idempotent**: the created expense's id is **derived deterministically from the pending row id** (e.g. `exp_<pendingId>` / a split index suffix). If both partners approve the same row, both upserts write the *same* expense id → one expense, not two. LWW on the pending row's status converges.
- The row visibly flips to "Approved by Justin" via realtime, so the other partner sees it resolve.
- Optional nicety: a soft `claimed_by`/`claimed_at` stamp to grey out a row someone is mid-editing (advisory only; the idempotent id is the real safety net).

---

## 3. Per-row actions

Each pending row offers: **Expense**, **Money in**, or **Skip**.

### 3a. Expense → category (+ payment method) → Approve
Creates a normal `Expense { id: derived, categoryId, amount: |amount|, date, description, paymentMethodId? }`. Category dropdown is **pre-filled from merchant memory** when a rule matches (§6). Payment method optional (pre-fillable per profile — e.g. an Amex statement defaults to the "Amex" method).

**Split** (one transaction across multiple categories — Walmart → groceries + household + clothes):
- A split editor: add N lines, each `{ category, amount }`; a running remainder shows `must sum to $X`; block approve until it balances (last line can "= remainder" auto-fill).
- Creates **N expenses**, ids `exp_<pendingId>_0..N-1` (keeps idempotency), each with the same date/description (or per-line note), all traceable back to the pending row (for undo).
- The existing expense model is untouched — a split is just several ordinary expenses.

### 3b. Money in (credit / positive lines) — three choices
- **(a) Refund / return → credited to a category.** Models as an **expense with a negative amount** in the chosen category (`amount = -value`, description e.g. `Refund: Target`). Because the budget computes `spent = Σ amount`, a negative expense **reduces that category's spending** and keeps the budget accurate — no new concept, model intact. *(Tradeoff: negative amounts now appear in the expense list; we sanity-check that charts, pace bars, alert %, and the PDF handle a negative/near-zero category total gracefully. Flagged in Risks.)*
- **(b) One-time income → windfall** (tax refund, gift, interest). This is **not** tied to a spending category and **not** recurring — it needs the new one-time-income concept (§4). Captured with an **amount + label** (and optional note/date).
- **(c) Skip** (see §3c).

**Refund vs. one-time income is a genuine judgment call** (a returned shirt = refund to *Clothes*; a tax refund = one-time income). We *suggest* a default (a credit that matches a recent same-merchant expense → likely **refund**, pre-select that category; an unmatched credit → likely **income**) but the user always decides. Flagged in Risks.

### 3c. Skip (remembered)
Skip with an optional reason (transfer, card payment, not a real expense). The row's **dedup key is remembered as skipped** so the same transaction **never resurfaces** on re-import of an overlapping statement. Skips are reversible from a "Skipped" tab.

---

## 4. NEW concept — one-time / irregular income

**Problem:** today income is *only* recurring monthly (`IncomeSource.monthly`, summed by `totalIncome()`). A windfall doesn't fit — putting it in `income.sources` would wrongly repeat it every month.

**Recommendation: a separate, dated one-time-income ledger.** New type + table; recurring logic untouched.

```ts
interface OneTimeIncome {
  id: string
  amount: number          // positive
  date: string            // YYYY-MM-DD (when received)
  label: string           // "Tax refund", "Birthday gift", "Interest"
  note?: string
  createdAt: string
  // + cloud: householdId, updatedAt, updatedBy, deletedAt
}
```
- Local: new `oneTimeIncome: OneTimeIncome[]` in `LedgerData`. Cloud: `one_time_income` table (same RLS/realtime pattern).

**How it shows up without breaking existing logic (purely additive terms):**
- **Dashboard "available this month":** `available = totalIncome() + oneTimeIncomeForMonth(currentYM) − totalSpent`. Recurring `totalIncome()` is unchanged; we add a new selector `oneTimeIncomeForMonth(ym)`. Show a small "+ $X one-time this month" line under the income figure so it's transparent.
- **Year-to-Date:** `totalIncomeSoFar = income × completedMonths + oneTimeIncomeYTD()`. One added term; `net = totalIncomeSoFar − totalSpent` still holds. List one-time items in the month breakdown.
- **History/rollover:** one-time income is dated, so it naturally belongs to its month; rollover logic (which touches expenses/categories) is unaffected.

**Rejected alternatives:**
- *Add `type: 'recurring' | 'one_time'` to `IncomeSource`.* Breaks `totalIncome()` (it sums `monthly` unconditionally → a one-off would recur). Would require touching every income call site. No.
- *Model income as a negative expense in a special "Income" category.* Conflates income with category spending, pollutes budgets/charts. No.

Keeping refunds (§3a, category credit) and one-time income (separate ledger) as **distinct** mechanisms is deliberate: a refund corrects a category's spend; income increases what's available. Both stay out of `income.sources`.

---

## 5. Duplicate detection

Two independent problems, two mechanisms.

### 5a. Don't import the same transaction twice (cross-statement / re-import)
- **Stable dedup key per transaction:**
  - **OFX/QFX:** `FITID` (+ account id) — authoritative.
  - **CSV:** deterministic hash of `normalize(account?, date, signedAmount, normalizedMerchant)` **plus an occurrence index** for that key *within the file* (so two legitimate identical same-day charges — two $5 coffees — get keys `…#0` and `…#1` instead of collapsing into one).
- On import, compute keys and **drop any key already present** in the household's pending/approved/skipped set (dedup only against *previously processed* keys, never within the current file). Re-importing an overlapping range is therefore a no-op for already-seen rows.
- Persist keys durably: keep `pending_transactions` rows after they resolve (status `approved`/`skipped`) rather than deleting — they *are* the "seen" set. A **partial unique index on `(household_id, dedup_key)`** hard-blocks accidental duplicate inserts.
- *CSV caveat:* keys are heuristic. A pending→posted change or a merchant-string change between statements can dodge the key; §5b catches many of these, and the preview lets a user keep/skip. Flagged in Risks.

### 5b. Flag rows that may already be entered manually
At review time, for each pending expense-like row, search existing `expenses` for a **soft match**: `|amount|` equal **and** date within **±3 days** (configurable) **and** fuzzy merchant/description overlap. If found, badge the row **"Might already be in your budget — skip?"**, show the candidate expense inline, and pre-select **Skip** (non-blocking; the user can still approve). This is a *suggestion*, never an auto-action.

---

## 6. Merchant memory (categorize once, pre-fill forever)

New `merchant_rules` table (local `merchantRules[]`):
```ts
interface MerchantRule {
  id: string
  match: string           // normalized merchant token, e.g. "walmart"
  categoryId: string
  paymentMethodId?: string
  createdAt: string
  // + cloud: householdId, updatedAt, updatedBy, deletedAt
}
```
- **Merchant normalization:** strip bank noise — store/terminal numbers, dates, `POS`/`DEBIT`/`PURCHASE`, trailing city/state, card-last-4, extra whitespace — down to a canonical token. (Kept in a single `normalizeMerchant()` helper so it's tuned in one place; it's inherently heuristic — Risks.)
- **Learn:** after a user picks a category for a merchant, offer *"Remember WALMART → Groceries for next time?"* → upsert a rule (per household, so both partners benefit). One-click, dismissible.
- **Apply:** on future imports, a matching rule **pre-fills** the category (and payment method) dropdown and can auto-sort/group the inbox ("12 rows have a remembered category"). **Approval stays manual** — pre-fill only.
- **On-ramp to auto-post:** the same rules become the future opt-in "auto-approve high-confidence merchants" toggle (explicitly out of scope for Phase 4; the schema is built to allow a later `autoApprove: boolean` without migration pain).

---

## 7. Data model & sync

### New tables (cloud) / arrays (local)
All cloud tables follow the existing convention: `id`, `household_id`, domain columns, `created_by`, `updated_at`, `updated_by`, `deleted_at`; **RLS `is_member(household_id)`**; `replica identity full`; added to the `supabase_realtime` publication. All get a matching array in `LedgerData` and a mapper/diff entry in the cloud backend.

| Table | Purpose | Key columns |
|---|---|---|
| `pending_transactions` | the review inbox + durable "seen" set | `dedup_key` (unique w/ household), `import_batch_id`, `posted_date`, `raw_description`, `normalized_merchant`, `amount` (signed), `direction`, `status` (`pending`/`approved`/`skipped`), `skip_reason`, `resolved_ref` (expense/one-time-income ids created) |
| `merchant_rules` | merchant → category/payment memory | `match`, `category_id`, `payment_method_id?` |
| `one_time_income` | irregular income (§4) | `amount`, `date`, `label`, `note?` |
| `import_batches` *(optional)* | group/label/undo an import | `filename`, `source`, `imported_at`, `row_count`, `profile_id?` |
| `import_profiles` *(optional; or fold into settings)* | saved per-bank column mappings (§1b) | `header_signature`, `mapping_json`, `display_name` |

Migration lands as `supabase/migrations/0002_phase4_import.sql`, mirroring `0001`'s structure (tables → indexes → RLS policies → `replica identity full` → publication add). No changes to existing tables.

### Approved rows → existing model
Approve routes through the **normal store action** (`persistChange(prev, next)`), so:
- **Local mode:** writes land in `ledger.json` like everything else — the importer works fully **offline on desktop** with no cloud. Merchant rules, pending rows, one-time income all live in `LedgerData`.
- **Cloud mode:** the same action diff-upserts to Supabase; realtime fans out to the partner.

Approval creates an ordinary `Expense` (or negative-amount refund expense, or `OneTimeIncome`) with a **deterministic id derived from the pending row** (§2), then flips the pending row's `status`. Expenses created this way are indistinguishable from hand-entered ones (optionally tag `source: 'import'` in the description/meta for traceability, but the shape is unchanged).

---

## 8. Staged build plan, risks, and what I need from you

### Staged plan (each stage independently shippable + a checkpoint to verify before moving on)
- **Stage 0 — Data model & plumbing.** Add the `LedgerData` arrays + types; write `0002` migration (tables, RLS, realtime); extend the cloud mapper/diff and realtime subscriptions for the new tables. *Checkpoint:* a hand-inserted pending row round-trips in **both** local and cloud modes and appears on the partner's device live; budget totals unchanged.
- **Stage 1 — CSV import + mapping + inbox.** File picker (desktop+web), PapaParse, mapping UI + preview, save/detect import profiles, write pending rows with dedup keys. *Checkpoint:* import a real CSV; correctly signed rows appear in the shared inbox; re-importing the same file adds nothing (dedup works).
- **Stage 2 — Review & approve (core).** Expense action: category + payment method → idempotent approve → expense; Skip (remembered). *Checkpoint:* approve → expense shows in the budget; skip → doesn't resurface on re-import; two-device concurrent approve makes exactly one expense.
- **Stage 3 — Split, money-in, merchant memory.** Split editor (N expenses); refund (negative expense) + one-time income; learn/apply merchant rules (pre-fill). *Checkpoint:* split sums and posts N expenses; refund reduces the right category; one-time income appears on Dashboard + YTD; a remembered merchant pre-fills next import.
- **Stage 4 — Dedup polish (+ OFX/QFX).** *Done:* manual-entry match flag (§5b) — pending rows that likely duplicate a hand-entered expense (same |amount| + date within ±3 days + fuzzy merchant/description, same direction, excluding importer-created expenses) get a "⚠ Might already be in your budget" banner with an expandable match view and a one-tap Skip; never auto-skips. **OFX/QFX: DEFERRED** (call made Stage 4) — PNC and the household use CSV; OFX JS parsers carry browser-compat quirks not worth the time now. The mapping model already reserves `source: 'ofx'` and the FITID-dedup design (§1c) stands, so it can be added later without rework.
- **Stage 5 — Surfaces + management + polish.** Dashboard/YTD one-time-income lines (done in Stage 3); a "Skipped"/"Rules"/"Profiles" management area, empty/error states, mobile touch pass, accessibility. Plus the two additions below. *Checkpoint:* full loop on phone + desktop; desktop visuals unchanged where not import-related.

  **Stage 5 addition — optional note when categorizing an imported row.** Bank/ACH descriptions are often cryptic; let the user type a clearer note while reviewing that saves onto the created record. Applies to **single-expense approval, each split line, refunds, and one-time income**. *Model:* the `Expense` model has `description` (no separate `notes`); reuse it — the note **replaces/overrides** the raw bank text on the created expense (the original stays on the pending row as `rawDescription`, so nothing is lost and dedup is unaffected). `OneTimeIncome` already has an optional `note`. **No migration needed.** UI: a small optional "Note (optional)" input in each approve control; default the expense description to the note if provided, else the raw description.

  **Stage 5 addition — optional description on categories (Essential + Non-Essential).** A short "what goes here" blurb per category. *Model:* **reuse the existing `categories.notes` field** — confirmed present in `Category.notes` and already synced both ways in the cloud mapper, so **no migration**. UI: editable in **Settings → Categories** (add/edit); shown as helper text on **Category Detail**, and — nice synergy — as a **subtitle/tooltip in the review-inbox category picker** so it helps decide where an imported transaction belongs. Syncs across the household like everything else.

  **Stage 5 addition — make a saved expense fully editable after the fact.** *Current state (audited):* `ExpenseModal` + `updateExpense` already edit **amount, date, description (the notes), and payment method** post-save, and all sync via `persistChange`. **Two gaps to fix:** (1) **category is NOT editable** — `updateExpense`'s `Pick` omits `categoryId` and `ExpenseModal` has no category selector; add `categoryId` to the update type and a category `<select>` to the modal. (2) The amount validation rejects `parsed <= 0`, which would **block editing a refund/negative-amount expense** (Stage 3 refunds); relax it to allow negative amounts (or handle the sign explicitly) so refunds are editable too. **No migration** — every field already exists on `Expense`; edits route through the existing `updateExpense` → `persistChange` path, so they sync across the shared household automatically. *Checkpoint:* open any saved expense (including an imported/split/refund one) → change category, amount, date, payment method, and description → all persist and sync to the partner.

### Honest rough edges / risks
- **Bank CSV variability** — headers, date formats, encodings, preamble junk. *Mitigation:* mapping UI + saved profiles + preview-before-import; still expect per-bank surprises (why I want your real samples).
- **Credit/debit sign** — the #1 footgun; a wrong sign flips money-in/out for a whole file. *Mitigation:* explicit sign-convention toggle + mandatory signed preview the user confirms.
- **Pending vs. posted** — statement "pending" lines can change/vanish; a pending→posted transition can change amount/description/date and dodge the dedup key → a possible dupe. *Mitigation/recommendation:* **import posted transactions only** (most exports are posted); §5b's soft match catches many escapees.
- **Dedup edge cases** — legit identical same-day charges vs. re-imports; occurrence-index keys handle re-imports but can't perfectly distinguish "two real coffees" from "the same coffee twice" across *different* files. Never silently merge across files; when ambiguous, show both and let the user skip.
- **Refund vs. one-time income ambiguity** — real judgment call; we suggest, the user decides (§3b).
- **Merchant normalization** — messy descriptors mean rules can over- or under-match; kept in one tunable helper; rules are per-household and editable.
- **Negative-amount refund expenses** — verify charts, pace bars, alert %, and PDF handle negative/near-zero category totals cleanly.
- **Concurrency** — two partners on one inbox; solved by deterministic-id idempotent approval + LWW status + advisory claim.
- **Big files** — a year-long CSV could be thousands of rows; parse/stream and paginate the inbox; keep dedup O(1) via a key set.
- **No auto-posting in Phase 4** — everything is human-reviewed by design; merchant rules only *pre-fill*.

### What I need from you
1. **One real CSV export per institution you'll actually import** (checking, and each card). Redact balances if you like, but keep date/description/amount columns intact. *This is the single most valuable input* — it lets me nail the mapping, date format, and sign convention and seed a built-in profile.
2. **An OFX/QFX/QBO export too, if your bank offers one** (menu often reads "Download → Quicken/QuickBooks").
3. **Confirm the two modeling calls:** (a) refund = **negative-amount expense** in a category (vs. a separate adjustments ledger); (b) one-time income = **separate `one_time_income` ledger** surfaced additively on Dashboard/YTD.
4. **The `±N days` window** for the "already in your budget?" match (default **3**).
5. **When we implement Stage 0**, you'll run the `0002` Supabase migration (same as Phase 2) — no secrets, just the SQL.
6. **Scope confirm:** OK to ship **CSV first** and add **OFX/QFX** in Stage 4? And keep `import_batches`/`import_profiles` as I've scoped them (profiles worth it, batches optional)?

### Cadence
Import is **manual — no scheduler.** Recommended rhythm: **once a week** (e.g. weekend), pull the last week's *posted* transactions and clear the inbox together. But the importer **accepts any date range** and leans on dedup (§5), so overlapping or catch-up imports (a whole month at once, or two weeks that overlap last week) are safe — already-seen rows are silently skipped. No penalty for importing "too much."

---

## Recommendation summary (one line each)

1. **CSV first, OFX/QFX in Stage 4.** CSV via PapaParse with a **mapping UI + saved per-bank profile** hybrid and a mandatory signed **preview**; OFX later for its FITID dedup superpower.
2. **Shared realtime "pending" inbox**, both partners see/clear it; **idempotent approval** (deterministic expense ids) makes concurrency and re-imports safe.
3. **Refund = negative-amount expense** in a category (model intact); **windfall = separate `one_time_income` ledger** surfaced *additively* on Dashboard/YTD; recurring income logic untouched.
4. **Dual dedup:** stable per-transaction key (FITID / hashed+occurrence) blocks re-imports; a **soft ±3-day amount/merchant match** flags rows already entered manually.
5. **Per-household merchant memory** pre-fills categories but **never auto-posts** — the on-ramp to optional auto-approve later.
6. **All additive**, all through the existing `LocalBackend`/`CloudBackend` path, so it works **offline on desktop and synced in a shared household** with the same code.
