import mongoose from "mongoose";

// Fail loudly on a filter that names a field the schema doesn't have, instead of silently matching everything.
mongoose.set("strictQuery", "throw");
// Every operation inside transaction() joins its session without passing it around.
mongoose.set("transactionAsyncLocalStorage", true);
// Indexes are built by `pnpm db:indexes` (syncIndexes), never implicitly at startup.
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);

const g = globalThis as unknown as { avDbConnecting?: Promise<typeof mongoose> };

/**
 * Opens the process-wide connection pool once (also across `tsx watch` reloads). Await it before serving requests.
 * Pool settings follow MongoDB's driver guidance: one client per process, a small warm pool so requests don't pay
 * the TLS handshake after idle, and fast failure when the cluster can't be reached.
 */
export function connectDb(uri = process.env.MONGODB_URI): Promise<typeof mongoose> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  g.avDbConnecting ??= mongoose
    .connect(uri, {
      appName: "av-erp",
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 20),
      minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE ?? 2),
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
      compressors: ["zlib"],
      // A filter field set to undefined is left out (not matched against null), so optional query parameters can be passed straight through.
      ignoreUndefined: true,
      retryWrites: true,
      retryReads: true,
      w: "majority",
    })
    .catch((e) => {
      g.avDbConnecting = undefined;
      throw e;
    });
  return g.avDbConnecting;
}

export async function disconnectDb() {
  g.avDbConnecting = undefined;
  await mongoose.disconnect();
}
