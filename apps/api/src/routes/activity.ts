import { db, type AuditLog, type Filter } from "@av/db";
import { ACTIVITY_FOLDERS, type ActivityFolders, type ActivityRow } from "@av/shared";
import { Router } from "express";
import { userNames } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { str } from "../lib/http.js";
import { OWNER_ONLY, requireRole } from "../middleware/auth.js";

/** Activity monitor: everything anyone did, in folders by record type or by job worker. Owner only. */
export const activityRouter = Router();
activityRouter.use(requireRole(...OWNER_ONLY));

const ENTITY_LABEL: Record<string, string> = {
  SubBill: "Payment voucher",
  Job: "Challan",
  Return: "Return",
  Dispatch: "Material issue",
  Client: "Job worker",
  Product: "Product",
  Design: "Design",
  JobWorkType: "Job work type",
  Material: "Material",
  StockMovement: "Stock entry",
  Settings: "Settings",
  User: "User",
  ReturnPhoto: "Photo",
  JobItemPhoto: "Photo",
};

function hrefFor(r: AuditLog): string | null {
  const after = r.after as { materialId?: string; returnId?: string } | null;
  switch (r.entity) {
    case "SubBill":
      return `/bills/sub/${r.entityId}`;
    case "Job":
      return `/jobs/${r.entityId}`;
    case "Dispatch":
      return r.jobId ? `/jobs/${r.jobId}` : null;
    case "Return":
      return `/returns/${r.entityId}`;
    case "ReturnPhoto":
      return after?.returnId ? `/returns/${after.returnId}` : null;
    case "Client":
      return `/clients/${r.entityId}`;
    case "Material":
      return `/materials/${r.entityId}`;
    case "StockMovement":
      return after?.materialId ? `/materials/${after.materialId}` : null;
    case "Product":
      return "/products";
    case "Design":
      return "/designs";
    case "JobWorkType":
      return "/job-work-types";
    case "Settings":
      return "/settings";
    case "User":
      return "/settings?tab=users";
    default:
      return null;
  }
}

/** `from` / `to` (YYYY-MM-DD, both inclusive) as a createdAt filter. */
function period(from?: string, to?: string) {
  return from || to ? { ...(from && { $gte: toDate(from) }), ...(to && { $lt: new Date(toDate(to).getTime() + 86400000) }) } : undefined;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Counts for every folder: by record type, and one per job worker (most recently active first). */
activityRouter.get("/activity/folders", async (req, res) => {
  const createdAt = period(str(req.query.from), str(req.query.to));
  const match = createdAt ? { createdAt } : {};
  const group = { count: { $sum: 1 }, lastAt: { $max: "$createdAt" } };
  const [byEntity, byWorker] = await Promise.all([
    db.auditLog.aggregate<{ id: string; count: number; lastAt: Date }>([{ $match: match }, { $group: { _id: "$entity", ...group } }]),
    db.auditLog.aggregate<{ id: string; count: number; lastAt: Date }>([
      { $match: { ...match, clientId: { $type: "string" } } },
      { $group: { _id: "$clientId", ...group } },
      { $sort: { lastAt: -1 } },
    ]),
  ]);
  const clients = new Map(
    (await db.client.find<{ id: string; name: string; workerCode: string }>({ _id: { $in: byWorker.map((w) => w.id) } }, { select: "name workerCode" })).map((c) => [c.id, c]),
  );

  const out: ActivityFolders = {
    total: byEntity.reduce((s, e) => s + e.count, 0),
    types: ACTIVITY_FOLDERS.map((f) => {
      const hits = byEntity.filter((e) => (f.entities as readonly string[]).includes(e.id));
      const lastAt = hits.reduce<Date | null>((m, e) => (!m || e.lastAt > m ? e.lastAt : m), null);
      return { key: f.key, label: f.label, count: hits.reduce((s, e) => s + e.count, 0), lastAt: lastAt?.toISOString() ?? null };
    }),
    workers: byWorker.map((w) => ({
      clientId: w.id,
      name: clients.get(w.id)?.name ?? "Unknown job worker",
      code: clients.get(w.id)?.workerCode ?? null,
      count: w.count,
      lastAt: w.lastAt.toISOString(),
    })),
  };
  res.json(out);
});

/** One folder's entries (or everything), newest first. */
activityRouter.get("/activity", async (req, res) => {
  const take = Math.min(200, Math.max(1, Number(str(req.query.take)) || 100));
  const skip = Math.max(0, Number(str(req.query.skip)) || 0);
  const folder = ACTIVITY_FOLDERS.find((f) => f.key === str(req.query.folder));
  const kind = str(req.query.kind); // "edits" = changes and voids only
  const q = str(req.query.q);
  const where: Filter = {
    entity: folder ? { $in: folder.entities } : str(req.query.entity),
    clientId: str(req.query.clientId),
    jobId: str(req.query.jobId),
    userId: str(req.query.userId),
    action: kind === "edits" ? { $in: ["update", "void", "cancel", "exception"] } : undefined,
    createdAt: period(str(req.query.from), str(req.query.to)),
    summary: q ? { $regex: escapeRegex(q), $options: "i" } : undefined,
  };
  const rows = await db.auditLog.find(where, { sort: { createdAt: -1, _id: -1 }, limit: take + 1, skip });
  const more = rows.length > take;
  const page = rows.slice(0, take);

  // An edit to a return or payment is also written on its challan, with the same summary plus the reason.
  // Show it once, on the record itself.
  const shown = page.filter(
    (r) =>
      !(
        r.entity === "Job" &&
        r.summary &&
        page.some((o) => o !== r && o.entity !== "Job" && o.userId === r.userId && o.summary && r.summary!.startsWith(o.summary) && Math.abs(o.createdAt.getTime() - r.createdAt.getTime()) < 5000)
      ),
  );

  const ids = (k: "clientId" | "jobId") => [...new Set(shown.map((r) => r[k]).filter((x): x is string => !!x))];
  const [names, clients, jobs] = await Promise.all([
    userNames(db, shown.map((r) => r.userId)),
    db.client.find<{ id: string; name: string }>({ _id: { $in: ids("clientId") } }, { select: "name" }),
    db.job.find<{ id: string; jobNumber: string }>({ _id: { $in: ids("jobId") } }, { select: "jobNumber" }),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const jobNumber = new Map(jobs.map((j) => [j.id, j.jobNumber]));

  const out: ActivityRow[] = shown.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    entity: r.entity,
    entityLabel: ENTITY_LABEL[r.entity] ?? r.entity,
    action: r.action,
    summary: r.summary,
    reason: r.reason,
    user: r.userId ? (names.get(r.userId) ?? null) : null,
    href: hrefFor(r),
    worker: r.clientId ? { id: r.clientId, name: clientName.get(r.clientId) ?? "Unknown job worker" } : null,
    jobNumber: r.jobId ? (jobNumber.get(r.jobId) ?? null) : null,
  }));
  res.json({ rows: out, more });
});
