import type { DB } from "@av/db";
import type { EditMark } from "@av/shared";

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

// ───────── "Edited by …" marks ─────────

/** Columns to write with any hand edit of a record (never with automatic status updates). */
export const editedBy = (userId: string | null | undefined) => ({ editedAt: new Date(), editedById: userId ?? null });

type EditCols = { editedAt: Date | null; editedById: string | null };

export function editMark(r: EditCols, names: Map<string, string>): EditMark | null {
  return r.editedAt ? { at: r.editedAt.toISOString(), by: r.editedById ? (names.get(r.editedById) ?? null) : null } : null;
}

/** Swaps the raw edit columns for `edited: { at, by }` with the editor's name. */
export async function withEdited<T extends EditCols>(db: DB, rows: T[]): Promise<(Omit<T, keyof EditCols> & { edited: EditMark | null })[]> {
  const names = await userNames(db, rows.map((r) => r.editedById));
  return rows.map(({ editedAt, editedById, ...r }) => ({ ...r, edited: editMark({ editedAt, editedById }, names) }));
}
