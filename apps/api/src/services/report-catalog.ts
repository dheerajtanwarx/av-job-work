import { prisma, type Prisma } from "@av/db";
import {
  agingBucket,
  AGING_BUCKETS,
  diffDays,
  formatINR,
  HOLDING_STATUS_LABEL,
  JOB_STATUS_LABEL,
  meanOf,
  PAYMENT_AGING_BUCKETS,
  PAYMENT_AGING_LABEL,
  paymentAgingBucket,
  percent,
  REPORTS,
  roundQty,
  type JobStatus,
  type ReportColumn,
  type ReportResult,
  type ReportRow,
  type ReportSummaryItem,
} from "@av/shared";
import type { TableColumn, TableTotals } from "../lib/csv.js";
import { HttpError, notFound } from "../lib/http.js";
import { challanLedger, workerLedger } from "./accounts.js";
import { challansOutside, completionRows, jobMoney, materialHolders, returnLines, workerMaterialPositions, workGrouped, type Filters, type Page } from "./analytics.js";
import { materialRows } from "./materials.js";
import { photoInclude, toPhotoViews } from "./photo-views.js";
import { unpaidReturns } from "./reports.js";

/**
 * The report catalogue (spec §49–50). Each report declares typed columns once; the same definition drives
 * the JSON table, the totals row, the CSV and the Excel export. Totals are always over the full filtered set,
 * however the rows are paged.
 */

interface Built {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Set by reports that page in SQL: the size of the full filtered set. */
  total?: number;
  /** Set by reports that total in SQL (otherwise totals come from the rows). */
  totals?: Record<string, number | null>;
  totalsByUnit?: ReportResult["totalsByUnit"];
  summary?: ReportSummaryItem[];
  note?: string;
}

type Loader = (f: Filters, ctx: { today: string; page?: Page }) => Promise<Built>;

const col = (key: string, header: string, type: ReportColumn["type"] = "text", extra: Partial<ReportColumn> = {}): ReportColumn => ({ key, header, type, ...extra });
const sum = (key: string, header: string, type: ReportColumn["type"], extra: Partial<ReportColumn> = {}) => col(key, header, type, { total: "sum", ...extra });

const statusLabel = (s: string, overdue = false) => `${JOB_STATUS_LABEL[s as JobStatus] ?? s}${overdue ? " · Overdue" : ""}`;
const jobLinks = (o: { jobId?: string; clientId?: string; returnId?: string; materialId?: string | null }) => {
  const l: Record<string, string> = {};
  if (o.jobId) l.job = `/jobs/${o.jobId}`;
  if (o.clientId) l.client = `/clients/${o.clientId}`;
  if (o.returnId) l.return = `/returns/${o.returnId}`;
  if (o.materialId) l.material = `/materials/${o.materialId}`;
  return l;
};

// ───────────────────────── Material ─────────────────────────

const materialOutside: Loader = async (f, { today }) => {
  const rows = await materialHolders(f, today);
  return {
    columns: [
      col("clientName", "Job worker", "text", { link: "client" }),
      col("materialName", "Material", "text", { link: "material" }),
      col("unit", "Unit"),
      sum("qty", "Qty outside", "qty"),
      sum("challans", "Challans", "int"),
      col("oldestIssueDate", "Oldest issue", "date"),
      col("daysOutside", "Days outside", "days"),
      sum("valuePaise", "Est. value", "money"),
      col("status", "Status", "status"),
    ],
    rows: rows.map((r) => ({ ...r, status: HOLDING_STATUS_LABEL[r.status], links: jobLinks({ clientId: r.clientId, materialId: r.materialId }) })),
    summary: [
      { label: "Workers holding material", value: new Set(rows.map((r) => r.clientId)).size, type: "int" },
      { label: "Estimated value outside", value: rows.reduce((s, r) => s + r.valuePaise, 0), type: "money" },
      { label: "Overdue holdings", value: rows.filter((r) => r.status === "OVERDUE").length, type: "int", tone: "danger" },
    ],
  };
};

