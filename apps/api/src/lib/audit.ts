import type { DB } from "@av/db";

export async function audit(
  db: DB,
  e: { entity: string; entityId: string; action: string; summary?: string; before?: unknown; after?: unknown; userId?: string | null },
) {
  await db.auditLog.create({
    data: {
      entity: e.entity,
      entityId: e.entityId,
      action: e.action,
      summary: e.summary,
      before: e.before === undefined ? undefined : JSON.parse(JSON.stringify(e.before)),
      after: e.after === undefined ? undefined : JSON.parse(JSON.stringify(e.after)),
      userId: e.userId ?? null,
    },
  });
}
