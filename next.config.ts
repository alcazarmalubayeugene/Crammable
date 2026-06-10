import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Security response headers applied to every route. A full script/style CSP needs
// per-request nonces to coexist with Next's injected inline bootstrap, so we ship
// the safe, non-breaking subset here (clickjacking, MIME-sniffing, referrer leak,
// powerful-feature lockdown). frame-ancestors 'none' protects the payment + admin
// pages without affecting script/style/connect loading.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
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
