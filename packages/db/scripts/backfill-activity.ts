import { connectDb, db, disconnectDb } from "../src/index.js";

/**
 * Fills `jobId` / `clientId` on audit entries written before activity folders existed (same rules as `auditOwner`).
 * Only touches entries that don't have the fields yet, so it is safe to run again.
 */
async function backfill() {
  const pending = await db.auditLog.find<{ id: string; entity: string; entityId: string; after: unknown }>(
    { clientId: { $exists: false } },
    { select: "entity entityId after" },
  );
  if (!pending.length) return console.log("auditLogs: nothing to backfill");

  const pairs = async (c: { find: typeof db.return.find }, field: string) =>
    new Map((await c.find<Record<string, string>>({}, { select: field })).map((r) => [r.id, r[field]!]));
  const [jobClient, returnJob, dispatchJob, subBillJob] = await Promise.all([
    pairs(db.job, "clientId"),
    pairs(db.return, "jobId"),
    pairs(db.dispatch, "jobId"),
    pairs(db.subBill, "jobId"),
  ]);
  const viaJob = (jobId: string | undefined) => ({ jobId: jobId ?? null, clientId: (jobId && jobClient.get(jobId)) || null });
  const ownerOf = (r: (typeof pending)[number]) => {
    switch (r.entity) {
      case "Client":
        return { jobId: null, clientId: r.entityId };
      case "Job":
        return viaJob(r.entityId);
      case "Return":
        return viaJob(returnJob.get(r.entityId));
      case "Dispatch":
        return viaJob(dispatchJob.get(r.entityId));
      case "SubBill":
        return viaJob(subBillJob.get(r.entityId));
      case "ReturnPhoto":
        return viaJob((r.after as { jobId?: string } | null)?.jobId);
      default:
        return { jobId: null, clientId: null };
    }
  };

  const ops = pending.map((r) => ({ updateOne: { filter: { _id: r.id }, update: { $set: ownerOf(r) } } }));
  for (let i = 0; i < ops.length; i += 1000) await db.auditLog.model.bulkWrite(ops.slice(i, i + 1000));
  const linked = pending.filter((r) => ownerOf(r).clientId).length;
  console.log(`auditLogs: ${pending.length} entries backfilled (${linked} linked to a job worker)`);
}

connectDb()
  .then(backfill)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