const workerMaterial: Loader = async (f, { today }) => {
  const rows = await workerMaterialPositions(f, today);
  return {
    columns: [
      col("clientName", "Job worker", "text", { link: "client" }),
      col("materialName", "Material", "text", { link: "material" }),
      col("unit", "Unit"),
      sum("challans", "Challans", "int", { minor: true }),
      sum("issued", "Issued", "qty"),
      sum("rework", "Rework sent", "qty", { minor: true }),
      sum("returned", "Returned OK", "qty"),
      sum("damaged", "Damaged", "qty"),
      sum("rejected", "Rejected", "qty"),
      sum("lost", "Lost", "qty"),
      sum("pending", "Pending", "qty"),
      sum("valuePaise", "Work value", "money"),
      sum("pendingValuePaise", "Pending value", "money", { minor: true }),
    ],
    rows: rows.map((r) => ({ ...r, links: jobLinks({ clientId: r.clientId, materialId: r.materialId }) })),
  };
};

const materialStock: Loader = async (f) => {
  let rows = await materialRows({});
  if (f.productId) rows = rows.filter((m) => m.productId === f.productId);
  if (f.materialId) rows = rows.filter((m) => m.id === f.materialId);
  return {
    columns: [
      col("code", "Code", "text", { link: "material" }),
      col("name", "Material", "text", { link: "material" }),
      col("lotNumber", "Lot", "text", { minor: true }),
      col("rollNumber", "Roll", "text", { minor: true }),
      col("unit", "Unit"),
      sum("available", "In warehouse", "qty"),
      sum("damagedHeld", "Damaged held", "qty"),
      sum("withWorkers", "With workers", "qty"),
      sum("lost", "Lost", "qty", { minor: true }),
      sum("workers", "Workers", "int", { minor: true }),
      sum("outsideValuePaise", "Value outside", "money"),
      col("active", "Active", "text", { minor: true }),
    ],
    rows: rows.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      lotNumber: m.lotNumber,
      rollNumber: m.rollNumber,
      unit: m.unit,
      ...m.stock,
      workers: m.workers,
      outsideValuePaise: m.outsideValuePaise,
      active: m.isActive ? "Yes" : "No",
      links: jobLinks({ materialId: m.id }),
    })),
  };
};

const BUCKET_LABEL: Record<string, string> = { "0-3": "0–3 days", "4-7": "4–7 days", "8-15": "8–15 days", "16-30": "16–30 days", "30+": "30+ days" };

const challanAging: Loader = async (f, { today }) => {
  const rows = (await challansOutside(f, today)).map((o) => {
    const daysOut = Math.max(0, diffDays(today, o.jobDate));
    return {
      jobId: o.jobId,
      jobNumber: o.jobNumber,
      clientName: o.clientName,
      jobDate: o.jobDate,
      expectedReturnDate: o.expectedReturnDate,
      daysOut,
      bucket: agingBucket(daysOut),
      bucketLabel: BUCKET_LABEL[agingBucket(daysOut)],
      status: statusLabel(o.status, o.overdue),
      unit: o.units > 1 ? "Mixed" : o.unit,
      sent: o.sent,
      ok: o.ok,
      pending: o.pending,
      pendingValuePaise: o.pendingValuePaise,
      links: jobLinks({ jobId: o.jobId, clientId: o.clientId }),
    };
  });
  rows.sort((a, b) => b.daysOut - a.daysOut);
  return {
    columns: [
      col("jobNumber", "Challan", "text", { link: "job" }),
      col("clientName", "Job worker", "text", { link: "client" }),
      col("jobDate", "Challan date", "date"),
      col("expectedReturnDate", "Expected back", "date", { minor: true }),
      col("daysOut", "Days out", "days", { total: "avg" }),
      col("bucketLabel", "Aging"),
      col("status", "Status", "status"),
      col("unit", "Unit"),
      sum("pending", "Pending", "qty"),
      sum("pendingValuePaise", "Pending value", "money"),
    ],
    rows,
    summary: AGING_BUCKETS.map((b) => ({
      label: BUCKET_LABEL[b],
      value: rows.filter((r) => r.bucket === b).length,
      type: "int" as const,
      tone: b === "30+" ? ("danger" as const) : b === "16-30" ? ("attention" as const) : undefined,
      sub: formatINR(rows.filter((r) => r.bucket === b).reduce((s, r) => s + r.pendingValuePaise, 0)),
    })),
  };
};

