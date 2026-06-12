import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vitest does not read `.env.local` (that's a Next.js convenience). Load it here
 * so the integration suites can build real Supabase clients. Existing process
 * env wins, so CI can inject the same vars without a file.
 */
const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const envPath = path.join(root, ".env.local");

if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(
    `[integration] Missing required env var(s): ${missing.join(", ")}. ` +
      `Add them to .env.local (or the environment) before running npm run test:int.`,
  );
}
