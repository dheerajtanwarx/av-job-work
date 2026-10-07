// Plain-JS entry for hosts that need one (e.g. Hostinger).
// Runs the prebuilt bundle (dist/index.js, made by scripts/hostinger-bundle-api.mjs) when present, so no TypeScript
// compiler process has to start at runtime; otherwise falls back to tsx and the TS sources.
// No top-level await: Hostinger's LiteSpeed runner loads this file with require().
import { existsSync } from "node:fs";

process.env.NODE_ENV ??= "production";
const bundle = new URL("./dist/index.js", import.meta.url);
console.log(existsSync(bundle) ? "Starting API from dist/index.js" : "Starting API from src/index.ts (tsx)");

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
