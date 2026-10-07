import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
process.env.NODE_ENV = "test";

const { connectDb } = await import("@av/db");
await connectDb();

// One connection per test file, closed when the file is done.
const { afterAll } = await import("vitest");
afterAll(async () => {
  const { disconnectDb } = await import("@av/db");
  await disconnectDb();
});
