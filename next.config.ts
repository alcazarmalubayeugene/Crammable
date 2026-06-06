import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project. A stray package-lock.json in the
    // parent folder otherwise makes Next infer the parent dir as the root, which
    // widens module resolution and file watching — extra memory for nothing.
    root: projectRoot,
  },
  // pdfjs-dist runs server-side in extract-text-server.ts — keep it out of the
  // server bundle and let Node require() it natively (lower compile + memory).
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // Don't preload every route's modules into memory at dev-server boot.
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
