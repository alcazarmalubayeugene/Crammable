# Crammable Design Proposal — "Capy Calm"

*Status:* Proposal (merged) · *Scope:* Full UI/brand system · *Mascot:* Capy the capybara
*Origin:* Drafted by [friend], merged with Claude's additions 2026-06-15

---

## 1. Where we are today (audit)

| Problem | Evidence |
|---|---|
| No design system — every page hand-rolls inline style={{}} objects | src/app/page.tsx, dashboard/page.tsx, layout.tsx all repeat raw hex values |
| Tailwind is installed but unused | tailwind.config.ts only maps two CSS vars; pages don't use utility classes |
| The "mascot" is the wrong animal | 🦫 is the *beaver* emoji — there is no capybara emoji. We're shipping a beaver. |
| Color palette exists only by accident | #FAF2E4, #C47A2E, #8A6E52 etc. are repeated as literals across files |
| Inner app pages feel unstyled compared to landing | Dashboard/quiz/settings have minimal, inconsistent layout |
| Accessibility gaps | #8A6E52 body text on #FAF2E4 is ~4.0:1 (borderline); #C47A2E text on white is ~3.1:1 (fails for small text) |
| No loading/empty/error design language | "Loading…" plain text; no empty states |

The good news: the instincts are right. Warm cream + brown + amber already feels capybara. This proposal formalizes it rather than replacing it.

**Confirmed against `docs/BASIC_UI.md` and `FRONTEND.md`:** the "no shared Navbar/Footer, no 404/error/loading, no admin nav gating" gap is already a documented, tracked P1/P2 item — not new scope. This proposal is the right vehicle to close it.

---

## 2. Brand concept: *Capy Calm*

Capybaras are the internet's "most chill animal" — and they're huge in Filipino meme culture. Cramming is the most stressful thing a student does. The brand tension writes itself:

**You're panicking. Capy isn't. Upload the PDF — Capy's got it.**

Crammable's competitors (Quizlet, Anki) feel like productivity tools. We feel like a calm study buddy the night before the exam. Every design decision should lower the user's heart rate: warm colors, soft corners, unhurried motion, a mascot that is visibly unbothered.

*Brand pillars*
1. *Chill, not childish* — Capy is calm and dry-witted, never hyperactive or cutesy-overload. Think Duolingo's owl energy, inverted.
2. *Warm, not corporate* — paper, kraft, café tones. No SaaS blue-purple gradients.
3. *Taglish-friendly voice* — copy can wink ("Kaya mo 'yan. Capy believes in you.") without being forced.

---

## 3. Mascot system: Capy

