This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Project documentation

- [`WORK_SUMMARY_2026-06-10.md`](./WORK_SUMMARY_2026-06-10.md) — session log: audit fixes, the referral/quiz DB migration, and the env-config fix.
- [`CODE_AUDIT.txt`](./CODE_AUDIT.txt) — code audit (correctness, redundancy, optimization).
- [`SECURITY_AUDIT.txt`](./SECURITY_AUDIT.txt) — security audit (auth, RLS, CSRF, fraud, privacy).
- [`docs/MISSING_FEATURES.md`](./docs/MISSING_FEATURES.md) — feature gap analysis (most items now ✅ as of 2026-06-11; see the status banner).
- [`docs/BASIC_UI.md`](./docs/BASIC_UI.md) — UI inventory & gap list (the one open product gap: delete-deck UI).
- [`CLAUDE.md`](./CLAUDE.md) / [`AGENTS.md`](./AGENTS.md) — backend rules and conventions.
- [`docs/PROJECT-DOCUMENTATION.md`](./docs/PROJECT-DOCUMENTATION.md) · [`docs/TODO.md`](./docs/TODO.md)

## Testing

```bash
npm test          # 75 unit tests (Vitest, Supabase mocked, offline)
npm run test:int  # 10 integration tests against the live Supabase project
npm run typecheck # tsc --noEmit
npm run lint      # eslint
```

`npm run test:int` requires `.env.local` (Supabase URL + anon + service-role keys); it
creates and deletes throwaway users on the real project and verifies RLS, the privilege
triggers, the privileged-RPC lockdown, and the atomic credit charge. See
[`docs/PROJECT-DOCUMENTATION.md §5`](./docs/PROJECT-DOCUMENTATION.md) for what it covers
(and the HTTP-level route-test gap).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
