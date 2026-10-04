import path from "node:path";
import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;

const nextConfig: NextConfig = {
  transpilePackages: ["@av/shared"],
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  // The browser talks to /api/*; Next forwards it to Express so auth cookies stay same-origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
