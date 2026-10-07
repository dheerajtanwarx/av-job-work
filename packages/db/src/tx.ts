import mongoose from "mongoose";
import { db, type DB } from "./models.js";

/**
 * Runs `fn` in a multi-document transaction (snapshot reads, all-or-nothing writes). Retries on transient errors
 * such as write conflicts, so `fn` must be safe to run more than once. Throwing inside `fn` rolls everything back.
 */
export async function transaction<R>(fn: (tx: DB) => Promise<R>): Promise<R> {
  return (await mongoose.connection.transaction(() => fn(db))) as R;
}

export function inTransaction(): boolean {
  return !!(mongoose as unknown as { transactionAsyncLocalStorage?: { getStore(): { session?: unknown } | undefined } }).transactionAsyncLocalStorage?.getStore()
    ?.session;
}

/**
 * Promise.all for database calls: in parallel normally, one after another inside a transaction (MongoDB does not
 * allow concurrent operations on one transaction's session).
 */
export async function all<T extends readonly unknown[]>(fns: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> {
  if (!inTransaction()) return (await Promise.all(fns.map((f) => f()))) as unknown as T;
  const out: unknown[] = [];
  for (const f of fns) out.push(await f());
  return out as unknown as T;
}

/** A unique index was violated (optionally: on this field). */
export function isDuplicateKey(e: unknown, field?: string): boolean {
  const err = e as { code?: number; keyPattern?: Record<string, unknown> } | null;
  if (err?.code !== 11000) return false;
  return !field || !err.keyPattern || field in err.keyPattern;
}
