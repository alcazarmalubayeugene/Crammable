import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

// Supabase origin for connect-src, derived from the public env var (never hardcoded
// — contracts.ts/EnvKeys own the var name). Both https (REST/Auth/Storage) and wss
// (Realtime) are needed. If the var is unset (e.g. some build contexts) we simply
// omit it rather than ship a broken directive.
const supabaseConnectSrc = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { host } = new URL(raw);
    return [`https://${host}`, `wss://${host}`];
  } catch {
    return [];
  }
})();

// Content-Security-Policy — static host-allowlist (no per-request nonce). 'unsafe-inline'
// for script/style is the accepted trade-off: Next injects an inline bootstrap script and
// Next/Tailwind inject inline styles, so a nonce-less policy needs it. This is still a large
// improvement over the previous frame-ancestors-only header.
//
// The client OCR/PDF pipeline pulls assets at runtime, all of which must be allowed or
// extraction breaks silently:
//   - pdf.js worker            → https://unpkg.com          (src/lib/pdf/render-pages-client.ts)
//   - Tesseract.js core/worker → https://cdn.jsdelivr.net   (WASM + blob: worker)
//   - Tesseract language data  → https://tessdata.projectnaptha.com
// Hence 'wasm-unsafe-eval', blob:, worker-src 'self' blob:, and the CDN origins below.
// In dev, React Refresh / HMR use eval(), so 'unsafe-eval' is added for development only.
const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://unpkg.com https://cdn.jsdelivr.net${
    isDev ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  [
    "connect-src 'self'",
    ...supabaseConnectSrc,
    "https://unpkg.com",
    "https://cdn.jsdelivr.net",
    "https://tessdata.projectnaptha.com",
  ].join(" "),
  "upgrade-insecure-requests",
];

// Security response headers applied to every route.
const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework via X-Powered-By (ZAP low-severity finding).
  poweredByHeader: false,
  // Hide the Next.js dev-mode build indicator (the corner badge visible during `next dev`).
  devIndicators: false,
  // pdfjs-dist runs server-side in extract-text-server.ts — keep it out of the
  // server bundle and let Node require() it natively (lower compile + memory).
  // @napi-rs/canvas is only used client-side (render-pages-client), so it does
  // not need to be a server-external package.
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {
    // Pin the workspace root to this project. A stray package-lock.json in the
    // parent folder otherwise makes Next infer the parent dir as the root, which
    // widens module resolution and file watching — extra memory for nothing.
    root: projectRoot,
  },
  experimental: {
    // Don't preload every route's modules into memory at dev-server boot.
    preloadEntriesOnStart: false,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