// ───────────────────────── Money ─────────────────────────

const paymentOutstanding: Loader = async (f, { today }) => {
  const jobs = (await jobMoney(f, today)).filter((j) => j.valuePaise !== j.paidPaise);
  const unpaid = await unpaidReturns(jobs, today);
  const overdueByJob = new Map<string, { amount: number; due: string | null }>();
  for (const u of unpaid) {
    const o = overdueByJob.get(u.jobId) ?? { amount: 0, due: null };
    if (u.overdueDays > 0) o.amount += u.outstandingPaise;
    if (u.dueDate && (!o.due || u.dueDate < o.due)) o.due = u.dueDate;
    overdueByJob.set(u.jobId, o);
  }
  const rows = jobs.map((j) => ({
    jobId: j.jobId,
    jobNumber: j.jobNumber,
    clientName: j.clientName,
    jobDate: j.jobDate,
    status: statusLabel(j.status),
    valuePaise: j.valuePaise,
    paidPaise: j.paidPaise,
    outstandingPaise: Math.max(0, j.valuePaise - j.paidPaise),
    advancePaise: Math.max(0, j.paidPaise - j.valuePaise),
    overduePaise: overdueByJob.get(j.jobId)?.amount ?? 0,
    nextDue: overdueByJob.get(j.jobId)?.due ?? null,
    links: jobLinks({ jobId: j.jobId, clientId: j.clientId }),
  }));
  rows.sort((a, b) => b.overduePaise - a.overduePaise || b.outstandingPaise - a.outstandingPaise || b.advancePaise - a.advancePaise);
  const t = (k: "outstandingPaise" | "advancePaise" | "overduePaise") => rows.reduce((s, r) => s + r[k], 0);
  return {
    columns: [
      col("jobNumber", "Challan", "text", { link: "job" }),
      col("clientName", "Job worker", "text", { link: "client" }),
      col("jobDate", "Challan date", "date", { minor: true }),
      col("status", "Status", "status", { minor: true }),
      sum("valuePaise", "Work value", "money"),
      sum("paidPaise", "Paid", "money"),
      sum("outstandingPaise", "Outstanding", "money"),
      sum("advancePaise", "Advance", "money"),
      sum("overduePaise", "Overdue", "money"),
      col("nextDue", "Earliest due", "date", { minor: true }),
    ],
    rows,
    summary: [
      { label: "Outstanding", value: t("outstandingPaise"), type: "money", tone: "danger" },
      { label: "Of which overdue", value: t("overduePaise"), type: "money", tone: "danger" },
      { label: "Advances", value: t("advancePaise"), type: "money", tone: "attention" },
    ],
  };
};

const paymentAging: Loader = async (f, { today }) => {
  const jobs = await jobMoney(f, today);
  const unpaid = await unpaidReturns(jobs, today);
  const rows = unpaid.map((u) => {
    const bucket = paymentAgingBucket(u.dueDate, today);
    return {
      returnId: u.returnId,
      returnNumber: u.ret.returnNumber,
      jobNumber: u.ret.job.jobNumber,
      clientName: u.ret.job.client.name,
      date: u.date,
      valuePaise: u.valuePaise,
      paidPaise: u.paidPaise,
      outstandingPaise: u.outstandingPaise,
      dueDate: u.dueDate,
      overdueDays: u.overdueDays,
      bucket,
      bucketLabel: PAYMENT_AGING_LABEL[bucket],
      links: jobLinks({ returnId: u.returnId, jobId: u.jobId, clientId: u.ret.job.client.id }),
    };
  });
  return {
    columns: [
      col("returnNumber", "Return", "text", { link: "return" }),
      col("jobNumber", "Challan", "text", { link: "job" }),
      col("clientName", "Job worker", "text", { link: "client" }),
      col("date", "Return date", "date"),
      sum("valuePaise", "Work value", "money", { minor: true }),
      sum("paidPaise", "Paid", "money", { minor: true }),
      sum("outstandingPaise", "Outstanding", "money"),
      col("dueDate", "Due date", "date"),
      col("overdueDays", "Days overdue", "days"),
      col("bucketLabel", "Aging", "status"),
    ],
    rows,
    summary: PAYMENT_AGING_BUCKETS.map((b) => {
      const inB = rows.filter((r) => r.bucket === b);
      return {
        label: PAYMENT_AGING_LABEL[b],
        value: inB.reduce((s, r) => s + r.outstandingPaise, 0),
        type: "money" as const,
        sub: `${inB.length} return${inB.length === 1 ? "" : "s"}`,
        tone: b === "DUE_TODAY" ? ("warning" as const) : b === "NOT_DUE" || b === "NO_DUE_DATE" ? undefined : ("danger" as const),
      };
    }),
  };
};

