import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * HTTP-level route tests — boots the REAL Next server (production build) and
 * drives the route handlers over HTTP with authenticated cookie sessions, so
 * the full stack runs: `src/proxy.ts` (middleware), the CSRF origin check, and
 * the route-layer ownership guards that RLS alone does NOT enforce (e.g. the
 * IDOR fix — the flashcards WITH CHECK only validates user_id = auth.uid()).
 *
 *   npm run test:http
 *
 * Like `npm run test:int`, this hits the REAL Supabase project named in
 * `.env.local` and creates/deletes its own throwaway users — never touching
 * real data. Kept separate from `vitest.config.ts` so `npm test` stays fast and
 * offline.
 *
 * Server lifecycle (tests/http/global-server.ts):
 *   - HTTP_TEST_BASE_URL set      → use that already-running server (no spawn).
 *   - HTTP_TEST_AUTOBUILD=1        → run `next build` first, then `next start`.
 *   - otherwise                    → `next start` against the existing prod build
 *                                    (run `npm run build` first; errors clearly
 *                                    if no build exists).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/http/**/*.http.test.ts"],
    globalSetup: ["tests/http/global-server.ts"],
    setupFiles: ["tests/http/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // One shared live DB + one server — never run files in parallel.
    fileParallelism: false,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
