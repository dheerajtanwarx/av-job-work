import type { DB } from "@av/db";

/** Atomic sequential document numbers: JW-0001, SB-001, MB-001, RET-001, WK-0001 … */
export async function nextNumber(db: DB, name: string, prefix: string, pad = 3) {
  const row = await db.counter.upsert({
    where: { name },
    create: { name, next: 2 },
    update: { next: { increment: 1 } },
  });
  return `${prefix}-${String(row.next - 1).padStart(pad, "0")}`;
}