const lineColumns = (withDate: boolean): ReportColumn[] => [
  ...(withDate ? [col("date", "Date", "date")] : []),
  col("receivedAt", "Time", "datetime"),
  col("clientName", "Job worker", "text", { link: "client" }),
  col("jobNumber", "Challan", "text", { link: "job" }),
  col("returnNumber", "Return", "text", { link: "return" }),
  col("designName", "Design"),
  col("unit", "Unit"),
  sum("qty", "Qty", "qty"),
  sum("payableQty", "Payable qty", "qty", { minor: true }),
  col("ratePaise", "Rate", "rate"),
  sum("valuePaise", "Amount", "money"),
];

async function lineReport(f: Filters, today: string, mode: "range" | "day", page?: Page): Promise<Built> {
  const r = await returnLines(f, today, mode, page);
  const single = r.byUnit.length === 1 ? r.byUnit[0] : null;
  return {
    columns: [],
    rows: r.rows.map((l) => ({
      returnLineId: l.returnLineId,
      date: l.date,
      receivedAt: l.receivedAt,
      clientName: l.client.name,
      jobNumber: l.job.jobNumber,
      returnNumber: l.returnNumber,
      designName: l.designName,
      unit: l.unit,
      qty: l.qty,
      okQty: l.okQty,
      payableQty: l.payableQty,
      ratePaise: l.ratePaise,
      challanRatePaise: l.challanRatePaise,
      rateChanged: l.ratePaise !== l.challanRatePaise ? "Yes" : "",
      valuePaise: l.valuePaise,
      photoId: l.photoId,
      photoCount: l.photoCount,
      links: jobLinks({ jobId: l.job.id, clientId: l.client.id, returnId: l.returnId }),
    })),
    total: r.total,
    totals: { qty: single ? single.qty : null, payableQty: single ? single.payable : null, okQty: single ? single.ok : null, valuePaise: r.valuePaise },
    totalsByUnit: r.byUnit.map((u) => ({ unit: u.unit, values: { qty: u.qty, payableQty: u.payable, okQty: u.ok, valuePaise: u.value } })),
  };
}

const arrivals: Loader = async (f, { today, page }) => {
  const b = await lineReport(f, today, "day", page);
  return {
    ...b,
    columns: [...lineColumns(false).slice(0, 7), sum("okQty", "Good", "qty", { minor: true }), ...lineColumns(false).slice(7), col("photoCount", "Photos", "int", { minor: true })],
    summary: [
      { label: "Lines received", value: b.total ?? 0, type: "int" },
      { label: "Job work value", value: b.totals?.valuePaise ?? 0, type: "money" },
    ],
  };
};

const rateHistory: Loader = async (f, { today, page }) => {
  const b = await lineReport(f, today, "range", page);
  return {
    ...b,
    columns: [
      col("date", "Date", "date"),
      col("receivedAt", "Time", "datetime", { minor: true }),
      col("clientName", "Job worker", "text", { link: "client" }),
      col("designName", "Design"),
      col("jobNumber", "Challan", "text", { link: "job" }),
      col("returnNumber", "Return", "text", { link: "return" }),
      col("ratePaise", "Rate", "rate"),
      col("challanRatePaise", "Challan rate", "rate", { minor: true }),
      col("unit", "Unit"),
      sum("payableQty", "Qty", "qty"),
      sum("valuePaise", "Amount", "money"),
    ],
  };
};

// ───────────────────────── Work ─────────────────────────

