import type { DB, Filter } from "@av/db";
import { ci } from "../lib/mongo.js";

/**
 * Relation filters ("returns whose challan's job worker is called …") resolved to ids first, so the main query
 * stays a plain indexed match on its own collection.
 */

/** Ids of challans matching a filter on the job document. */
export async function jobIdsWhere(db: DB, where: Filter): Promise<string[]> {
  return (await db.job.find<{ id: string }>(where, { select: "_id" })).map((j) => j.id);
}

/** Ids of challan design lines matching every condition (e.g. { designId, jobWorkTypeId }). */
export async function itemIdsWhere(db: DB, item: Record<string, unknown>): Promise<string[]> {
  const cond = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).map(([k, v]) => [`items.${k}`, v]));
  const rows = await db.job.aggregate<{ id: string }>([
    { $match: Object.keys(cond).length ? { items: { $elemMatch: Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) } } : {} },
    { $unwind: "$items" },
    { $match: cond },
    { $project: { _id: "$items._id" } },
  ]);
  return rows.map((r) => r.id);
}

/** Ids of job workers whose name contains the search text. */
export async function clientIdsNamed(db: DB, q: string): Promise<string[]> {
  return (await db.client.find<{ id: string }>({ name: ci(q) }, { select: "_id" })).map((c) => c.id);
}

/** Ids of products whose name contains the search text. */
export async function productIdsNamed(db: DB, q: string): Promise<string[]> {
  return (await db.product.find<{ id: string }>({ name: ci(q) }, { select: "_id" })).map((p) => p.id);
}

/** Ids of challans whose number, or job worker's name, contains the search text. */
export async function jobIdsMatching(db: DB, q: string): Promise<string[]> {
  return jobIdsWhere(db, { $or: [{ jobNumber: ci(q) }, { clientId: { $in: await clientIdsNamed(db, q) } }] });
}
