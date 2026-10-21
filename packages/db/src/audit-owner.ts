import type { DB } from "./models.js";

export interface AuditOwner {
  jobId: string | null;
  clientId: string | null;
}

/**
 * The challan and job worker an audit entry belongs to, worked out from what it is about
 * (a return, voucher or material issue belongs to its challan's job worker). Null for anything else.
 */
export async function auditOwner(db: DB, entity: string, entityId: string, after?: unknown): Promise<AuditOwner> {
  const viaJob = async (jobId: string | null | undefined): Promise<AuditOwner> => {
    if (!jobId) return { jobId: null, clientId: null };
    const job = await db.job.findById<{ clientId: string }>(jobId, { select: "clientId" });
    return { jobId, clientId: job?.clientId ?? null };
  };
  const jobOf = async (row: Promise<{ jobId: string } | null>) => viaJob((await row)?.jobId);
  const select = "jobId";

  switch (entity) {
    case "Client":
      return { jobId: null, clientId: entityId };
    case "Job":
      return viaJob(entityId);
    case "Return":
      return jobOf(db.return.findById(entityId, { select }));
    case "Dispatch":
      return jobOf(db.dispatch.findById(entityId, { select }));
    case "SubBill":
      return jobOf(db.subBill.findById(entityId, { select }));
    case "ReturnPhoto":
      return viaJob((after as { jobId?: string } | null)?.jobId);
    default:
      return { jobId: null, clientId: null };
  }
}
