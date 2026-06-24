import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./load-env";

// Vitest 4 calls globalSetup with the Vitest instance; we only need `provide`.
type GlobalSetupContext = {
  provide: (key: "httpBaseUrl", value: string) => void;
};

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      // Any HTTP response (incl. a redirect from the proxy) means it's up.
      const res = await fetch(baseUrl, { redirect: "manual" });
      if (res.status > 0) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(
    `[http] Next server at ${baseUrl} did not become ready in ${timeoutMs}ms` +
      (lastErr ? ` (last error: ${String(lastErr)})` : ""),
  );
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } catch {
      /* already gone */
    }
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

export default async function ({ provide }: GlobalSetupContext) {
  loadEnv();

  // ── Escape hatch: point at an already-running server (fast local iteration). ──
  const external = process.env.HTTP_TEST_BASE_URL;
  if (external) {
    const baseUrl = external.replace(/\/$/, "");
    await waitForServer(baseUrl, 30_000);
    provide("httpBaseUrl", baseUrl);
    return () => {};
  }

  // ── Optionally build, then start the production server. ──
  if (process.env.HTTP_TEST_AUTOBUILD === "1") {
    execSync(`"${process.execPath}" "${NEXT_BIN}" build`, {
      cwd: ROOT,
      stdio: "inherit",
    });
  }

  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error(
      "[http] No production build found (.next/BUILD_ID missing). Run `npm run build` " +
        "first, set HTTP_TEST_AUTOBUILD=1 to build automatically, or set " +
        "HTTP_TEST_BASE_URL to an already-running server. Note: do NOT run this " +
        "concurrently with `npm run dev` — they share `.next`.",
    );
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  try {
    await waitForServer(baseUrl, 60_000);
  } catch (err) {
    killTree(child);
    throw err;
  }
  if (exited) throw new Error("[http] Next server exited before becoming ready.");

  provide("httpBaseUrl", baseUrl);

  return () => {
    killTree(child);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    httpBaseUrl: string;
  }
}
