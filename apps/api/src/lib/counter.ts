import type { DB } from "@av/db";

/** Atomic sequential document numbers: JOB-001, SB-001, MB-001, RET-001 … */
export async function nextNumber(db: DB, name: string, prefix: string) {
  const row = await db.counter.upsert({
    where: { name },
    create: { name, next: 2 },
    update: { next: { increment: 1 } },
  });
  return `${prefix}-${String(row.next - 1).padStart(3, "0")}`;
}
