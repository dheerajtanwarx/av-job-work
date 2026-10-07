// Plain-JS entry for hosts that need one (e.g. Hostinger): registers tsx, then loads the TS app.
// No top-level await: Hostinger's LiteSpeed runner loads this file with require().
import { register } from "tsx/esm/api";

process.env.NODE_ENV ??= "production";
register();
import("./src/index.ts").catch((err) => {
  console.error(err);
  process.exit(1);
});