const workColumns = (first: ReportColumn): ReportColumn[] => [
  first,
  col("unit", "Unit"),
  sum("challans", "Challans", "int"),
  sum("issued", "Issued", "qty"),
  sum("ok", "Returned OK", "qty"),
  sum("damaged", "Damaged", "qty", { minor: true }),
  sum("rejected", "Rejected", "qty", { minor: true }),
  sum("lost", "Lost", "qty", { minor: true }),
  sum("pending", "Pending", "qty"),
  sum("valuePaise", "Work value", "money"),
  sum("pendingValuePaise", "Pending value", "money", { minor: true }),
];

const byDesign: Loader = async (f, { today }) => {
  const rows = await workGrouped("design", f, today);
  return { columns: workColumns(col("name", "Design")), rows: rows.map((r) => ({ ...r })) };
};

const byWorker: Loader = async (f, { today }) => {
  const rows = await workGrouped("worker", f, today);
  return { columns: workColumns(col("name", "Job worker", "text", { link: "client" })), rows: rows.map((r) => ({ ...r, links: jobLinks({ clientId: r.key ?? undefined }) })) };
};

const completionTime: Loader = async (f, { today }) => {
  const rows = await completionRows(f, today);
  return {
    columns: [
      col("jobNumber", "Challan", "text", { link: "job" }),
      col("clientName", "Job worker", "text", { link: "client" }),
      col("jobDate", "Challan date", "date"),
      col("status", "Status", "status"),
      col("firstReturnDate", "First return", "date", { minor: true }),
      col("lastReturnDate", "Last return", "date", { minor: true }),
      sum("returns", "Returns", "int", { minor: true }),
      col("daysToFirst", "Days to first", "days", { total: "avg" }),
      col("daysToComplete", "Days to complete", "days", { total: "avg" }),
    ],
    rows: rows.map((r) => ({ ...r, status: statusLabel(r.status), links: jobLinks({ jobId: r.jobId, clientId: r.clientId }) })),
    summary: [
      { label: "Avg days to first return", value: meanOf(rows.map((r) => r.daysToFirst)) ?? 0, type: "days" },
      { label: "Avg days to complete", value: meanOf(rows.map((r) => r.daysToComplete)) ?? 0, type: "days" },
      { label: "Completed challans", value: rows.filter((r) => r.daysToComplete !== null).length, type: "int" },
    ],
  };
};

const defectRejection: Loader = async (f, { today }) => {
  const groups = await workGrouped("worker", f, today);
  const rows = groups
    .map((g) => {
      const accounted = roundQty(g.ok + g.damaged + g.rejected + g.lost);
      return {
        name: g.name,
        unit: g.unit,
        accounted,
        ok: g.ok,
        damaged: g.damaged,
        rejected: g.rejected,
        lost: g.lost,
        rework: g.rework,
        defectPct: percent(g.damaged + g.lost, accounted),
        rejectionPct: percent(g.rejected, accounted),
        reworkPct: percent(g.rework, g.issued),
        links: jobLinks({ clientId: g.key ?? undefined }),
      };
    })
    .filter((r) => r.accounted > 0)
    .sort((a, b) => (b.defectPct ?? 0) + (b.rejectionPct ?? 0) - ((a.defectPct ?? 0) + (a.rejectionPct ?? 0)));
  return {
    columns: [
      col("name", "Job worker", "text", { link: "client" }),
      col("unit", "Unit"),
      sum("accounted", "Returned (all)", "qty"),
      sum("ok", "Good", "qty"),
      sum("damaged", "Damaged", "qty"),
      sum("rejected", "Rejected", "qty"),
      sum("lost", "Lost", "qty"),
      sum("rework", "Rework sent", "qty", { minor: true }),
      col("defectPct", "Defect %", "pct"),
      col("rejectionPct", "Rejection %", "pct"),
      col("reworkPct", "Rework %", "pct", { minor: true }),
    ],
    rows,
  };
};

// ───────────────────────── Photos ─────────────────────────

