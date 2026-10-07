// Bundles apps/api (with the @av/* workspace packages inlined) into apps/api/dist/index.js, so Hostinger runs plain
// JavaScript instead of starting tsx/esbuild when the app boots. npm packages stay external: they come from the
// self-contained node_modules made by hostinger-node-modules.sh.
// Same guard as that script: runs only on Hostinger's build server (.../hbuilds/...) or with HOSTINGER_BUILD=1.
// Usage (from apps/api): node ../../scripts/hostinger-bundle-api.mjs
import { createRequire } from "node:module";

if (!process.cwd().includes("/hbuilds/") && process.env.HOSTINGER_BUILD !== "1") process.exit(0);

// esbuild isn't a direct dependency of the API; use the copy tsx depends on.
const require = createRequire(createRequire(`${process.cwd()}/package.json`).resolve("tsx/package.json"));
const esbuild = require("esbuild");

await esbuild.build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "external-npm-packages",
      setup(build) {
        // Bare imports other than our own @av/* packages (and node: builtins) are loaded from node_modules at runtime.
        build.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@av/") ? undefined : { path: args.path, external: true }));
      },
    },
  ],
});
