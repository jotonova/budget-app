# Phase 3 — Web Version (mobile browser + PWA on Netlify) — Design

Status: **planning only, no code yet.** Goal: run Budget in a phone browser (iPhone/Android) with "Add to Home Screen," deployed on Netlify, **cloud-only** and synced live with the desktop app via the existing Supabase backend. The **desktop app must keep working unchanged** — the web build is purely additive from the same repo.

Guiding principle: **one codebase, one Vite bundle, runtime branching.** The `@tauri-apps/*` modules are safe to *import* in a browser; they only throw when *called* without the Tauri runtime. So we detect the platform at runtime and route each native touchpoint to a web fallback — no separate app, no forked components.

---

## 1. Architecture: reuse React components in a web build

**Recommendation: same repo, same components, same `vite build` output (`dist/`).** Tauri already wraps `dist/`; Netlify will serve the *same* `dist/`. The only difference is the runtime environment, which we detect once:

```ts
// src/lib/platform.ts
import { isTauri } from '@tauri-apps/api/core'
export const isDesktop = isTauri()   // false in a browser
export const isWeb = !isDesktop
```

(`isTauri()` is the official Tauri 2 check; fallback `'__TAURI_INTERNALS__' in window`.)

Then every native call goes through a tiny platform adapter that has a desktop impl and a web impl, selected by `isDesktop`. **The web build always runs in cloud mode** (Phase 2's `CloudBackend`/Supabase path) and never touches the local-file `LocalBackend`.

### Every Tauri/`invoke` call site and its web fallback

| File | Native call | Purpose | Web fallback |
|---|---|---|---|
| `lib/persistence.ts` | `invoke('read_ledger' / 'write_ledger' / 'get_app_data_dir')` | Local `ledger.json` (LocalBackend) | **Not used on web.** Web is cloud-only → `sync.ts` mode is always `cloud`, so `loadLedger`/`saveLedger` are never called. Guard the App bootstrap so it doesn't call `loadLedger()` on web. |
| `lib/authStorage.ts` | `invoke('read_ledger'/'write_ledger'/'get_app_data_dir')` | Supabase session persisted to an app-data file | Web: use `localStorage` (Supabase default) — select the storage adapter in `lib/supabase.ts` by `isDesktop`. |
| `store/authStore.ts` | `invoke('oauth_start')`, `listen` (event), `openUrl` (opener) | Desktop loopback OAuth | Web: `signInWithOAuth({ redirectTo })` full-page redirect (§2). Branch `signInWithGoogle` by platform. |
| `lib/notifications.ts` | `@tauri-apps/plugin-notification` | Budget-threshold alerts | Web: Web Notifications API (with permission) or **no-op** — recommend no-op for v1. |
| `components/LedgerView.tsx` | `save` (dialog) + `invoke('write_bytes')` (PDF), `invoke('write_ledger')` (CSV) | Export statement/CSV to disk | Web: **browser download** via `Blob` + `<a download>` (no dialog needed). |
| `components/SettingsScreen.tsx` | `save`/`open` (dialog) + `invoke('write_ledger'/'read_ledger')` | JSON backup/restore | Web: `Blob` download for backup; `<input type=file>` for restore. |

**Abstraction to build (Stage 0):**
- `lib/supabase.ts` — pick session storage (file adapter vs `localStorage`) and `detectSessionInUrl` (`false` desktop / `true` web) by `isDesktop`.
- `store/authStore.signInWithGoogle` — desktop loopback vs web redirect.
- `lib/files.ts` — `saveFile(name, bytes|text)` / `openTextFile()` helpers: desktop (dialog + `invoke`) vs web (Blob download / file input). Used by export + backup/restore.
- `lib/notify.ts` — `notify(title, body)`: desktop plugin vs web/no-op.
- `App.tsx` bootstrap — desktop: `loadLedger()` then optional cloud switch (today's behavior). Web: skip local load; go straight to auth → cloud (§3).

Everything else (Zustand stores, `cloud.ts`, `realtime.ts`, `sync.ts`, all screen components, onboarding) is already platform-neutral and reused as-is. **Import safety:** verify no `@tauri-apps/*` module throws at *import* time in a browser (they don't in normal use — calls throw, imports don't); the platform guards ensure calls only happen on desktop.

---

## 2. Auth on web — Supabase standard OAuth redirect (much simpler)

Web doesn't need the loopback server. Flow:

1. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <web-app-url> } })` → full-page redirect to Google.
2. Google → **Supabase callback** → Supabase redirects back to `redirectTo` with the code in the URL.
3. supabase-js with `detectSessionInUrl: true` (web) automatically completes the PKCE exchange on page load. Session stored in `localStorage`, auto-refreshed.

supabase-js config on web: `{ flowType: 'pkce', detectSessionInUrl: true, persistSession: true, storage: window.localStorage }`.

### Exact configuration (this is the whole setup)
- **Google Cloud: no change.** Because Supabase mediates, Google's only Authorized redirect URI stays `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (already registered from Phase 1/2). *(Optional: add the Netlify origin under "Authorized JavaScript origins" if Google ever flags it — usually not needed for the Supabase-mediated flow.)*
- **Supabase → Authentication → URL Configuration:**
  - **Site URL:** your production web URL, e.g. `https://budget.<yourdomain>` (or the `*.netlify.app` URL).
  - **Redirect URLs (allowlist):** add the production URL **and** Netlify deploy previews, e.g.:
    - `https://budget.<yourdomain>` (or `https://<your-site>.netlify.app`)
    - `https://<your-site>.netlify.app/**` and `https://deploy-preview-*--<your-site>.netlify.app/**` (Supabase supports wildcards for preview URLs)
  - Keep the existing desktop loopback entries (`http://localhost:8422`‑`8424`) — both platforms coexist.