const designPhotos: Loader = async (f, { page }) => {
  const where: Prisma.ReturnPhotoWhereInput = {
    voidedAt: null,
    clientId: f.clientId,
    designId: f.designId,
    jobId: f.jobId,
    return: { voidedAt: null, date: f.from || f.to ? { gte: f.from ? new Date(`${f.from}T00:00:00Z`) : undefined, lte: f.to ? new Date(`${f.to}T00:00:00Z`) : undefined } : undefined },
    job: f.productId || f.jobWorkTypeId ? { productId: f.productId, jobWorkTypeId: f.jobWorkTypeId } : undefined,
  };
  const [total, photos] = await Promise.all([
    prisma.returnPhoto.count({ where }),
    prisma.returnPhoto.findMany({ where, include: photoInclude, orderBy: { createdAt: "desc" }, skip: page?.skip, take: page?.take }),
  ]);
  const views = await toPhotoViews(prisma, photos);
  return {
    columns: [
      col("receivedDate", "Date", "date"),
      col("receivedAt", "Time", "datetime", { minor: true }),
      col("clientName", "Job worker", "text", { link: "client" }),
      col("jobNumber", "Challan", "text", { link: "job" }),
      col("returnNumber", "Return", "text", { link: "return" }),
      col("designName", "Design"),
      col("unit", "Unit"),
      col("qty", "Qty", "qty"),
      col("ratePaise", "Rate", "rate"),
      col("valuePaise", "Amount", "money"),
      col("photoId", "Photo ID", "text", { minor: true }),
    ],
    rows: views.map((v) => ({
      photoId: v.id,
      receivedDate: v.receivedDate.slice(0, 10),
      receivedAt: v.receivedAt,
      clientName: v.client.name,
      jobNumber: v.job.jobNumber,
      returnNumber: v.returnNumber,
      designName: v.design?.name ?? null,
      unit: v.unit,
      qty: v.qty,
      ratePaise: v.ratePaise,
      valuePaise: v.valuePaise,
      links: { ...jobLinks({ jobId: v.job.id, clientId: v.client.id, returnId: v.returnId }), photo: `/gallery?photo=${v.id}` },
    })),
    total,
    totals: {},
  };
};

// ───────────────────────── Ledgers ─────────────────────────

const ledgerColumns: ReportColumn[] = [
  col("date", "Date", "date"),
  col("ref", "Ref", "text", { link: "ref" }),
  col("jobNumber", "Challan", "text", { link: "job", minor: true }),
  col("particular", "Particulars"),
  sum("debitPaise", "Work (debit)", "money"),
  sum("creditPaise", "Paid (credit)", "money"),
  col("balancePaise", "Balance", "money"),
];

const ledgerRows = (rows: Awaited<ReturnType<typeof workerLedger>>["rows"]): ReportRow[] =>
  rows.map((r) => ({
    date: r.date.slice(0, 10),
    at: r.at,
    type: r.type,
    ref: r.ref,
    jobNumber: r.job?.jobNumber ?? null,
    particular: r.particular,
    debitPaise: r.debitPaise,
    creditPaise: r.creditPaise,
    balancePaise: r.balancePaise,
    links: { ref: r.href, ...(r.job ? { job: `/jobs/${r.job.id}` } : {}) },
  }));

const workerLedgerReport: Loader = async (f) => {
  if (!f.clientId) throw new HttpError(422, "Choose a job worker for the ledger");
  const l = await workerLedger(f.clientId, { from: f.from, to: f.to });
  return {
    columns: ledgerColumns,
    rows: ledgerRows(l.rows),
    note: `Opening balance ${formatINR(l.openingPaise)}`,
    summary: [
      { label: "Opening", value: l.openingPaise, type: "money" },
      { label: "Work received", value: l.totals.debitPaise, type: "money" },
      { label: "Paid", value: l.totals.creditPaise, type: "money", tone: "success" },
      { label: "Closing balance", value: l.totals.closingPaise, type: "money", tone: l.totals.closingPaise > 0 ? "danger" : "success" },
    ],
  };
};

const challanLedgerReport: Loader = async (f) => {
  if (!f.jobId) throw new HttpError(422, "Choose a challan for the ledger");
  const l = await challanLedger(f.jobId);
  return {
    columns: ledgerColumns,
    rows: ledgerRows(l.rows),
    summary: [
      { label: "Issued value (challan rates)", value: l.issuedValuePaise, type: "money" },
      { label: "Work received", value: l.totals.debitPaise, type: "money" },
      { label: "Paid", value: l.totals.creditPaise, type: "money", tone: "success" },
      { label: "Balance", value: l.totals.closingPaise, type: "money", tone: l.totals.closingPaise > 0 ? "danger" : "success" },
    ],
  };
};

