import { connectDb, disconnectDb } from "@av/db";
import { createApp } from "./app.js";
import { env } from "./env.js";

// One connection pool for the whole process, opened before the first request is served.
await connectDb();

const server = createApp().listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  });
}