- **Session persistence:** browser `localStorage` (safe — it holds the RLS-scoped session; RLS is the real guard). Cleared on sign-out.

This is dramatically less fiddly than the desktop loopback — no local server, no port allowlist, no `exchangeCodeForSession` plumbing.

---

## 3. Data model on web — cloud-only (recommended), synced with desktop

**Recommendation: web is cloud-only (sign-in required). Do NOT build a web IndexedDB offline mode for v1.**
- Rationale: the whole point of the phone is to see the **shared household**, which lives in Supabase. A local/offline web store (IndexedDB) would duplicate the desktop `LocalBackend`, add a second sync-reconciliation surface, and mostly serve a use case (private on-device budget) that the desktop already covers. Cost ≫ benefit for v1.
- So on web: no sign-in ⇒ a friendly "Sign in to view your budget" screen; signed-in ⇒ load the active household via the existing `CloudBackend` + realtime.
- **Sync with desktop: already solved.** Phone and Mac are just two Supabase clients subscribed to the same household. A change on your Mac appears on your phone within ~1s via the Phase 2 realtime subscription (`postgres_changes`, LWW). No new sync code — the web build reuses `cloud.ts` + `realtime.ts` verbatim.
- `onboarded` flag on web → `localStorage` (per-device); the web onboarding is sign-in-first (§4), so a web user lands in the household directly.
- **Offline reality on web:** the PWA shell loads offline, but data needs the network (cloud-only). Show an "offline — reconnect to sync" state; writes while offline fail visibly (same sync-error banner as desktop). A real offline queue is out of scope for v1 (matches the desktop's Stage-6 deferral).

---

## 4. Responsive / mobile UI — the biggest chunk, honestly

The app was built for a **1200×800 desktop window** with fixed max-widths and 2-column grids and inline styles. It will *function* on a phone today but look cramped and need real layout work. Being blunt: **this is the largest part of Phase 3 — plan for it to dominate the effort.**

What needs rework, roughly in order of effort:

| Screen | Issue on ~375px wide | Work |
|---|---|---|
| **Dashboard** | Hero card OK; **group/standalone cards use `repeat(2,1fr)` grids**; **charts use a 2-col grid**; income breakdown row | Stack grids to 1 column under a breakpoint; stack the two chart cards; shrink donut sizes. **Medium–large.** |
| **LedgerView** | Filter bar wraps OK, but the **expense table** is wide; PDF/CSV buttons | Convert the table to a stacked **card list** on mobile (date/category/amount per row); export via browser download. **Large.** |
| **SettingsScreen** | Tab row, forms, and **drag-to-reorder** categories/payment methods | Tabs → scrollable/again fine; **DnD on touch** needs `@dnd-kit` touch sensors + bigger handles (fiddly). **Medium–large.** |
| **AddExpense / ExpenseModal** | Mostly single-column already | Bump touch targets, ensure the numeric keypad (`inputMode="decimal"`), full-width buttons. **Small–medium.** |
| **CategoryDetail / YearToDate** | Donuts + bars sized for desktop | Responsive chart sizes; stack. **Medium.** |
| **Onboarding modal** | `maxWidth:560, maxHeight:90vh` — OK, but dense steps | Ensure it fits small screens, larger tap targets, sign-in-first ordering. **Small–medium.** |

**Cross-cutting:**
- **Touch targets:** enforce ≥ 44×44px on all buttons/inputs/checkboxes (several are ~34px now).
- **Breakpoints:** introduce a single mobile breakpoint (~640px). Because styles are **inline objects**, add a tiny `useIsMobile()` hook (matchMedia) and branch grid/layout props — or move the handful of grids to CSS with media queries in `styles.css`. Recommend the CSS-media-query route for grids to avoid re-render churn.
- **Navigation:** desktop uses on-Dashboard buttons. On mobile, recommend a **bottom tab bar** (Dashboard · Add · Ledger · Settings) — thumb-reachable, app-like. The big **"＋ Add Expense"** should be a persistent FAB or bottom-bar center action.
- **Safe areas / viewport:** `viewport-fit=cover` + `env(safe-area-inset-*)` padding for notches/home indicators; `<meta name="viewport" ...>` already present.

This stage is where "reuse the components" pays off (logic/state untouched) but still needs deliberate, screen-by-screen layout passes.

---

## 5. PWA — Add to Home Screen

**Recommendation: `vite-plugin-pwa` (Workbox under the hood).** It generates the manifest + service worker in the same build.

- **Manifest:** `name: "Budget"`, `short_name: "Budget"`, `display: "standalone"`, `theme_color`/`background_color` from the palette (`#0f172a` / `#f8fafc`), `start_url: "/"`, and icons (reuse the bar-chart mark; generate 192/512 + maskable). This gives an app icon + chromeless launch on Add to Home Screen (iOS Safari + Android Chrome).
- **Service worker:** precache the app shell (JS/CSS/icons) so the UI loads instantly and offline. **Runtime data is NOT cached** (cloud-only, always fresh from Supabase).
- **Realistic offline behavior:** the shell opens offline and shows your last-rendered state / an "offline" banner; you can't load or save data until reconnected. That's the honest ceiling for a cloud-only app without an offline queue.
- **⚠️ Real caveat — SW × OAuth:** service workers can intercept navigations and break the OAuth **redirect callback**. Mitigate by excluding the auth-callback navigation from the SW (`navigateFallbackDenylist`) and not precaching the callback route. This is a known sharp edge ([vite-plugin-pwa + Google sign-in issues](https://answers.netlify.com/t/netlify-identity-and-vite-plugin-pwa-google-sign-in-error/121363)); we test sign-in **after** enabling the PWA.
- iOS limits: no web push, storage can be evicted, standalone quirks — acceptable for "view/edit our budget on the phone."

---

## 6. Deployment — Netlify

- **Connect** the GitHub repo `jotonova/budget-app` to Netlify.
- **Production branch:** `main` (once Phase 3 merges) — so the web stays in lockstep with desktop releases. During development, deploy the `phase-3-web` branch as a **branch deploy / deploy preview** to test before merging.
- **Build command:** `pnpm build` (= `tsc && vite build`). **Publish directory:** `dist`. Node 20/22; enable pnpm (Netlify autodetects the lockfile).
- **Env vars (Netlify → Site settings → Environment):** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the public publishable values). *(The committed `.env.production` also supplies these at build time, but setting them in Netlify is the clean source of truth and lets you rotate without a commit.)*
- **SPA + OAuth callback routing:** add `public/_redirects` with `/*  /index.html  200` so deep links and the OAuth return URL serve `index.html` (the app has no router, but the redirect return path still needs to resolve to the app).
- **Custom domain:** point a subdomain (e.g. `budget.<yourdomain>`) at Netlify, or use the free `https://<site>.netlify.app`. Whatever you pick becomes the Supabase **Site URL** + a **Redirect URL** (§2).
- **Staying in sync with desktop:** both targets build from the same commit. A push to `main` triggers a Netlify deploy; a version tag triggers the desktop installer workflow. They share the exact same app code, so features land on web and desktop together. (Web doesn't need version bumps/tags — it's continuously deployed.)

---

## 7. Staged build plan, risks, and what I need from you

### Stages (each independently verifiable)

| Stage | Deliverable | Checkpoint |
|---|---|---|
| **0. Platform abstraction** | `platform.ts` (`isDesktop`), guard the 6 native touchpoints (storage/oauth/files/notify + App bootstrap). **Desktop code paths unchanged.** | `pnpm build` → open `dist/index.html` in a browser: app loads, shows "sign in," **no console crash**; desktop app still builds + runs identically. |
| **1. Web auth + cloud load** | Web `signInWithOAuth` redirect; `detectSessionInUrl`; cloud/realtime load on web | Sign in on a desktop browser → see the household's data; a change on the Mac app appears in the browser tab live. |
| **2. Responsive UI (largest)** | Mobile breakpoint, stacked grids, bottom-tab nav, 44px targets, table→cards, touch DnD, safe areas | On a real phone browser: every screen usable and readable; add/edit an expense with the on-screen keypad. |
| **3. PWA** | `vite-plugin-pwa` manifest + SW; icons; SW/OAuth denylist | Add to Home Screen on iPhone + Android → app icon, standalone launch, shell loads offline; **sign-in still works** with the SW active. |
| **4. Netlify deploy** | Netlify site, env vars, `_redirects`, Supabase Site/Redirect URLs | Live URL; sign in from your phone; add an expense on the Mac → shows on the phone within ~1s. |
| **5. Polish** | Offline banner, export-as-download, optional web notifications, empty/error states | Offline shows a clear state; CSV/PDF/backup download in the browser. |

**Realistic scope:** Stages 0–1 and 3–4 are modest and well-understood. **Stage 2 (responsive) is the bulk of the work** and where time will go. A usable phone version is a solid weekend+; a *polished* one is more.

### Honest rough edges / risks
- **Responsive rework is large** — inline styles + fixed grids mean a screen-by-screen pass (mitigated by the CSS-media-query approach for grids and a `useIsMobile()` hook for the rest).
- **Service worker × OAuth redirect** — the classic PWA gotcha; must denylist the callback and test sign-in after enabling the SW.
- **Touch drag-and-drop** for reordering categories/payment methods is fiddly on mobile — may fall back to up/down buttons on small screens.
- **One bundle for two runtimes** — relies on `@tauri-apps/*` being import-safe in a browser (true today) and disciplined `isDesktop` guards; a stray unguarded `invoke` would throw at runtime on web (caught in Stage 0 testing).
- **iOS PWA limits** — no push, possible storage eviction, standalone quirks; fine for our use.
- **Public config exposure** — the web bundle ships the Supabase URL + publishable key (already public/RLS-guarded, same as the desktop `.env.production`).
- **Cloud-only on web** — no offline editing; acceptable for v1, matches the phone's purpose.

### What I need from you (one-time)
1. **Connect Netlify** to `jotonova/budget-app` (you have the account) — I'll provide the exact build settings; you click through the connect + set env vars.
2. **A domain/subdomain choice** — a custom `budget.<yourdomain>` or the free `*.netlify.app`. Tell me which so I can give you the exact Supabase URLs to register.
3. **Register in Supabase → Auth → URL Configuration:** set **Site URL** = your web URL and **add Redirect URLs** for it + Netlify previews (I'll give you the exact strings once you pick the domain). Google Cloud needs **no change**.
4. **Confirm the two env vars** in Netlify: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public values).

Nothing else changes on the backend — the schema, RLS, realtime, and the shared household are reused as-is.

---

Sources: [Tauri runtime detection (`isTauri` / `__TAURI_INTERNALS__`)](https://github.com/tauri-apps/tauri/discussions/6119), [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Supabase Google login guide](https://supabase.com/docs/guides/auth/social-login/auth-google), [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/), [Supabase OAuth in a Vite React app](https://www.meje.dev/blog/supabase-oauth-in-react-apps), [vite-plugin-pwa + Google sign-in caveat](https://answers.netlify.com/t/netlify-identity-and-vite-plugin-pwa-google-sign-in-error/121363).
