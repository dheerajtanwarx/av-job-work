import path from "node:path";
import { config } from "dotenv";

/** Builds every collection and index in the test database once per run. */
export default async function setup() {
  config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
  const url = process.env.TEST_MONGODB_URI;
  if (!url) throw new Error("TEST_MONGODB_URI is not set");
  const { connectDb, disconnectDb, syncIndexes } = await import("@av/db");
  const conn = await connectDb(url);
  // Every suite wipes its database: never let that be anything but a test database.
  if (!conn.connection.name.endsWith("_test")) throw new Error(`TEST_MONGODB_URI must name a database ending in "_test" (got "${conn.connection.name}")`);
  await syncIndexes();
  await disconnectDb();
}
