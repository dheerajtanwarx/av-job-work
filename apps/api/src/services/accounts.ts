import { all as inTurn, db, type Filter, type SubBill } from "@av/db";
import {
  buildLedger,
  dayOf,
  diffDays,
  formatINR,
  formatQty,
  moneyPosition,
  roundQty,
  sumTotals,
  workerMetrics,
  type Ledger,
  type LedgerRow,
  type MoneyPosition,
  type Unit,
  type WorkerMaterialRow,
  type WorkerPerformance,
} from "@av/shared";
import { today } from "../lib/dates.js";
import { notFound } from "../lib/http.js";
import { loadJob, loadJobs, summarizeJobItems, toJobRow } from "./jobs.js";
import { jobIdsWhere } from "./lookups.js";
import { loadReturnRows } from "./return-rows.js";

/**
 * Running ledgers. Debit = job work value payable to the worker (each non-voided return, at its own rates),
 * Credit = payment made (each non-voided voucher). Balance = still payable (negative = advance).
 */
async function ledgerFor(jobWhere: Filter, range: { from?: string; to?: string }): Promise<Ledger> {
  const now = today();
  const jobIds = await jobIdsWhere(db, jobWhere);
  const [returns, vouchers] = await inTurn([
    () => loadReturnRows(db, { jobId: { $in: jobIds }, voidedAt: null }, now),
    () =>
      db.subBill.find<SubBill & { job: { id: string; jobNumber: string }; return?: { returnNumber: string } | null }>(
        { jobId: { $in: jobIds }, voidedAt: null },
        { populate: [{ path: "job", select: "jobNumber" }, { path: "return", select: "returnNumber" }] },
      ),
  ]);
  type Entry = Omit<LedgerRow, "balancePaise">;
  const entries: Entry[] = [
    ...returns.map(
      (r): Entry => ({
        date: r.date,
        at: r.receivedAt,
        type: "work",
        ref: r.returnNumber,
        href: `/returns/${r.id}`,
        job: r.job,
        particular: `Job work received – ${r.designs.join(", ")} · ${formatQty(r.total)} ${r.unit}${r.ratePaise !== null ? ` @ ${formatINR(r.ratePaise)}` : ""}`,
        debitPaise: r.valuePaise,
        creditPaise: 0,
      }),
    ),
    ...vouchers.map(
      (v): Entry => ({
        date: v.date.toISOString(),
        at: v.createdAt.toISOString(),
        type: "payment",
        ref: v.billNumber,
        href: `/bills/sub/${v.id}`,
        job: { id: v.job.id, jobNumber: v.job.jobNumber },
        particular: `Payment ${v.method.toLowerCase()}${v.reference ? ` (${v.reference})` : ""}${v.return ? ` for ${v.return.returnNumber}` : ""}${v.advanceReason ? " – advance" : ""}`,
        debitPaise: 0,
        creditPaise: v.amountPaise,
      }),
    ),
  ];
  const all = buildLedger(entries);
  const inRange = (d: string) => (!range.from || dayOf(d) >= range.from) && (!range.to || dayOf(d) <= range.to);
  const before = all.filter((e) => range.from && dayOf(e.date) < range.from);
  const openingPaise = before.length ? before[before.length - 1].balancePaise : 0;
  const rows = all.filter((e) => inRange(e.date));
  const debitPaise = rows.reduce((s, r) => s + r.debitPaise, 0);
  const creditPaise = rows.reduce((s, r) => s + r.creditPaise, 0);
  return { openingPaise, rows, totals: { debitPaise, creditPaise, closingPaise: openingPaise + debitPaise - creditPaise } };
}

export async function workerLedger(clientId: string, range: { from?: string; to?: string } = {}) {
  if (!(await db.client.exists({ _id: clientId }))) throw notFound("Job worker");
  return ledgerFor({ clientId }, range);
}

export interface ChallanLedger extends Ledger {
  /** Value of the work issued at challan rates (ordered qty × challan rate). */
  issuedValuePaise: number;
  money: MoneyPosition;
}

export async function challanLedger(jobId: string): Promise<ChallanLedger> {
  const job = await loadJob(db, jobId);
  const totals = sumTotals(summarizeJobItems(job));
  const ledger = await ledgerFor({ _id: jobId }, {});
  return { ...ledger, issuedValuePaise: totals.expectedValuePaise, money: moneyPosition(totals.completedValuePaise, job.agg.paidPaise) };
}

/** What each material this worker has received looks like now. Lines without a material are grouped by unit. */
export async function workerMaterial(clientId: string): Promise<WorkerMaterialRow[]> {
  const now = today();
  const jobs = await loadJobs(db, { clientId, status: { $ne: "CANCELLED" } });
  const rows = new Map<string, WorkerMaterialRow & { jobIds: Set<string> }>();
  for (const j of jobs) {
    for (const it of summarizeJobItems(j)) {
      if (it.sent === 0) continue;
      const key = it.material?.id ?? `none:${it.unit}`;
      const r =
        rows.get(key) ??
        {
          materialId: it.material?.id ?? null,
          materialName: it.material?.name ?? `No material linked (${it.unit})`,
          unit: it.unit as Unit,
          issued: 0, returned: 0, damaged: 0, rejected: 0, lost: 0, pending: 0,
          challans: 0, oldestIssueDate: null, daysOutside: 0, valuePaise: 0, jobIds: new Set<string>(),
        };
      r.issued = roundQty(r.issued + it.sent);
      r.returned = roundQty(r.returned + it.ok);
      r.damaged = roundQty(r.damaged + it.damaged);
      r.rejected = roundQty(r.rejected + it.rejected);
      r.lost = roundQty(r.lost + it.lost);
      r.pending = roundQty(r.pending + it.pending);
      r.valuePaise += it.pendingValuePaise;
      if (it.pending > 0) {
        r.jobIds.add(j.id);
        const d = dayOf(j.jobDate);
        if (!r.oldestIssueDate || d < r.oldestIssueDate) r.oldestIssueDate = d;
      }
      rows.set(key, r);
    }
  }
  return [...rows.values()]
    .map(({ jobIds, ...r }) => ({ ...r, challans: jobIds.size, daysOutside: r.oldestIssueDate ? Math.max(0, diffDays(now, r.oldestIssueDate)) : 0 }))
    .sort((a, b) => b.pending - a.pending);
}

export async function workerPerformance(clientId: string): Promise<WorkerPerformance> {
  const now = today();
  const jobs = await loadJobs(db, { clientId });
  let work = 0;
  let paid = 0;
  const perf = jobs.map((j) => {
    const items = summarizeJobItems(j);
    const t = sumTotals(items);
    const row = toJobRow(j, items, now);
    work += t.completedValuePaise;
    paid += j.agg.paidPaise;
    return {
      jobDate: dayOf(j.jobDate),
      status: row.status,
      overdue: row.overdue,
      firstReturnDate: j.agg.firstReturnDate,
      lastReturnDate: j.agg.lastReturnDate,
      initialSent: items.reduce((s, i) => s + i.initialSent + i.additionalSent, 0),
      reworkSent: items.reduce((s, i) => s + i.reworkSent, 0),
      ok: t.ok,
      damaged: t.damaged,
      rejected: t.rejected,
      lost: t.lost,
      pending: t.pending,
    };
  });
  return { ...workerMetrics(perf), totalWorkPaise: work, totalPaidPaise: paid, outstandingPaise: Math.max(0, work - paid) };
}
