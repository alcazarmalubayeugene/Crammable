# Launch ops — the two dashboard gates before go-live

**Status (2026-06-24):** the product is feature-complete and the code side of both
items below is already shipped. What remains is **external dashboard configuration** —
nothing in this repo needs to change. This doc is the copy-paste runbook for whoever
holds the Google Cloud + Supabase accounts.

Two hard gates stand between "code done" and "students can use it":

1. **Google OAuth provider** — the "Continue with Google" button is live in code but
   needs a Google OAuth client + the Supabase Google provider configured.
2. **Production email (SMTP)** — Supabase's built-in dev sender caps at ~2 emails/hour;
   signup-confirmation and password-reset both ride on it, so it must move to real SMTP.

> Find `<project-ref>` in `NEXT_PUBLIC_SUPABASE_URL` (`.env.local`): the URL is
> `https://<project-ref>.supabase.co`. Decide `<app-domain>` (e.g. `https://crammable.app`
> in prod, `http://localhost:3000` in dev).

---

## 1. Google OAuth

### Code side (already done — for reference, do not change)
- `src/lib/supabase/browser.ts` → `signInWithGoogle()` starts the PKCE flow with
  `redirectTo = ${window.location.origin}/api/auth/callback?consent=1&flow=signup`
  (domain-agnostic — works in dev and prod without edits).
- `src/components/auth/AuthCard.tsx` — the signup-mode button is gated on the DeepSeek
  consent checkbox (RA 10173).
- `src/app/api/auth/callback/route.ts` — exchanges the code for a session, persists
  `consent_deepseek` when `?consent=1`, prefills `full_name` from the Google profile, and
  routes new/incomplete profiles to onboarding (returning users → dashboard).

### Dashboard steps (one-time)

**A. Google Cloud Console** → APIs & Services → Credentials
1. **Create credentials → OAuth client ID → Web application.**
2. **Authorized redirect URI** = `https://<project-ref>.supabase.co/auth/v1/callback`
   — this is **Supabase's** receiver, **not** the app's `/api/auth/callback` route.
3. While the OAuth consent screen is in **Testing**, add the tester Google accounts under
   **OAuth consent screen → Test users** (otherwise sign-in is refused). Publish the
   consent screen before public launch.
4. Copy the **Client ID** and **Client Secret**.

**B. Supabase** → Authentication → Providers → **Google**
1. Toggle **Enable**.
2. Paste the **Client ID** + **Client Secret** from step A. Save.
   (The secret lives only in Supabase — **no new env var**, nothing committed.)

**C. Supabase** → Authentication → **URL Configuration**
1. **Site URL** = `<app-domain>`.
2. **Redirect URLs** allow-list must contain `<app-domain>/api/auth/callback`
   (add both the localhost and prod entries). The whole auth surface — signup confirm,
   resend, password reset, **and** Google OAuth — funnels through this single route, so
   this allow-list entry covers all of them.

> **Prod env:** set `NEXT_PUBLIC_APP_URL=<app-domain>` so the callback builds its
> post-login redirects against the real domain (it falls back to the request origin if
> unset, which is fine in dev).

### Verify
1. `npm run dev`, open `/login`, click **Continue with Google**, pick a test account.
2. New account → lands on `/onboarding/name` with the Google name prefilled.
   Returning account with a complete profile → lands on `/dashboard`.
3. On failure you're bounced to `/login?error=invalid_code` (or `missing_code`) — check
   that the redirect URIs in steps A2 and C2 exactly match (scheme, host, no trailing
   slash) and that the test account is listed in step A3.

---

## 2. Production email / SMTP

The built-in Supabase sender throttles at ~2 emails/hour (already hit while testing
`/forgot-password` — see `PROJECT-DOCUMENTATION §6`). At launch volume, confirmation and
reset emails would silently fail to send.

### Recommendation: **Resend**
For a small PH-student app, **Resend** is the lighter lift — simple SMTP creds, a generous
free tier (3k emails/mo), and quick domain verification (SPF/DKIM via a couple of DNS
records). **SendGrid** also works and is fine if you already have an account; it's just a
heavier console for the same outcome. Either way you must verify a sending domain so mail
doesn't land in spam.

### Dashboard steps
1. In Resend (or SendGrid): **verify your sending domain** (add the SPF/DKIM DNS records
   they show you), then create an **SMTP credential** (host, port `465`/`587`, username,
   password/API key).
2. **Supabase** → Authentication → **Emails → SMTP Settings** → **Enable custom SMTP** and
   fill in:
   - **Sender email** = e.g. `no-reply@<your-domain>` (must be on the verified domain)
   - **Sender name** = `Crammable`
   - **Host** / **Port** / **Username** / **Password** = the values from step 1
3. (Optional) raise the per-hour rate limit under **Authentication → Rate Limits** once
   custom SMTP is in — the low cap is a property of the built-in sender.

### Verify
1. From `/signup`, register a **real** email (Supabase rejects `@example.com` / `@test.com`)
   and confirm the confirmation email arrives from your sender address (not Supabase's).
2. From `/forgot-password`, request a reset and confirm the email arrives. The reset link
   lands on `/api/auth/callback?type=recovery` → `/settings?mode=reset-password`.
3. Smoke-test signup end-to-end (from `PROJECT-DOCUMENTATION §5`):
   ```
   curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" \
     -d "{\"email\":\"you@gmail.com\",\"password\":\"password123\"}"
   ```

---

## Pre-launch checklist
- [ ] Google OAuth client created; Supabase Google provider enabled with Client ID/Secret.
- [ ] Supabase Redirect URLs allow-list contains `<app-domain>/api/auth/callback` (dev + prod).
- [ ] `NEXT_PUBLIC_APP_URL` set in the prod environment.
- [ ] Google OAuth consent screen **published** (not just Testing) for public users.
- [ ] Custom SMTP enabled in Supabase with a **verified** sending domain.
- [ ] Signup-confirmation and password-reset emails verified to deliver.
- [ ] `App.gcashNumber` set in `contracts.ts` (already `09691816930` — confirm correct).