const LOADERS: Record<string, { load: Loader; sqlPaged?: boolean }> = {
  "material-outside": { load: materialOutside },
  "worker-material": { load: workerMaterial },
  "material-stock": { load: materialStock },
  "challan-aging": { load: challanAging },
  "payment-outstanding": { load: paymentOutstanding },
  "payment-aging": { load: paymentAging },
  "rate-history": { load: rateHistory, sqlPaged: true },
  arrivals: { load: arrivals, sqlPaged: true },
  "job-work-by-design": { load: byDesign },
  "job-work-by-worker": { load: byWorker },
  "completion-time": { load: completionTime },
  "defect-rejection": { load: defectRejection },
  "design-photos": { load: designPhotos, sqlPaged: true },
  "worker-ledger": { load: workerLedgerReport },
  "challan-ledger": { load: challanLedgerReport },
};

export const isCatalogReport = (id: string) => id in LOADERS;

/** Totals over every row: sums (quantities only when all rows share a unit) and averages; per-unit sums alongside. */
function computeTotals(columns: ReportColumn[], rows: ReportRow[]) {
  const totals: Record<string, number | null> = {};
  const units = [...new Set(rows.map((r) => (typeof r.unit === "string" ? r.unit : "")))];
  const mixed = units.length > 1;
  for (const c of columns) {
    if (!c.total) continue;
    const vals = rows.map((r) => r[c.key]).filter((v): v is number => typeof v === "number");
    if (c.total === "avg") totals[c.key] = meanOf(vals);
    else if (c.type === "qty") totals[c.key] = mixed ? null : roundQty(vals.reduce((s, v) => s + v, 0));
    else totals[c.key] = vals.reduce((s, v) => s + v, 0);
  }
  const qtyCols = columns.filter((c) => c.total === "sum" && c.type === "qty");
  const totalsByUnit = mixed && qtyCols.length
    ? units.map((unit) => ({
        unit,
        values: Object.fromEntries(qtyCols.map((c) => [c.key, roundQty(rows.filter((r) => r.unit === unit).reduce((s, r) => s + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0))])),
      }))
    : [];
  return { totals, totalsByUnit };
}

export const MAX_TAKE = 500;

export async function runReport(id: string, f: Filters, today: string, page?: Page): Promise<ReportResult> {
  const meta = REPORTS.find((r) => r.id === id);
  const def = LOADERS[id];
  if (!meta || !def) throw notFound("Report");
  const built = await def.load(f, { today, page: def.sqlPaged ? page : undefined });
  const all = built.rows;
  const computed = built.totals ? null : computeTotals(built.columns, all);
  const rows = page && !def.sqlPaged ? all.slice(page.skip, page.skip + page.take) : all;
  return {
    id,
    title: meta.title,
    description: meta.description,
    columns: built.columns,
    rows,
    total: built.total ?? all.length,
    skip: page?.skip ?? 0,
    take: page?.take ?? all.length,
    totals: built.totals ?? computed!.totals,
    totalsByUnit: built.totalsByUnit ?? computed?.totalsByUnit ?? [],
    summary: built.summary ?? [],
    note: built.note,
  };
}

/** Column definitions for CSV / Excel, with a totals row in the same units. */
export function exportShape(r: ReportResult): { columns: TableColumn<ReportRow>[]; totals?: TableTotals } {
  const columns: TableColumn<ReportRow>[] = r.columns.map((c) => ({
    header: c.header,
    type: c.type,
    value: (row) => {
      const v = row[c.key];
      return typeof v === "string" || typeof v === "number" ? v : v === true ? "Yes" : v === false ? "No" : null;
    },
  }));
  const values: Record<string, number | null> = {};
  for (const c of r.columns) if (c.key in r.totals) values[c.header] = r.totals[c.key];
  const any = Object.values(values).some((v) => v !== null && v !== undefined);
  return { columns, totals: any ? { label: "Total", values } : undefined };
}
