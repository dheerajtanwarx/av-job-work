// Plain-JS entry for hosts that need one (e.g. Hostinger): serves the built app (run `next build` first).
// No top-level await: Hostinger's LiteSpeed runner loads this file with require().
import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
const app = next({ dev: false, dir: import.meta.dirname });

app
  .prepare()
  .then(() => {
    const handle = app.getRequestHandler();
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`Web listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
