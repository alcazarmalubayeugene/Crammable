# Navigation & Loading UX — Persistent Shell + Skeletons

> Plan exported for continuation in a later session. Approach chosen: **Persistent shell + skeletons**.
> Stack: Next.js **16.2.6** + React **19.2.4**. Per `AGENTS.md`, this Next version diverges from
> training data — **read `node_modules/next/dist/docs/` before writing navigation/Link/loading code**
> (esp. `useLinkStatus`, `loading.tsx`, route groups, layouts).

## Context

Today, every navigation in the app feels like a hard reload. Two things compound:

1. **Root `loading.tsx`** renders a **full-screen spinner** (`PageLoading`) on *every* route transition.
2. Every content page (`dashboard`, `decks/[id]`, `quiz/[deckId]`, `settings`, `rewards`, `upgrade`, `admin`) is a **client component** that does its auth check + data fetch in `useEffect` and gates the whole page behind `if (loading) return <PageLoading/>` — a *second* full-screen spinner.

Because the `Navbar` is rendered *inside* each page's `<main>` (not in a layout), the **entire screen blanks** — nav chrome included — on every click, often twice (route-transition spinner → page mounts → data-fetch spinner). There are no skeletons, no progress bar, and no `Suspense`.

The current behavior is consistent and safe, but it's the heaviest possible loading UX. Goal: keep the shell on screen, give immediate feedback on navigation, and swap full-screen spinners for in-place skeletons — **without** changing the client-side Supabase auth/data model.

## Approach (recommended)

Three layers, smallest-risk first. Each is independently shippable.

### 1. Global route-progress bar (biggest perceived-speed win)
- Add `src/components/ui/RouteProgress.tsx` — a thin (2–3px) top bar in `var(--primary)` that animates during navigation.
- Mount it once in root `src/app/layout.tsx` (inside `ThemeProvider`, alongside `PaymentNotifications`).
- Drive it from navigation pending state. Check current Next 16 docs for the supported primitive: prefer `useLinkStatus()` for `<Link>` pending, and wrap programmatic `router.push` calls in `useTransition` so `isPending` can feed the bar. A `usePathname()`-change effect is the fallback to "complete" the bar.
- This gives feedback on the click→new-page window that `loading.tsx` currently fills with a full-screen takeover.

### 2. Reusable skeletons + stop the full-screen data-fetch blank
- Add `src/components/ui/Skeleton.tsx`: a base `<Skeleton>` (CSS shimmer block using theme vars) plus a `SkeletonDeckCard` matching the dashboard deck-card layout. Add the shimmer `@keyframes` to `globals.css` next to the existing `.spinner` / `@keyframes spin`.
- In each content page, **replace `if (loading) return <PageLoading/>`** with: render the page's `<Navbar>` + page frame immediately, and show skeletons *only in the content region* while data loads. The background and nav stay put instead of blanking.
  - Representative pages: `src/app/dashboard/page.tsx` (deck grid → `SkeletonDeckCard` ×3–6), `src/app/decks/[id]/page.tsx`, `src/app/quiz/[deckId]/page.tsx`.
  - The `Navbar` already accepts optional props (`coinBalance`, `userName`, `isPro` are all optional) — render it pre-data with those omitted (coin pill / name simply absent until profile resolves), so it never blanks.

