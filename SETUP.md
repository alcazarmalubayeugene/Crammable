# Crammable — Local Setup

Get the app running locally. **If you copied the repo and saw a black screen with
just text and no styling, you skipped a step below — read the Troubleshooting
section.**

## Prerequisites

- **Node.js 20.9+** (required by Next.js 16.2) and npm
- A Supabase project + DeepSeek API key (ask a maintainer for the values)

## Steps

```bash
# 1. Clone
git clone https://github.com/alcazarmalubayeugene/Crammable.git
cd Crammable

# 2. Install dependencies  ← DO NOT SKIP. This is what compiles the CSS.
npm install

# 3. Create your local env file from the template
cp .env.example .env.local
#    then open .env.local and fill in the real values
#    (request them securely from a maintainer — they are NOT in the repo)

# 4. Run
npm run dev
#    open http://localhost:3000
```

## Required environment variables

These live in `.env.local` (gitignored — never committed). See `.env.example`
for the template. Key names mirror `EnvKeys` in `contracts.ts`.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public — Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public — Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — never expose to the client |
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` |
| `DEEPSEEK_API_KEY` | **Server only** |
| `DEEPSEEK_MODEL` | **Server only** — model id |

## Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build (must pass before deploy) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest, Supabase mocked, offline) |
| `npm run test:int` | Integration tests vs the live project (needs `.env.local`) |
| `npm run test:http` | HTTP route-test suite |

## Troubleshooting

### Black screen / unstyled text / "no elements, just text"

This means **Tailwind CSS never compiled** — the HTML rendered without styles.
On a fresh copy it's almost always one of:

1. **You didn't run `npm install`.** Without `node_modules`, the
   `@tailwindcss/postcss` plugin isn't present, so no CSS is generated. Run
   `npm install`.
2. **`.env.local` is missing.** The app fails to initialize Supabase at boot
   and errors before rendering. Create `.env.local` from `.env.example`.

Fix:

```bash
npm install
# make sure .env.local exists and is filled in
rm -rf .next        # clear any stale build cache
npm run dev
```

You should now see the styled app (cream/brown light theme).
