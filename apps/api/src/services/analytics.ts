import { all, db, type Filter } from "@av/db";
import { dayOf, diffDays, holdingStatus, roundQty, type ArrivalRow, type MaterialHolderRow, type Unit } from "@av/shared";
import type { PipelineStage } from "mongoose";
import { toDate } from "../lib/dates.js";
import { range, roundHalfUp } from "../lib/mongo.js";
import { payableExpr, returnValueExpr, valueExpr } from "./ledger.js";

/**
 * Aggregates for the dashboard, charts and reports. Every figure is grouped inside MongoDB (dispatch lines,
 * return lines and vouchers are summed per design line / challan / worker) so nothing loads every row of
 * every challan into memory. The formulas mirror calc.ts: pending = max(0, sent − accounted),
 * value = Σ round(payable × return rate), pending value = round(pending × challan rate) per design line.
 */

export interface Filters {
  from?: string;
  to?: string;
  date?: string;
  clientId?: string;
  designId?: string;
  productId?: string;
  jobWorkTypeId?: string;
  materialId?: string;
  jobId?: string;
  status?: string;
}

export interface Page {
  skip: number;
  take: number;
}

const OPEN = ["DRAFT", "IN_PROGRESS", "PARTIALLY_RECEIVED"];
const ACTIVE = ["IN_PROGRESS", "PARTIALLY_RECEIVED"];

function statusCond(status: string | undefined, today: string): Filter {
  if (!status) return {};
  if (status === "OPEN") return { status: { $in: OPEN } };
  if (status === "ACTIVE") return { status: { $in: ACTIVE } };
  // isOverdue(): an issued, not-finished challan past its expected return date.
  if (status === "OVERDUE") return { status: { $in: ACTIVE }, expectedReturnDate: { $lt: toDate(today) } };
  return { status };
}

/** A design line whose effective job work type (its own, else the challan's) is `id`. */
const jwtOnJob = (id: string): Filter => ({ $or: [{ items: { $elemMatch: { jobWorkTypeId: id } } }, { jobWorkTypeId: id, items: { $elemMatch: { jobWorkTypeId: null } } }] });

/**
 * Challan-level filters (a match on job documents). Design / material / job work type filters keep challans
 * with at least one matching line; with `item` the lines themselves are filtered later (see itemMatch).
 */
export function jobMatch(f: Filters, today: string, opts: { jobDate?: boolean; excludeCancelled?: boolean } = {}): Filter {
  const and: Filter[] = [];
  if (f.clientId) and.push({ clientId: f.clientId });
  if (f.jobId) and.push({ _id: f.jobId });
  if (f.productId) and.push({ productId: f.productId });
  if (f.designId) and.push({ items: { $elemMatch: { designId: f.designId } } });
  if (f.materialId) and.push({ items: { $elemMatch: { materialId: f.materialId } } });
  if (f.jobWorkTypeId) and.push(jwtOnJob(f.jobWorkTypeId));
  const s = statusCond(f.status, today);
  if (Object.keys(s).length) and.push(s);
  if (opts.excludeCancelled) and.push({ status: { $ne: "CANCELLED" } });
  if (opts.jobDate && (f.from || f.to)) and.push({ jobDate: range(f.from ? toDate(f.from) : null, f.to ? toDate(f.to) : null) });
  return and.length ? { $and: and } : {};
}

/** Line-level filters on the rows produced by itemRows(). */
function itemMatch(f: Filters): Filter {
  const m: Filter = {};
  if (f.designId) m.designId = f.designId;
  if (f.materialId) m.materialId = f.materialId;
  if (f.jobWorkTypeId) m.jobWorkTypeId = f.jobWorkTypeId;
  return m;
}

/** Σ over the looked-up entries' lines of this design line: `of` gives the value per line ($$l), `when` filters the entries ($$d). */
function sumLines(entries: string, of: unknown, when?: unknown) {
  const docs = when ? { $filter: { input: entries, as: "d", cond: when } } : entries;
  return {
    $sum: {
      $map: {
        input: docs,
        as: "d",
        in: { $sum: { $map: { input: { $filter: { input: "$$d.lines", as: "l", cond: { $eq: ["$$l.jobItemId", "$items._id"] } } }, as: "l", in: of } } },
      },
    },
  };
}

const notRework = { $ne: ["$$d.kind", "REWORK"] };
const isRework = { $eq: ["$$d.kind", "REWORK"] };

