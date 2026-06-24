import { loadEnv } from "./load-env";

// Runs in each test worker (pool: forks) — globalSetup runs in the main process,
// so the workers need their own env load to build Supabase clients / cookies.
loadEnv();