### 3.1 Character
- A round, sandy-brown capybara with heavy-lidded, half-closed eyes (the signature "unbothered" look).
- Signature prop: a *flashcard* held in its mouth or balanced on its head (the way real capybaras balance oranges/birds).
- Drawn as *flat vector SVG* with the brand palette — never emoji, never photos. Thick 2px outlines in Ink (#2E1A0C), soft rounded shapes.

### 3.2 Pose library (the asset set to commission/produce)

| Pose | Used in |
|---|---|
| capy-idle (sitting, card on head) | Navbar logo mark, footer, default |
| capy-reading (glasses, paper in paws) | Upload/extraction in progress |
| capy-soaking (in water, yuzu orange on head) | AI generation loading — "Capy is soaking in your notes…" |
| capy-sleeping (zzz) | Empty states — no decks yet, no quiz history |
| capy-cheering (confetti, eyes still half-closed) | Quiz score ≥ 80%, payment approved, referral earned |
| capy-thumbs-up | Quiz score 50–79%, deck created |
| capy-sweating (one bead of sweat, still calm) | Quiz score < 50%, low credits, validation errors |
| capy-shrugging | 404 / EXTRACTION_FAILED / AI_UNAVAILABLE |
| capy-guard (tiny security cap) | Login, password reset, consent screens |
| capy-rich (GCash-blue visor, coin) | Upgrade/pricing/payment pages |

Store as `public/capy/*.svg` plus a single `<Capy pose="..." size={...} />` React component.

### 3.3 Voice
Capy speaks in short speech bubbles (`CapySays` component): lowercase-casual, one sentence, optionally Taglish. Capy *never scolds*. On failure: "hindi pa tayo sure dito — try again?" not "WRONG."

Production note: until illustrated assets exist, ship a single commissioned capy-idle SVG and reuse it everywhere; add poses incrementally. Do *not* keep 🦫.

> **Claude's addition — don't let this block Phase 1.** A commissioned SVG set is a
> days-to-weeks external dependency. Ship a *placeholder* `capy-idle.svg` written as
> simple flat-vector code (circles/ellipses, brand palette, the "half-closed eyes"
> look) as part of Phase 1 — same `<Capy pose="..." />` API, swappable later without
> touching call sites. The component contract matters more than the art quality on
> day one. `CapySays` (text-only) needs *zero* art and should ship in Phase 1 too —
> it's the cheapest brand-voice win in the whole proposal and works everywhere
> (errors, empty states, loading) immediately.

---

## 4. Design tokens

All tokens live in `globals.css` as CSS variables and are mapped in `tailwind.config.ts`. No raw hex in components, ever (same philosophy as `contracts.ts` for the backend).

### 4.1 Color — "Riverbank" palette

| Token | Hex | Role |
|---|---|---|
| --color-cream | #FAF2E4 | App background (keep) |
| --color-paper | #FFFCF7 | Cards / surfaces (keep) |
| --color-sand | #E0C9A8 | Borders, dividers (keep) |
| --color-fur | #C47A2E | Primary brand / CTAs (keep) |
| --color-fur-deep | #9A5D1F | Primary hover, *small text links* (fixes 3.1:1 contrast) |
| --color-ink | #2E1A0C | Headings, body text, dark navbar (keep) |
| --color-taupe | #7A5E42 | Secondary text (darkened from #8A6E52 → passes 4.5:1 on cream) |
| --color-river | #3E7C8A | Info, links inside app, focus rings — the water Capy soaks in |
| --color-moss | #4D6B2D | Success (darkened from #5C7A35 for contrast) |
| --color-yuzu | #E8A93D | Warnings, streaks, highlights — the yuzu-bath orange |
| --color-clay | #B5402E | Errors, destructive |

Rationale: keeps the existing warmth, adds the two missing functional hues (info-blue and error-red) sourced from the capybara world (river water, clay riverbank) instead of generic Bootstrap colors.

> **Claude's addition — enforce, don't just convention.** Add an ESLint rule
> (`no-restricted-syntax` matching hex literals `/#[0-9a-fA-F]{3,8}/` inside
> `style={{}}` and `className` template strings, scoped to `src/app/**` and
> `src/components/**`, excluding `globals.css`/`tailwind.config.ts`). Without a
> lint gate, "no raw hex" decays the moment someone's in a hurry — and the current
> codebase shows that's exactly what happens. This is a 10-minute addition to
> `eslint.config.mjs` that makes the rule self-enforcing.

> **Co-founder decision (2026-06-19, reviewed via the standalone concept mockup):**
> front-runner direction is **Baskerville font + "Night Lamp" theme** (dark, warm-gold
> variant — already built and tested in `capy-lofi-concept.html`'s live theme picker,
> not theoretical). Sunset theme variant needs bolder/more prominent colors per
> feedback — currently a runner-up, not the pick. This supersedes "keep current
> Lora/DM Sans + light Riverbank as default" below until formally re-confirmed —
> treat Night Lamp's token values (already defined in the concept mockup JS) as the
> real Phase 1 palette, not a phase-3 dark-mode afterthought.

### 4.2 Typography (keep current fonts, formalize the scale)

- *Display / headings:* Lora (already loaded) — 700 for h1/h2, 600 for h3.
- *UI / body:* DM Sans (already loaded) — 400 body, 500 labels, 600 buttons.
- Scale: 13 / 14 / 15 (body) / 17 / 20 / 26 / clamp(2rem,5vw,3.5rem) — matches what the landing page already uses, now named (text-xs … text-display).
- *Flashcard text* gets its own treatment: Lora 500, 20–24px, generous line-height 1.5 — cards should feel like book pages, not UI chrome.

### 4.3 Shape, depth, motion

- *Radii:* sm 9px (inputs, small buttons) · md 14px (cards) · lg 20px (panels, modals) · full for pills. Everything rounded — nothing about a capybara is sharp.
- *Shadows:* almost none. Depth comes from the sand-colored 1.5px border + paper-on-cream layering. One soft shadow level (`0 4px 16px rgb(46 26 12 / 0.08)`) for modals/popovers only.
- *Motion:* slow and soft — 200–300ms ease-out. Signature interactions:
  - Flashcard flip: 3D rotateY 400ms.
  - Quiz progress bar: a tiny Capy silhouette walks along it.
  - Capy idle bob: 3s gentle float on loading screens.
  - All gated behind `prefers-reduced-motion`.

---

## 5. Component library

Build once in `src/components/ui/`, replace inline styles page-by-page:

| Component | Notes |
|---|---|
| Button | variants: primary (fur), secondary (sand outline), ghost, danger (clay); sizes sm/md/lg |
| Card | paper bg, sand border, md radius — the universal surface |
| Input / Textarea / Select | sand border, river focus ring, clay error state with message slot |
| Badge | tier badges (Free = sand, Pro = fur with ✦), status (pending = yuzu, verified = moss, rejected = clay) |
| Flashcard | the flip card — Lora text, tap/space to flip |
| ProgressBar | with optional walking-Capy variant |
| EmptyState | Capy pose + headline + CTA, used everywhere a list can be empty |
| Capy + CapySays | mascot + speech bubble |
| Toast | replaces ad-hoc notifications incl. PaymentNotifications |
| Modal | consent gate, delete confirmations |
| AppShell | the missing piece: shared authed layout — dark-ink top bar with logo, credit counter (🪙 n credits pill in yuzu), tier badge, avatar menu |
| Skeleton | cream-on-paper shimmer; kill all "Loading…" text |

The credit counter belongs in the AppShell permanently — credits are the core economy and currently invisible until the dashboard loads.

> **Claude's addition — Input needs a real `<label>` audit.** Several existing
> forms (signup, settings) likely rely on placeholder text as the only label,
> which fails screen readers. When building the `Input`/`Textarea`/`Select`
> components, bake in a required `label` prop (visually hideable via
> `sr-only` if needed) so it's structurally impossible to ship a label-less
> field going forward.
>
> **Claude's addition — Toast needs `aria-live="polite"`.** Cheap to add now,
> easy to forget later, and directly affects whether screen-reader users get
> told about credit deductions / save confirmations at all.

---

## 6. Screen-by-screen direction

**Landing (/)** — closest to done. Changes: real Capy SVG hero (right side of headline, not a lonely card below it); fix taupe/fur contrast; convert to Tailwind tokens; add a screenshot/mock of the flip card in the hero so the product is visible pre-signup.

**Auth (/login, /signup, /forgot-password)** — centered paper card on cream, capy-guard above the form, one-line Capy quip ("balik ka na, kanina pa kita hinihintay"). Signup highlights "3 free credits" with the yuzu coin pill.

*Dashboard* — AppShell + greeting ("Good evening, {firstName} — Capy kept your decks warm"). Deck grid of Cards: title (Lora), card count, relative date, quiz CTA. Prominent "＋ New deck" card as the first grid item. Empty state: capy-sleeping + "No decks yet. Wake me up with a PDF." Free-tier deck slots shown as 3 outlines that fill up (visualizes TierLimits instead of surprising users at the cap).

*Upload / New deck* — this is the product's money moment; design the waterfall as a visible, calm 3-step tracker: Reading your PDF → Generating cards → Done, each step with the matching Capy pose (reading, soaking, thumbs-up). On Layer-3 fallback, a friendly paste-box ("This scan is rough even for me — paste the text and I'll take it from here"), not an error wall. Consent gate = Modal with plain-language RA 10173 copy before first upload.

*Deck view* — flashcard list as flippable previews; primary CTA "Quiz me" in fur; Pro-locked actions (export, deep-dive) shown but with a small fur ✦ lock that links to upgrade — visible, not hidden.

*Quiz* — full-focus mode: hide nav chrome, cream background, single Flashcard center stage, walking-Capy progress bar on top, question counter. Identification mode gets a large Lora input. No red flashes on wrong answers — sand-bordered "not quite" state with the correct answer revealed below.

*Quiz results* — score hero ring in moss/yuzu/clay by bracket, Capy pose by bracket (cheering / thumbs-up / sweating), then the answer review list. Living-Deck refresh notice as a river-blue info Card. This screen is the screenshot students will share — make it the prettiest one.

*Upgrade / Payment* — capy-rich, the existing two-column pricing, then a 3-step GCash tracker (Send ₱150 → Enter 13-digit ref → Admin verifies ≤ 2hrs). Pending state uses the yuzu Badge and a reassuring Capy line; this manual flow needs visible status more than any other screen.

*Rewards / Referrals* — referral code as a big dashed-border coupon Card with copy button; progress toward ReferralCaps as a ProgressBar; earned credits celebrate with capy-cheering toast.

*Settings* — sectioned paper Cards (Profile / Consent / Data & privacy / Danger zone). Danger zone in clay with Modal confirm. DeepSeek consent toggle lives here with the same plain-language copy as the gate.

*Admin* — exempt from the cute layer. Same tokens, denser tables, status Badges, no Capy. Functional, fast.

> **Claude's addition — Study Session Timer (new feature idea, Phase 3+).**
> Crammable's whole identity is "the night before the exam." A small, optional
> Pomodoro-style timer on the Quiz/Deck-view screens — Capy holding a tiny
> hourglass, "Capy's timing you, 25 mins" — turns the calm-mascot concept into
> an actual *retention feature*, not just decoration. Differentiates from
> Quizlet/Anki (neither has a chill-mascot study-session framing) at near-zero
> backend cost (client-side timer, maybe one optional `study_sessions` log
> table later). Flag as an idea to revisit after Phase 2, not a blocker.

> **Claude's addition — mobile-first, not mobile-pass.** The proposal lists
> "mobile pass" as Phase 3 polish. Given students cram on phones between
> classes, I'd build every *new* component (Phase 1 onward) mobile-first from
> the start — it's the same effort as desktop-first when starting from
> scratch, but retrofitting later is the expensive path. Doesn't change the
> phase plan, just the default assumption when writing each component.

---

## 7. Accessibility & dark mode

- All text pairs pass WCAG AA after the taupe/fur-deep/moss adjustments above (the only intentional exceptions: large display text may use --color-fur).
- Focus rings: 2px river, always visible; full keyboard flow through quiz (space = flip, 1–4 = choices, enter = next).
- `prefers-reduced-motion` kills flips/bobs (instant swap instead).
- *Dark mode = "Night Cram" (phase 3, optional):* ink-brown surfaces (#1C120A bg, #2E1A0C cards), cream text, fur CTAs unchanged. Students cram at 2am; this is a real feature, not a checkbox. Remove the current auto `prefers-color-scheme` block in `globals.css` until then — right now it sets dark vars that pages override inconsistently.

> **Claude's addition — skip-to-content link.** One-line addition to AppShell,
> standard a11y practice, currently absent from every page. Bundle it with the
> AppShell build in Phase 1 — it's a single `<a href="#main">` plus a
> visually-hidden-until-focus style.

---

## 8. Implementation plan (revised)

> **Claude's revision to the phase order.** The original Phase 1 bundled
> "tokens + full component set + AppShell + 1 placeholder SVG" into one
> 2-3 day chunk. I'd split the *first PR* even smaller so there's a shippable
> win within a single evening session, directly closing the documented
> `BASIC_UI.md` chrome gap:

| Phase | Work | Effort |
|---|---|---|
| *1a. Tonight's slice* | Tokens in `globals.css` + `tailwind.config.ts` (Riverbank palette + radii); `Capy` placeholder SVG (code-drawn) + `CapySays`; AppShell with Navbar/Footer/credit pill/admin-gated link/skip-link; `not-found.tsx`, `error.tsx`, `loading.tsx` using AppShell + Capy | ~2-3 hrs |
| *1b. Foundation rest* | Button/Card/Input(+label)/Badge/Toast(+aria-live)/Modal/Skeleton; ESLint no-raw-hex rule | ~1-2 days |
| *2. Core flows* | Landing conversion to tokens; Dashboard; Upload tracker + consent modal; Deck view; Quiz + Results | ~4–5 days |
| *3. Polish* | Remaining pages (rewards, settings, upgrade, auth); full Capy pose set (real commissioned art); motion; empty states; Night Cram mode; Study Session Timer idea | ~3–4 days |

Rules during migration (mirrors the backend contract rule): *no raw hex, no inline style objects in new/touched code* — tokens and `ui/` components only. Each page converted is a small PR; landing + dashboard first since they're the first impression.

---

## 9. Asset checklist

- [ ] Placeholder `capy-idle.svg` (code-drawn, Phase 1a) — unblocks everything immediately
- [ ] Commission **real (non-AI)** `capy-idle.svg` — **gate: before any public launch or external marketing uses these assets, not just "Phase 3."** Co-founder feedback (2026-06-19) flagged AI-generated mascot art as a real perception risk for a student-facing brand — fine to keep using AI/placeholder art for internal iteration, not fine for what users/marketing actually see at launch.
- [ ] Wordmark lockup: idle Capy head + "Crammable" in Lora 700
- [ ] Favicon + OG image (Capy with flashcard on head, cream bg)
- [ ] Remaining 9 poses (incremental, non-blocking, Phase 3)

---

## 10. Tonight's recommended scope (2026-06-15, ~9:30PM start)

Given the late start, Phase 1a above is realistic for tonight and ships something
real: design tokens, a placeholder Capy + CapySays, AppShell (Navbar/Footer/credit
pill/admin link/skip-link), and the three missing chrome pages (404/error/loading).
This is a self-contained PR, directly resolves a tracked `BASIC_UI.md` P1/P2 item,
and doesn't block on any external asset commissioning. Phase 1b/2/3 continue in
later sessions.
