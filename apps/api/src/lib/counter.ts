import type { DB } from "@av/db";

/** Atomic sequential document numbers: JW-0001, SB-001, MB-001, RET-001, WK-0001 … */
export async function nextNumber(db: DB, name: string, prefix: string, pad = 3) {
  // Inside a transaction, two callers bumping the same counter conflict and one retries, so numbers stay unique and gap-free.
  const row = (await db.counter.update({ _id: name }, { $inc: { seq: 1 } }, { upsert: true }))!;
  return `${prefix}-${String(row.seq).padStart(pad, "0")}`;
}
