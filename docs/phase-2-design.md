# Phase 2 — Shared Households with Live Co-Editing (Design)

Status: **approved**. No app code written yet. Backend stack: **Supabase** (Postgres + Auth + Realtime), **Google OAuth**. The app stays **fully usable local/offline by default** (Phase 1 unchanged); signing in is opt-in and joins a shared household that syncs live both ways.

**Confirmed decisions:** loopback port **8422** (with 8423/8424 as fallbacks); **share-code** invites; **settings row-LWW** accepted.

---

## 1. Google OAuth in Tauri 2 + Supabase

**Approach: system browser + PKCE + loopback via `tauri-plugin-oauth` on fixed port 8422 (Supabase-mediated).**

1. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'http://localhost:8422', skipBrowserRedirect: true } })` → returns a URL.
2. `tauri-plugin-oauth` starts a one-shot localhost server on **8422**; app opens the URL in the **system browser**.
3. Google authenticates → redirects to **Supabase's** callback → Supabase redirects to `http://localhost:8422/?code=…`.
4. Plugin captures the request; app calls `supabase.auth.exchangeCodeForSession(code)` (PKCE — the code is useless without the app's verifier).
5. Session persisted to app-data; server shuts down.

supabase-js config: `auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true }` with a Tauri-backed storage adapter (not localStorage).

**Why loopback over deep-link / native id_token:** no hosted redirect page, no OS scheme registration, identical dev/prod behavior, and Google only ever sees one fixed URL (the Supabase callback). Supabase's redirect-allowlist wildcard is unreliable for `localhost`, so we register **exact** ports.

**Redirect URLs (register once):**
- Google Cloud OAuth client (type *Web application*) → Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
- Supabase → Auth → URL Configuration → Redirect URLs: `http://localhost:8422`, `http://localhost:8423`, `http://localhost:8424`

The Google **client secret lives only in Supabase**, never in the app or repo. The app ships only the Supabase URL + anon key (public by design; RLS is the real guard).

## 2. Schema — normalized (not a per-household document)

Realtime emits **per-row** events, so normalized rows let two people edit different records with zero conflict; a JSON blob would make every edit collide. Conventions: client-generated **UUID** PKs, `household_id` FK, soft-delete via `deleted_at` (deletes become updates that carry a full payload and power Undo), and DB-stamped `updated_at`/`updated_by` for conflict resolution.

Tables: `households`, `household_members`, `income_sources`, `groups`, `payment_methods`, `categories`, `expenses`, `household_settings` (singleton per household), `invites`. Full DDL: [`supabase/migrations/0001_phase2_schema.sql`](../supabase/migrations/0001_phase2_schema.sql). `onboarded` stays **local/per-device** and is not stored in the cloud.

## 3. Row-Level Security

RLS on every table; all budget-data policies gate on `is_member(household_id)`. `is_member()` is `SECURITY DEFINER` to avoid recursion on `household_members`. Membership changes happen **only** through the `create_household()` / `redeem_invite()` RPCs (also `SECURITY DEFINER`), so nobody can insert themselves into a household they weren't invited to. See the migration for the exact policies.

**Negative test (Stage 6):** user B (not in household A) gets zero rows from A's data and is rejected on insert into A.

## 4. Sync + conflict handling

- **Initial load (cloud mode):** one `select … where household_id = H and deleted_at is null` per table; hydrate the store via a snake→camel mapper.
- **Write-through:** a single **backend interface** with two implementations — `LocalBackend` (`ledger.json`, today) and `CloudBackend` (Supabase upserts). Every store mutation goes through one path.
- **Realtime:** `postgres_changes` per table filtered by `household_id`; apply inbound rows when `incoming.updated_at >= local.updated_at`; ignore our own echoes.
- **Conflict = per-record Last-Write-Wins on DB-stamped `updated_at`.** Additive entries (new expenses) are distinct UUID rows and never conflict — the common case is lossless. Same-record simultaneous edits (rare for two people) resolve deterministically by server time; UI shows "edited by <partner>". Deletes are soft → LWW; Undo clears `deleted_at`. Settings is a singleton row → row-LWW (accepted). No CRDTs — unjustified for two users.

## 5. Dual mode (local ↔ cloud)

- Default is **Local = Phase 1**, unchanged; `ledger.json` stays the offline source of truth. An `activeProfile: 'local' | { householdId }` selector picks what the store hydrates.
- **On sign-in with existing local data, a 3-choice prompt (never silent):**
  1. **Create a shared household from this budget** *(recommended)* — uploads current local data into a new household, switches to cloud.
  2. **Join my partner's household** — enter a share code; cloud loads fresh; **local data left intact** as a separate profile.
  3. **Stay local for now** — cloud available later from Settings.
- Never auto-merge local into an existing household. Local file is always preserved; switching back to Local restores it; sign-out returns to Local.

## 6. Household creation + invite (share code)

- `create_household()` → creator becomes `owner`, settings seeded.
- Owner generates a code (`invites` row), shares it out-of-band; partner signs in → `redeem_invite(code)` validates expiry/uses and adds membership. Both resolve the same `household_id`. Email invites deferred.

## 7. Staged build plan

| Stage | Deliverable | Checkpoint |
|---|---|---|
| 0. Backend setup | Run schema+RLS SQL; configure Google provider + redirect URLs | Tables + RLS + RPCs exist (queries below) |
| 1. Auth | supabase-js + `tauri-plugin-oauth`; sign-in/out; PKCE loopback; session persisted | Sign in with Google, email shows in Settings; sign out; Local mode untouched |
| 2. Household + invite | `create_household` + share-code redeem UI | Two accounts land in one household (2 member rows) |
| 3. Cloud data + write-through | store↔Supabase mapper; load on cloud mode; edits upsert | A adds expense → manual refresh on B shows it |
| 4. Realtime | `postgres_changes` + LWW apply | A edits → B updates live (~1s); concurrent same-row edit resolves deterministically |
| 5. Dual-mode UX | sign-in prompt (import/join/stay); profile switch | Local preserved; import creates matching household; toggle back offline |
| 6. Hardening | offline queue + reconnect reconcile; soft-delete Undo across sync; RLS negative tests; error toasts | Recovers from mid-edit network loss; B can't read A's household |

**Realistic for one weekend:** Stages 0–4, likely 5. Stage 6 (robust offline reconcile + exhaustive RLS/edge tests) spills over — done carefully, not rushed.

**Risks:** OAuth desktop friction (mitigated by fixed port + exact allowlist); LWW correctness (mitigated by DB-stamped time); store↔schema mapping is the largest surface (mitigated by the single backend interface); RLS recursion/holes (mitigated by `SECURITY DEFINER` helper + RPC-only membership); offline reconcile is genuinely hard (deferred to Stage 6); same-field concurrent edit can lose under LWW (rare, surfaced in UI; additive entries never lost).

---

## Stage 0 — one-time backend setup (for Justin)

### A. Google Cloud Console — create the OAuth client
1. https://console.cloud.google.com → project picker (top bar) → **New Project** → name `Budget` → Create → select it.
2. **APIs & Services → OAuth consent screen** → User type **External** → Create. App name `Budget`, user support email = your email, developer contact = your email → Save. Under **Test users**, add your and your partner's Google emails (in Testing mode only listed users can sign in).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type **Web application** → Name `Budget Supabase Auth`.
4. **Authorized redirect URIs → Add URI** → paste exactly (no trailing slash):
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
5. **Create** → copy the **Client ID** and **Client Secret**.

**Find your `PROJECT_REF`:** Supabase dashboard → your project → it's in the URL `…/project/<PROJECT_REF>`, and under **Project Settings → General → Reference ID**. Your API URL is `https://<PROJECT_REF>.supabase.co`.

### B. Supabase — enable Google
1. **Authentication → Providers → Google** → Enable.
2. Paste the **Client ID** and **Client Secret** from Google. Save.
3. Confirm the "Callback URL" shown matches `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (that's what you put in Google).

### C. Supabase — redirect allowlist
**Authentication → URL Configuration → Redirect URLs → Add URL** (three exact entries):
`http://localhost:8422`, `http://localhost:8423`, `http://localhost:8424`. (Site URL can stay default.)

### D. Run the schema
**SQL Editor → New query** → paste all of `supabase/migrations/0001_phase2_schema.sql` → **Run**. Expect *Success. No rows returned.*

### E. Checkpoint (before we build anything)
```sql
-- 9 tables present
select tablename from pg_tables where schemaname='public'
  and tablename in ('households','household_members','income_sources','groups',
  'payment_methods','categories','expenses','household_settings','invites')
  order by 1;

-- RLS enabled on the sensitive tables (relrowsecurity = true)
select relname, relrowsecurity from pg_class
  where relname in ('households','expenses','categories','household_members');

-- RPCs + helper present
select proname from pg_proc where proname in ('create_household','redeem_invite','is_member');
```
Expect: 9 table rows, `relrowsecurity = true` for all four, and all three functions.

### F. Handoff — exactly what to give me and how
- **To me (safe to share, safe to ship):**
  - `VITE_SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = **Project Settings → API → Project API keys → `anon` `public`**

  I'll put these in a **git-ignored `.env`** at the repo root (I'll add `.env` to `.gitignore` before writing any `.env`).
- **Google Client SECRET:** goes **only** into Supabase (step B). Never send it to me, never in the app or repo.
- **`service_role` key:** never share, never ship — it bypasses RLS. Keep it in the Supabase dashboard only.

Once Stage 0 checks pass and you hand over the URL + anon key, we start **Stage 1 (auth)**.
