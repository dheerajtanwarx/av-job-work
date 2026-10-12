import path from "node:path";
import type { NextConfig } from "next";

const apiUrl = (process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@av/shared"],
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  experimental: {
    // Because proxy.ts exists, Next buffers every request body and passes only the first 10 MB on to the /api rewrite.
    // A bigger photo upload then reaches Express cut short and hangs until the host returns 503. Allow a full batch
    // (10 photos × 15 MB, plus multipart overhead).
    proxyClientMaxBodySize: "160mb",
    // The rewrite proxy gives up after 30 s by default; processing and storing a batch of photos can take longer.
    proxyTimeout: 180_000,
  },
  // The browser talks to /api/*; Next forwards it to Express so auth cookies stay same-origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
