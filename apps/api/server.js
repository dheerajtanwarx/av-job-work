// Plain-JS entry for hosts that need one (e.g. Hostinger): registers tsx, then loads the TS app.
import { register } from "tsx/esm/api";

process.env.NODE_ENV ??= "production";
register();
await import("./src/index.ts");