### 3. Centralize auth + profile, soften root `loading.tsx`
- Create an authenticated route group `src/app/(app)/` with a **client** `layout.tsx` that performs the auth check (the `supabase.auth.getUser()` + login redirect currently duplicated across pages) and fetches the profile **once**, exposing it via a small React context (`useAppProfile()`). Move the authed pages (`dashboard`, `decks`, `quiz`, `settings`, `rewards`, `upgrade`, `admin`, `onboarding`) under this group. URLs are unchanged (route groups don't affect paths).
  - Pages read `profile` / `token_balance` / `isPro` from context instead of each running its own profile fetch → removes the per-page auth waterfall and the redundant full-screen spinner.
  - Keep `Navbar` rendered **in the pages** (reading context), not hoisted into the group layout — the per-page nav config is too divergent (bespoke `rightContent` like the live quiz counter, per-page `sectionLabel` / `backHref`, `adminBadge`) to collapse into one shared instance. Rendering it from context data is what makes it "never blank."
- Change root `src/app/loading.tsx` to **not** render the full-screen spinner. Let the `RouteProgress` bar carry transitions (return a minimal/empty shell or a bare skeleton). This kills the double full-screen flash.

### Out of scope (note as future options)
- Converting pages to **server components + `Suspense` streaming** (the "deep refactor" option) — bigger payoff but rewrites the auth/data model; revisit later.
- Hoisting `Navbar` fully into the group layout — only worth it if the bespoke per-page navs are normalized first.

## Critical files
- `src/app/layout.tsx` — mount `RouteProgress`.
- `src/app/loading.tsx` — soften from full-screen spinner.
- `src/components/ui/RouteProgress.tsx` — **new**, global progress bar.
- `src/components/ui/Skeleton.tsx` — **new**, shimmer skeletons.
- `src/app/globals.css` — shimmer keyframes (beside existing `.spinner`).
- `src/app/(app)/layout.tsx` — **new**, centralized auth + profile context.
- Authed pages moved under `src/app/(app)/…`; each swaps `PageLoading` gate → Navbar + content skeletons and reads profile from context. Representative: `dashboard/page.tsx`, `decks/[id]/page.tsx`, `quiz/[deckId]/page.tsx`.
- `src/components/ui/PageLoading.tsx` — keep (still used for genuinely-full-screen waits like quiz setup), just stop using it as the default route/data gate.

## Reuse (already in the codebase)
- `Navbar` (`src/components/nav/Navbar.tsx`) — all data props optional; render pre-data.
- `Routes` / `ApiPaths` (`src/lib/contracts.ts`) — never hardcode paths.
- `getSupabaseBrowserClient` (`src/lib/supabase/browser.ts`) — reuse in the group layout's single auth/profile fetch.
- Existing `.spinner` / `@keyframes spin` in `globals.css` — pattern to mirror for shimmer.

## Verification
1. `npm run typecheck` and `npm run lint` clean; `npm test` (75 unit tests) still pass.
2. `npm run dev` and manually walk: home → signup/login → dashboard → open a deck → start quiz → submit → results → back to dashboard.
   - On each navigation: nav chrome and background **stay on screen**; a top progress bar animates; content area shows **skeletons** (not a full-screen spinner); no double-spinner flash.
   - Throttle network (DevTools) to confirm skeletons are visible and the shell never blanks under slow fetches.
3. Confirm auth gating still works: visiting an authed route logged-out redirects to login (now handled by the group layout, once).
4. Confirm theme/font anti-flash still works (dark + Baskerville default) — the root `layout.tsx` anti-flash script must be untouched.

---

## Current-state findings (reference for next session)

- **Only one `loading.tsx`**: `src/app/loading.tsx` → renders `PageLoading` full-screen on all transitions.
- **Only one layout**: root `src/app/layout.tsx` (anti-flash theme script + `ThemeProvider` + `PaymentNotifications` + version badge). No authenticated route-group layout exists.
- **No `<Suspense>`, no `useTransition`, no progress bar, no skeletons** anywhere.
- **`PageLoading`** (`src/components/ui/PageLoading.tsx`): full-page spinner + message; used both as the `loading.tsx` fallback and as each page's `if (loading)` gate.
- **All main content pages are `"use client"`** and fetch in `useEffect` (dashboard, decks/[id], quiz/[deckId], etc.). Auth check (`supabase.auth.getUser()` → `window.location.href = Routes.login`) is duplicated per page.
- **`Navbar`** (`src/components/nav/Navbar.tsx`) is shared but **heavily per-page configured** — props: `backHref`, `showWordmark`, `wordmarkHref`, `centerWordmark`, `sectionLabel`, `coinBalance`, `isPro`, `userName`, `links`, `showAvatarMenu`, `adminBadge`, `rightContent`. All data props optional. Several pages pass profile data they fetch themselves; quiz/deck-detail pass bespoke `rightContent`.
