import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration config — runs the suites in `tests/integration/**` against the
 * REAL Supabase project named in `.env.local` (no mocks). Kept separate from
 * `vitest.config.ts` (mocked unit tests) so `npm test` stays fast and offline.
 *
 *   npm run test:int
 *
 * Requires `.env.local` with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.
 * Each suite creates throwaway auth users and deletes them in afterAll.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One shared live DB — never run integration files in parallel.
    fileParallelism: false,
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
