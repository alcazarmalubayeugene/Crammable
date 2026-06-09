import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest runs the data-access layer's unit tests in a Node environment with
 * Supabase mocked. The `@` alias mirrors tsconfig.json's `paths` ("@/*" → src/*)
 * — Vitest does not read tsconfig paths on its own, so it's declared here using
 * an absolute path (fileURLToPath) to avoid relative-alias resolution issues.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
