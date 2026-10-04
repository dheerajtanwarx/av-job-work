import type { DB } from "@av/db";

export async function audit(
  db: DB,
  e: { entity: string; entityId: string; action: string; summary?: string; reason?: string | null; before?: unknown; after?: unknown; userId?: string | null },
) {
  await db.auditLog.create({
    data: {
      entity: e.entity,
      entityId: e.entityId,
      action: e.action,
      summary: e.summary,
      reason: e.reason ?? null,
      before: e.before === undefined ? undefined : JSON.parse(JSON.stringify(e.before)),
      after: e.after === undefined ? undefined : JSON.parse(JSON.stringify(e.after)),
      userId: e.userId ?? null,
    },
  });
}

/** Names for user ids (audit "entered by"). */
export async function userNames(db: DB, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}
