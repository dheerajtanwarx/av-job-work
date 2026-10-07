import { connectDb, disconnectDb } from "@av/db";
import { createApp } from "./app.js";
import { env } from "./env.js";

// Listen first so hosts that wait for the port (Hostinger's LiteSpeed) see the app come up; queries issued while the
// pool is still opening are buffered by Mongoose until it connects. Startup messages go to stderr, the only stream
// Hostinger's runtime log shows.
const server = createApp().listen(env.port, () => {
  console.error(`API listening on http://localhost:${env.port}`);
});

console.error("Connecting to MongoDB…");
connectDb().then(
  () => console.error("MongoDB connected"),
  (err) => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  });
}
