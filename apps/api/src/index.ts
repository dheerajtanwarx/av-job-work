import { connectDb, disconnectDb } from "@av/db";
import { createApp } from "./app.js";
import { env } from "./env.js";

// Listen first so hosts that wait for the port (Hostinger's LiteSpeed) see the app come up; queries issued while the
// pool is still opening are buffered by Mongoose until it connects. Startup messages go to stderr, the only stream
// Hostinger's runtime log shows.
// Which port/socket settings the host passed in (names only, plus the port values), to see where it expects us.
const hostKeys = Object.keys(process.env).filter((k) => /PORT|SOCK|LSNODE|LSAPI|PASSENGER/i.test(k));
console.error(`Host settings: PORT=${process.env.PORT ?? "(unset)"} API_PORT=${process.env.API_PORT ?? "(unset)"} keys=[${hostKeys.join(", ")}]`);

const server = createApp().listen(env.port, () => {
  console.error(`API listening on`, server.address());
});

// Log the first requests that reach the app, to tell "the host never forwards to us" apart from "we answer badly".
let logged = 0;
server.prependListener("request", (req) => {
  if (logged++ < 20) console.error(`Request: ${req.method} ${req.url}`);
});
process.on("exit", (code) => console.error(`API process exiting (code ${code})`));

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
    console.error(`Received ${signal}, shutting down`);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  });
}