/**
 * One row per design line: issued (initial + additional), rework, sent, returned by kind, value at return rates,
 * pending and excess, with the challan fields reports group by. Each challan's non-voided issues and returns
 * are looked up once (indexed on jobId), then summed per line.
 */
function itemRows(where: Filter, f?: Filters): PipelineStage[] {
  return [
    { $match: where },
    { $lookup: { from: "dispatches", localField: "_id", foreignField: "jobId", pipeline: [{ $match: { voidedAt: null } }, { $project: { kind: 1, lines: 1 } }], as: "ds" } },
    { $lookup: { from: "returns", localField: "_id", foreignField: "jobId", pipeline: [{ $match: { voidedAt: null } }, { $project: { lines: 1 } }], as: "rs" } },
    { $lookup: { from: "clients", localField: "clientId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "c" } },
    { $unwind: "$items" },
    {
      $project: {
        _id: "$items._id",
        jobId: "$_id",
        jobNumber: 1,
        clientId: 1,
        clientName: { $first: "$c.name" },
        jobDate: 1,
        expectedReturnDate: 1,
        status: 1,
        productId: 1,
        jobWorkTypeId: { $ifNull: ["$items.jobWorkTypeId", "$jobWorkTypeId"] },
        materialId: "$items.materialId",
        unit: "$items.unit",
        ratePaise: "$items.ratePaise",
        designId: "$items.designId",
        designName: "$items.designName",
        sortOrder: "$items.sortOrder",
        quantity: "$items.quantity",
        issued: sumLines("$ds", "$$l.qty", notRework),
        rework: sumLines("$ds", "$$l.qty", isRework),
        sent: sumLines("$ds", "$$l.qty"),
        ok: sumLines("$rs", "$$l.okQty"),
        damaged: sumLines("$rs", "$$l.damagedQty"),
        rejected: sumLines("$rs", "$$l.rejectedQty"),
        lost: sumLines("$rs", "$$l.lostQty"),
        payable: sumLines("$rs", payableExpr("$$l")),
        value: sumLines("$rs", valueExpr("$$l")),
      },
    },
    { $set: { accounted: { $add: ["$ok", "$damaged", "$rejected", "$lost"] } } },
    { $set: { pending: { $max: [{ $subtract: ["$sent", "$accounted"] }, 0] }, excess: { $max: [{ $subtract: ["$accounted", "$sent"] }, 0] } } },
    ...(f && Object.keys(itemMatch(f)).length ? [{ $match: itemMatch(f) }] : []),
  ];
}

/** round(pending × challan rate) for one design line. */
const pendingValue = roundHalfUp({ $multiply: ["$pending", "$ratePaise"] });

const q = (n: number | string | null | undefined) => roundQty(Number(n ?? 0));
const money = (n: number | string | null | undefined) => Math.round(Number(n ?? 0));

/** Byte-order string compare with null after every string (the order these reports have always used). */
function cmp(a: string | null | undefined, b: string | null | undefined) {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Names of these materials (lookups after grouping). */
async function materialNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, string>();
  return new Map((await db.material.find({ _id: { $in: unique } }, { select: "name" })).map((m) => [m.id, m.name]));
}

// ───────────────────────── Material outside ─────────────────────────

/** "Who has my material?": pending quantity per worker × material (lines without a material grouped by unit). */
export async function materialHolders(f: Filters, today: string): Promise<MaterialHolderRow[]> {
  const todayDate = toDate(today);
  const rows = await db.job.aggregate<{ id: { clientId: string; materialId: string | null; unit: string }; clientName: string; qty: number; jobs: string[]; overdueJobs: (string | null)[]; oldest: Date | null; value: number }>([
    ...itemRows(jobMatch(f, today), f),
    { $match: { pending: { $gt: 0 } } },
    {
      $group: {
        _id: { clientId: "$clientId", materialId: "$materialId", unit: "$unit" },
        clientName: { $first: "$clientName" },
        qty: { $sum: "$pending" },
        jobs: { $addToSet: "$jobId" },
        overdueJobs: {
          $addToSet: { $cond: [{ $and: [{ $in: ["$status", ACTIVE] }, { $gt: ["$expectedReturnDate", null] }, { $lt: ["$expectedReturnDate", todayDate] }] }, "$jobId", null] },
        },
        oldest: { $min: "$jobDate" },
        value: { $sum: pendingValue },
      },
    },
  ]);
  const names = await materialNames(rows.map((r) => r.id.materialId));
  return rows
    .map((r) => {
      const overdue = r.overdueJobs.filter(Boolean).length;
      const oldest = r.oldest ? dayOf(r.oldest) : null;
      const daysOutside = oldest ? Math.max(0, diffDays(today, oldest)) : 0;
      const materialName = r.id.materialId ? names.get(r.id.materialId) : undefined;
      return {
        clientId: r.id.clientId,
        clientName: r.clientName,
        materialId: r.id.materialId,
        materialName: materialName ?? `No material linked (${r.id.unit})`,
        unit: r.id.unit as Unit,
        qty: q(r.qty),
        challans: r.jobs.length,
        overdueChallans: overdue,
        oldestIssueDate: oldest,
        daysOutside,
        valuePaise: money(r.value),
        status: holdingStatus(daysOutside, overdue > 0),
      };
    })
    .sort((a, b) => b.daysOutside - a.daysOutside || b.valuePaise - a.valuePaise);
}

export interface PositionRow {
  clientId: string;
  clientName: string;
  materialId: string | null;
  materialName: string;
  unit: Unit;
  issued: number;
  rework: number;
  returned: number;
  damaged: number;
  rejected: number;
  lost: number;
  pending: number;
  valuePaise: number;
  pendingValuePaise: number;
  challans: number;
}

const sums = {
  issued: { $sum: "$issued" },
  rework: { $sum: "$rework" },
  ok: { $sum: "$ok" },
  damaged: { $sum: "$damaged" },
  rejected: { $sum: "$rejected" },
  lost: { $sum: "$lost" },
  pending: { $sum: "$pending" },
  valuePaise: { $sum: "$value" },
  pendingValuePaise: { $sum: pendingValue },
  jobs: { $addToSet: "$jobId" },
};
type Sums = { issued: number; rework: number; ok: number; damaged: number; rejected: number; lost: number; pending: number; valuePaise: number; pendingValuePaise: number; jobs: string[] };

/** Issued / returned / damaged / rejected / lost / pending per worker × material (challans dated in the range). */
export async function workerMaterialPositions(f: Filters, today: string): Promise<PositionRow[]> {
  const rows = await db.job.aggregate<Sums & { id: { clientId: string; materialId: string | null; unit: string }; clientName: string }>([
    ...itemRows(jobMatch(f, today, { jobDate: true, excludeCancelled: true }), f),
    { $match: { sent: { $gt: 0 } } },
    { $group: { _id: { clientId: "$clientId", materialId: "$materialId", unit: "$unit" }, clientName: { $first: "$clientName" }, ...sums } },
  ]);
  const names = await materialNames(rows.map((r) => r.id.materialId));
  return rows
    .map((r) => {
      const name = r.id.materialId ? (names.get(r.id.materialId) ?? null) : null;
      return {
        row: {
          clientId: r.id.clientId,
          clientName: r.clientName,
          materialId: r.id.materialId,
          materialName: name ?? `No material linked (${r.id.unit})`,
          unit: r.id.unit as Unit,
          issued: q(r.issued),
          rework: q(r.rework),
          returned: q(r.ok),
          damaged: q(r.damaged),
          rejected: q(r.rejected),
          lost: q(r.lost),
          pending: q(r.pending),
          valuePaise: money(r.valuePaise),
          pendingValuePaise: money(r.pendingValuePaise),
          challans: r.jobs.length,
        },
        name,
      };
    })
    .sort((a, b) => cmp(a.row.clientName, b.row.clientName) || cmp(a.name, b.name))
    .map((x) => x.row);
}

// ───────────────────────── Job work grouped ─────────────────────────

export interface WorkGroupRow {
  key: string | null;
  name: string;
  unit: Unit;
  challans: number;
  issued: number;
  rework: number;
  ok: number;
  damaged: number;
  rejected: number;
  lost: number;
  pending: number;
  valuePaise: number;
  pendingValuePaise: number;
}

/** Job work per design or per worker (and unit), for challans dated in the range. Cancelled challans are left out. */
export async function workGrouped(by: "design" | "worker" | "jobWorkType", f: Filters, today: string): Promise<WorkGroupRow[]> {
  const key = by === "design" ? "$designId" : by === "worker" ? "$clientId" : "$jobWorkTypeId";
  const rows = await db.job.aggregate<Sums & { id: { key: string | null; unit: string }; designName: string; clientName: string }>([
    ...itemRows(jobMatch(f, today, { jobDate: true, excludeCancelled: true }), f),
    { $group: { _id: { key, unit: "$unit" }, designName: { $min: "$designName" }, clientName: { $min: "$clientName" }, ...sums } },
  ]);
  const keys = [...new Set(rows.map((r) => r.id.key).filter((k): k is string => !!k))];
  const names =
    by === "design"
      ? new Map((await db.design.find({ _id: { $in: keys } }, { select: "name" })).map((d) => [d.id, d.name]))
      : by === "jobWorkType"
        ? new Map((await db.jobWorkType.find({ _id: { $in: keys } }, { select: "name" })).map((t) => [t.id, t.name]))
        : new Map<string, string>();
  return rows
    .map((r) => ({
      key: r.id.key,
      name:
        by === "design"
          ? ((r.id.key && names.get(r.id.key)) ?? r.designName)
          : by === "worker"
            ? r.clientName
            : ((r.id.key && names.get(r.id.key)) ?? "No job work type"),
      unit: r.id.unit as Unit,
      challans: r.jobs.length,
      issued: q(r.issued),
      rework: q(r.rework),
      ok: q(r.ok),
      damaged: q(r.damaged),
      rejected: q(r.rejected),
      lost: q(r.lost),
      pending: q(r.pending),
      valuePaise: money(r.valuePaise),
      pendingValuePaise: money(r.pendingValuePaise),
    }))
    .sort((a, b) => b.valuePaise - a.valuePaise || cmp(a.name, b.name));
}

/** Design lines where more came back than was sent (an approved over-return). */
export async function quantityMismatches() {
  const rows = await db.job.aggregate<{ jobId: string; jobNumber: string; clientName: string; designName: string; unit: string; excess: number }>([
    ...itemRows({ status: { $ne: "CANCELLED" } }),
    { $match: { excess: { $gt: 0 } } },
    { $sort: { jobDate: -1 } },
    { $project: { _id: 0, jobId: 1, jobNumber: 1, clientName: 1, designName: 1, unit: 1, excess: 1 } },
  ]);
  return rows.map((r) => ({ ...r, excess: q(r.excess) }));
}

/** Pending quantity per design across every challan (the legacy dashboard list). */
export async function pendingByDesign() {
  const rows = await db.job.aggregate<{ id: string; designName: string; jobs: string[]; pending: number }>([
    ...itemRows({}),
    { $match: { pending: { $gt: 0 } } },
    { $group: { _id: "$designId", designName: { $min: "$designName" }, jobs: { $addToSet: "$jobId" }, pending: { $sum: "$pending" } } },
    { $sort: { pending: -1 } },
  ]);
  return rows.map((r) => ({ designId: r.id, designName: r.designName, jobs: r.jobs.length, pending: q(r.pending) }));
}

// ───────────────────────── Challans: open with material outside ─────────────────────────

export interface OpenChallanRow {
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  jobDate: string;
  expectedReturnDate: string | null;
  status: string;
  overdue: boolean;
  pending: number;
  unit: Unit;
  units: number;
  pendingValuePaise: number;
  sent: number;
  ok: number;
  exceptions: number;
}

/** Challans (not cancelled) that still have material outside; quantities are per challan (single unit when `units` = 1). */
export async function challansOutside(f: Filters, today: string, opts: { includeCancelled?: boolean } = {}): Promise<OpenChallanRow[]> {
  const rows = await db.job.aggregate<{
    id: string;
    jobNumber: string;
    clientId: string;
    clientName: string;
    jobDate: Date;
    expectedReturnDate: Date | null;
    status: string;
    pending: number;
    unit: string;
    units: string[];
    value: number;
    sent: number;
    ok: number;
    exceptions: number;
  }>([
    ...itemRows(jobMatch(f, today, { excludeCancelled: !opts.includeCancelled })),
    {
      $group: {
        _id: "$jobId",
        jobNumber: { $first: "$jobNumber" },
        clientId: { $first: "$clientId" },
        clientName: { $first: "$clientName" },
        jobDate: { $first: "$jobDate" },
        expectedReturnDate: { $first: "$expectedReturnDate" },
        status: { $first: "$status" },
        pending: { $sum: "$pending" },
        unit: { $min: "$unit" },
        units: { $addToSet: "$unit" },
        value: { $sum: pendingValue },
        sent: { $sum: "$sent" },
        ok: { $sum: "$ok" },
        exceptions: { $sum: { $add: ["$damaged", "$rejected", "$lost"] } },
      },
    },
    { $match: { pending: { $gt: 0 } } },
    { $sort: { jobDate: 1, jobNumber: 1 } },
  ]);
  return rows.map((r) => {
    const expected = r.expectedReturnDate ? dayOf(r.expectedReturnDate) : null;
    return {
      jobId: r.id,
      jobNumber: r.jobNumber,
      clientId: r.clientId,
      clientName: r.clientName,
      jobDate: dayOf(r.jobDate),
      expectedReturnDate: expected,
      status: r.status,
      overdue: !!expected && expected < today && (r.status === "IN_PROGRESS" || r.status === "PARTIALLY_RECEIVED"),
      pending: q(r.pending),
      unit: r.unit as Unit,
      units: r.units.length,
      pendingValuePaise: money(r.value),
      sent: q(r.sent),
      ok: q(r.ok),
      exceptions: q(r.exceptions),
    };
  });
}

// ───────────────────────── Money per challan ─────────────────────────

export interface JobMoneyRow {
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  jobDate: string;
  status: string;
  valuePaise: number;
  paidPaise: number;
}

/** Work value and paid per challan that has either. */
export async function jobMoney(f: Filters, today: string): Promise<JobMoneyRow[]> {
  const rows = await db.job.aggregate<{ id: string; jobNumber: string; clientId: string; clientName: string; jobDate: Date; status: string; value: number; paid: number }>([
    { $match: jobMatch(f, today) },
    {
      $lookup: {
        from: "returns",
        localField: "_id",
        foreignField: "jobId",
        // Returns with at least one line, like the old inner join on return lines.
        pipeline: [{ $match: { voidedAt: null, "lines.0": { $exists: true } } }, { $project: { value: returnValueExpr() } }],
        as: "v",
      },
    },
    { $lookup: { from: "subBills", localField: "_id", foreignField: "jobId", pipeline: [{ $match: { voidedAt: null } }, { $project: { amountPaise: 1 } }], as: "p" } },
    { $match: { $or: [{ "v.0": { $exists: true } }, { "p.0": { $exists: true } }] } },
    { $lookup: { from: "clients", localField: "clientId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "c" } },
    { $sort: { jobDate: 1, jobNumber: 1 } },
    { $project: { jobNumber: 1, clientId: 1, clientName: { $first: "$c.name" }, jobDate: 1, status: 1, value: { $sum: "$v.value" }, paid: { $sum: "$p.amountPaise" } } },
  ]);
  return rows.map((r) => ({ jobId: r.id, jobNumber: r.jobNumber, clientId: r.clientId, clientName: r.clientName, jobDate: dayOf(r.jobDate), status: r.status, valuePaise: money(r.value), paidPaise: money(r.paid) }));
}

/** Per worker: value − paid netted across their challans (the "to pay" figure), and any net advance. */
export function workerMoney(rows: JobMoneyRow[]) {
  const map = new Map<string, { clientId: string; clientName: string; valuePaise: number; paidPaise: number; jobsOutstanding: number }>();
  for (const r of rows) {
    const w = map.get(r.clientId) ?? { clientId: r.clientId, clientName: r.clientName, valuePaise: 0, paidPaise: 0, jobsOutstanding: 0 };
    w.valuePaise += r.valuePaise;
    w.paidPaise += r.paidPaise;
    if (r.valuePaise > r.paidPaise) w.jobsOutstanding++;
    map.set(r.clientId, w);
  }
  return [...map.values()].map((w) => ({ ...w, outstandingPaise: Math.max(0, w.valuePaise - w.paidPaise), advancePaise: Math.max(0, w.paidPaise - w.valuePaise) }));
}

/** `{ jobId: { $in } }` for the challans matching the filters, or nothing when no challan filter is set. */
async function jobScope(f: Filters, today: string): Promise<Filter> {
  const where = jobMatch(f, today);
  if (!Object.keys(where).length) return {};
  return { jobId: { $in: (await db.job.find<{ id: string }>(where, { select: "_id" })).map((j) => j.id) } };
}

/** Work value (return date) and payments (voucher date) inside a range. */
export async function periodMoney(f: Filters, today: string) {
  const scope = await jobScope(f, today);
  const dates = f.from || f.to ? { date: range(f.from ? toDate(f.from) : null, f.to ? toDate(f.to) : null) } : {};
  const [[work], [paid]] = await all([
    () =>
      db.return.aggregate<{ value: number; ok: number }>([
        { $match: { voidedAt: null, ...scope, ...dates } },
        { $unwind: "$lines" },
        { $group: { _id: null, value: { $sum: valueExpr() }, ok: { $sum: "$lines.okQty" } } },
      ]),
    () =>
      db.subBill.aggregate<{ paid: number; n: number }>([
        { $match: { voidedAt: null, ...scope, ...dates } },
        { $group: { _id: null, paid: { $sum: "$amountPaise" }, n: { $sum: 1 } } },
      ]),
  ]);
  return { valuePaise: money(work?.value), okQty: q(work?.ok), paidPaise: money(paid?.paid), vouchers: paid?.n ?? 0 };
}

// ───────────────────────── Return lines (arrivals, rate history) ─────────────────────────

/** Non-voided return lines, newest first, one page at a time, with totals over the whole set. */
export async function returnLines(f: Filters, today: string, dateMode: "range" | "day", page?: Page) {
  const scope = await jobScope({ ...f, designId: undefined, jobWorkTypeId: undefined, materialId: undefined }, today);
  const dates =
    dateMode === "day" ? { date: toDate(f.date ?? today) } : f.from || f.to ? { date: range(f.from ? toDate(f.from) : null, f.to ? toDate(f.to) : null) } : {};
  const lineMatch: Filter = {};
  if (f.designId) lineMatch["item.designId"] = f.designId;
  if (f.materialId) lineMatch["item.materialId"] = f.materialId;
  if (f.jobWorkTypeId) lineMatch.jobWorkTypeId = f.jobWorkTypeId;
  type Row = {
    returnLineId: string;
    returnId: string;
    returnNumber: string;
    date: Date;
    receivedAt: Date;
    clientId: string;
    clientName: string;
    jobId: string;
    jobNumber: string;
    designId: string;
    designName: string;
    unit: string;
    okQty: number;
    damagedQty: number;
    rejectedQty: number;
    lostQty: number;
    ratePaise: number;
    challanRatePaise: number;
    payable: number;
    value: number;
    photoId: string | null;
    photoCount: number;
  };
  const [result] = await db.return.aggregate<{ rows: Row[]; totals: { id: string; n: number; qty: number; ok: number; payable: number; value: number }[] }>([
    { $match: { voidedAt: null, ...scope, ...dates } },
    { $lookup: { from: "jobs", localField: "jobId", foreignField: "_id", pipeline: [{ $project: { jobNumber: 1, clientId: 1, jobWorkTypeId: 1, items: 1 } }], as: "j" } },
    { $unwind: "$j" },
    { $unwind: "$lines" },
    { $set: { item: { $first: { $filter: { input: "$j.items", as: "i", cond: { $eq: ["$$i._id", "$lines.jobItemId"] } } } } } },
    { $set: { jobWorkTypeId: { $ifNull: ["$item.jobWorkTypeId", "$j.jobWorkTypeId"] } } },
    ...(Object.keys(lineMatch).length ? [{ $match: lineMatch }] : []),
    {
      $facet: {
        rows: [
          { $sort: { date: -1, receivedAt: -1, returnNumber: -1, "item.sortOrder": 1 } },
          ...(page ? [{ $skip: page.skip }, { $limit: page.take }] : []),
          { $lookup: { from: "clients", localField: "j.clientId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "c" } },
          // Photos of this return that show this line or the whole return; a line's own photo comes first.
          {
            $lookup: {
              from: "returnPhotos",
              let: { lineId: "$lines._id" },
              localField: "_id",
              foreignField: "returnId",
              pipeline: [
                { $match: { voidedAt: null, $expr: { $or: [{ $eq: ["$returnLineId", null] }, { $eq: ["$returnLineId", "$$lineId"] }] } } },
                { $sort: { returnLineId: -1, createdAt: 1 } },
                { $project: { _id: 1 } },
              ],
              as: "ph",
            },
          },
          {
            $project: {
              _id: 0,
              returnLineId: "$lines._id",
              returnId: "$_id",
              returnNumber: 1,
              date: 1,
              receivedAt: 1,
              clientId: "$j.clientId",
              clientName: { $first: "$c.name" },
              jobId: "$j._id",
              jobNumber: "$j.jobNumber",
              designId: "$item.designId",
              designName: "$item.designName",
              unit: "$item.unit",
              okQty: "$lines.okQty",
              damagedQty: "$lines.damagedQty",
              rejectedQty: "$lines.rejectedQty",
              lostQty: "$lines.lostQty",
              ratePaise: "$lines.ratePaise",
              challanRatePaise: "$item.ratePaise",
              payable: payableExpr(),
              value: valueExpr(),
              photoId: { $ifNull: [{ $first: "$ph._id" }, null] },
              photoCount: { $size: "$ph" },
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: "$item.unit",
              n: { $sum: 1 },
              qty: { $sum: { $add: ["$lines.okQty", "$lines.damagedQty", "$lines.rejectedQty", "$lines.lostQty"] } },
              ok: { $sum: "$lines.okQty" },
              payable: { $sum: payableExpr() },
              value: { $sum: valueExpr() },
            },
          },
        ],
      },
    },
  ]);
  const { rows, totals } = result ?? { rows: [], totals: [] };
  const lines: (ArrivalRow & { damagedQty: number; rejectedQty: number; lostQty: number; challanRatePaise: number })[] = rows.map((r) => ({
    returnLineId: r.returnLineId,
    returnId: r.returnId,
    returnNumber: r.returnNumber,
    date: dayOf(r.date),
    receivedAt: r.receivedAt.toISOString(),
    client: { id: r.clientId, name: r.clientName },
    job: { id: r.jobId, jobNumber: r.jobNumber },
    designId: r.designId,
    designName: r.designName,
    unit: r.unit as Unit,
    okQty: q(r.okQty),
    damagedQty: q(r.damagedQty),
    rejectedQty: q(r.rejectedQty),
    lostQty: q(r.lostQty),
    qty: q(r.okQty + r.damagedQty + r.rejectedQty + r.lostQty),
    payableQty: q(r.payable),
    ratePaise: r.ratePaise,
    challanRatePaise: r.challanRatePaise,
    valuePaise: money(r.value),
    photoId: r.photoId,
    photoCount: r.photoCount,
  }));
  return {
    rows: lines,
    total: totals.reduce((s, t) => s + t.n, 0),
    valuePaise: totals.reduce((s, t) => s + money(t.value), 0),
    byUnit: totals.map((t) => ({ unit: t.id as Unit, qty: q(t.qty), ok: q(t.ok), payable: q(t.payable), value: money(t.value) })),
  };
}

// ───────────────────────── Completion & quality ─────────────────────────

export interface CompletionRow {
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  jobDate: string;
  status: string;
  firstReturnDate: string | null;
  lastReturnDate: string | null;
  returns: number;
  daysToFirst: number | null;
  /** Days from challan to the return that completed it (completed challans only). */
  daysToComplete: number | null;
}

/** Challans dated in the range that have at least one return. */
export async function completionRows(f: Filters, today: string): Promise<CompletionRow[]> {
  const rows = await db.job.aggregate<{ id: string; jobNumber: string; clientId: string; clientName: string; jobDate: Date; status: string; first: Date; last: Date; n: number }>([
    { $match: jobMatch(f, today, { jobDate: true, excludeCancelled: true }) },
    { $lookup: { from: "returns", localField: "_id", foreignField: "jobId", pipeline: [{ $match: { voidedAt: null } }, { $project: { date: 1 } }], as: "r" } },
    { $match: { "r.0": { $exists: true } } },
    { $lookup: { from: "clients", localField: "clientId", foreignField: "_id", pipeline: [{ $project: { name: 1 } }], as: "c" } },
    { $sort: { jobDate: -1, jobNumber: -1 } },
    { $project: { jobNumber: 1, clientId: 1, clientName: { $first: "$c.name" }, jobDate: 1, status: 1, first: { $min: "$r.date" }, last: { $max: "$r.date" }, n: { $size: "$r" } } },
  ]);
  return rows.map((r) => {
    const jobDate = dayOf(r.jobDate);
    const first = dayOf(r.first);
    const last = dayOf(r.last);
    return {
      jobId: r.id,
      jobNumber: r.jobNumber,
      clientId: r.clientId,
      clientName: r.clientName,
      jobDate,
      status: r.status,
      firstReturnDate: first,
      lastReturnDate: last,
      returns: r.n,
      daysToFirst: diffDays(first, jobDate),
      daysToComplete: r.status === "COMPLETED" ? diffDays(last, jobDate) : null,
    };
  });
}
