// Plain-JS entry for hosts that need one (e.g. Hostinger).
// Runs the prebuilt bundle (dist/index.js, made by scripts/hostinger-bundle-api.mjs) when present, so no TypeScript
// compiler process has to start at runtime; otherwise falls back to tsx and the TS sources.
// No top-level await: Hostinger's LiteSpeed runner loads this file with require().
// Startup messages go to stderr: Hostinger's runtime log only shows that stream.
import { existsSync } from "node:fs";

process.env.NODE_ENV ??= "production";
// Hostinger counts every thread against the plan's "Max processes" limit (120, shared by all sites), and LiteSpeed runs
// several API instances. libuv's pool (default 4 threads per instance, also used by sharp) is started lazily, so
// shrinking it here, before anything uses it, keeps a photo upload from tipping the plan over and getting killed.
process.env.UV_THREADPOOL_SIZE ??= "2";
const bundle = new URL("./dist/index.js", import.meta.url);
console.error(existsSync(bundle) ? "Starting API from dist/index.js" : "Starting API from src/index.ts (tsx)");

const start = existsSync(bundle)
  ? import(bundle.href)
  : import("tsx/esm/api").then(({ register }) => {
      register();
      return import("./src/index.ts");
    });
start.catch((err) => {
  console.error(err);
  process.exit(1);
});
