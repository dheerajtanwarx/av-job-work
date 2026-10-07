import { withEdited } from "../lib/audit.js";
import { db, type Client, type Filter, type Job, type Return, type SubBill } from "@av/db";
import type { PipelineStage } from "mongoose";
import {
  AGING_BUCKETS,
  agingBucket,
  diffDays,
  formatDate,
  formatINR,
  formatQty,
  LONG_HOLD_DAYS,
  meanOf,
  monthsBack,
  monthSpan,
  OPEN_JOB_STATUSES,
  parseAmountQuery,
  percent,
  roundQty,
  sumTotals,
  type AttentionItem,
  type ClientSummary,
  type Dashboard,
  type DashboardCharts,
  type DashboardV2,
  type JobStatus,
  type PaymentPolicy,
  type QtyByUnit,
  type SearchResultsV2,
  type Unit,
} from "@av/shared";
import { parseSearchDate, toDate, today, todayUTC } from "../lib/dates.js";
import { notFound } from "../lib/http.js";
import { challansOutside, completionRows, jobMoney, materialHolders, pendingByDesign, periodMoney, quantityMismatches, returnLines, workerMoney, workGrouped, type JobMoneyRow } from "./analytics.js";
import { getUnpaid, listMainBills, listSubBills, moneySummary } from "./billing.js";
import { loadJobs, summarizeJobItems, toJobRow } from "./jobs.js";
import { ci as contains, roundHalfUp } from "../lib/mongo.js";
import { num, returnMoney, returnValueExpr, valueExpr } from "./ledger.js";
import { clientIdsNamed, itemIdsWhere, productIdsNamed } from "./lookups.js";
import { findPhotos, toPhotoViews } from "./photo-views.js";
import { loadReturnRows } from "./return-rows.js";

// ───────────────────────── Dashboard ─────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function qtyByUnit<T extends { unit: Unit }>(rows: T[], get: (r: T) => number): QtyByUnit[] {
  const m = new Map<Unit, number>();
  for (const r of rows) m.set(r.unit, roundQty((m.get(r.unit) ?? 0) + get(r)));
  return [...m].filter(([, qty]) => qty > 0).map(([unit, qty]) => ({ unit, qty })).sort((a, b) => b.qty - a.qty);
}

/** Per-return payment state for every challan that still owes money (the only ones that can be due or overdue). */
async function unpaidReturns(jobs: JobMoneyRow[], now: string) {
  const owing = jobs.filter((j) => j.valuePaise > j.paidPaise).map((j) => j.jobId);
  const money = await returnMoney(db, owing, now);
  const open = [...money.values()].filter((m) => m.outstandingPaise > 0);
  type Info = { id: string; returnNumber: string; job: { id: string; jobNumber: string; productId: string; client: { id: string; name: string } } };
  const info = (
    await db.return.find<Info>(
      { _id: { $in: open.map((m) => m.returnId) } },
      { select: "returnNumber jobId", populate: { path: "job", select: "jobNumber productId clientId", populate: { path: "client", select: "name" } } },
    )
  ).map((r) => ({ id: r.id, returnNumber: r.returnNumber, job: { id: r.job.id, jobNumber: r.job.jobNumber, productId: r.job.productId, client: { id: r.job.client.id, name: r.job.client.name } } }));
  const byId = new Map(info.map((r) => [r.id, r]));
  return open
    .map((m) => ({ ...m, ret: byId.get(m.returnId)! }))
    .filter((m) => m.ret)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.date.localeCompare(b.date));
}

export type UnpaidReturn = Awaited<ReturnType<typeof unpaidReturns>>[number];
export { unpaidReturns };

export async function getDashboard(range: { from?: string; to?: string } = {}): Promise<DashboardV2> {
  const now = today();
  const ranged = !!(range.from || range.to);
  const [holders, outside, allOutside, designRows, jm, period, mismatches, arrivals, photos, counts, activeClients, recentReturns, recentSubBills, recentJobs] = await Promise.all([
    materialHolders({}, now),
    challansOutside({}, now),
    challansOutside({}, now, { includeCancelled: true }),
    pendingByDesign(),
    jobMoney({}, now),
    ranged ? periodMoney(range, now) : Promise.resolve(null),
    quantityMismatches(),
    returnLines({ date: now }, now, "day", { skip: 0, take: 30 }),
    db.return.distinct("_id", { voidedAt: { $ne: null } }).then((voided) => findPhotos(db, { voidedAt: null, returnId: { $nin: voided } }, { sort: { createdAt: -1 }, limit: 12 })),
    db.job.aggregate<{ id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    db.job.distinct("clientId", { status: { $in: ["IN_PROGRESS", "PARTIALLY_RECEIVED"] } }),
    db.return.find<Return & { job: { id: string; jobNumber: string; client: { name: string } } }>(
      { voidedAt: null },
      { sort: { createdAt: -1 }, limit: 5, populate: { path: "job", select: "jobNumber clientId", populate: { path: "client", select: "name" } } },
    ),
    db.subBill.find<SubBill & { client: { name: string } }>({ voidedAt: null }, { sort: { createdAt: -1 }, limit: 5, populate: { path: "client", select: "name" } }),
    db.job.find<Job & { client: { name: string } }>({}, { sort: { createdAt: -1 }, limit: 5, select: "jobNumber clientId createdAt", populate: { path: "client", select: "name" } }),
  ]);
  const count = (s: string) => counts.find((c) => c.id === s)?.n ?? 0;
  const activeJobs = count("IN_PROGRESS") + count("PARTIALLY_RECEIVED");

  // Legacy figures (kept exactly as before).
  const overdueJobs = await loadJobs(db, { status: { $in: ["IN_PROGRESS", "PARTIALLY_RECEIVED"] }, expectedReturnDate: { $lt: toDate(now) } });
  const overdue = overdueJobs.map((j) => toJobRow(j, undefined, now)).filter((r) => r.overdue);
  const clients = new Map<string, Dashboard["clientsPending"][number]>();
  for (const o of allOutside) {
    const c = clients.get(o.clientId) ?? { clientId: o.clientId, clientName: o.clientName, jobs: 0, pending: 0, pendingValuePaise: 0 };
    c.jobs++;
    c.pending = roundQty(c.pending + o.pending);
    c.pendingValuePaise += o.pendingValuePaise;
    clients.set(o.clientId, c);
  }
  const workers = workerMoney(jm);
  const moneyTotals = {
    completedValuePaise: jm.reduce((s, j) => s + j.valuePaise, 0),
    paidPaise: jm.reduce((s, j) => s + j.paidPaise, 0),
    toPayPaise: workers.reduce((s, w) => s + w.outstandingPaise, 0),
  };

  const recentActivity: Dashboard["recentActivity"] = [
    ...recentReturns.map((r) => ({
      type: "return",
      at: r.createdAt.toISOString(),
      text: `${formatQty(roundQty(r.lines.reduce((s, l) => s + num(l.okQty) + num(l.damagedQty) + num(l.rejectedQty) + num(l.lostQty), 0)))} received on ${r.job.jobNumber} from ${r.job.client.name}`,
      href: `/returns/${r.id}`,
    })),
    ...recentSubBills.map((b) => ({
      type: "payment",
      at: b.createdAt.toISOString(),
      text: `${formatINR(b.amountPaise)} paid to ${b.client.name} (${b.billNumber})`,
      href: `/bills/sub/${b.id}`,
    })),
    ...recentJobs.map((j) => ({ type: "job", at: j.createdAt.toISOString(), text: `${j.jobNumber} created for ${j.client.name}`, href: `/jobs/${j.id}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  // Payment state per return.
  const unpaid = await unpaidReturns(jm, now);
  const overduePay = unpaid.filter((u) => u.overdueDays > 0);
  const dueToday = unpaid.filter((u) => u.dueDate === now);

  // Attention required.
  const attention: AttentionItem[] = [];
  const push = (a: AttentionItem) => a.count > 0 && attention.push(a);
  push({
    kind: "overdue-challans",
    label: `${plural(overdue.length, "challan")} past expected return`,
    hint: "Material still outside after the expected return date",
    count: overdue.length,
    tone: "danger",
    href: overdue.length === 1 ? `/jobs/${overdue[0].id}` : "/jobs?status=overdue",
    records: overdue.slice(0, 5).map((j) => ({ label: `${j.jobNumber} · ${j.client.name}`, sub: `Expected ${formatDate(j.expectedReturnDate)} · ${formatQty(j.totals.pending)} ${j.unit} pending`, href: `/jobs/${j.id}` })),
  });
  push({
    kind: "overdue-payments",
    label: `${formatINR(overduePay.reduce((s, u) => s + u.outstandingPaise, 0))} payments overdue`,
    hint: "Returns not fully paid after their due date",
    count: overduePay.length,
    amountPaise: overduePay.reduce((s, u) => s + u.outstandingPaise, 0),
    tone: "danger",
    href: overduePay.length === 1 ? `/returns/${overduePay[0].returnId}` : "/reports?report=payment-aging",
    records: overduePay.slice(0, 5).map((u) => ({ label: `${u.ret.returnNumber} · ${u.ret.job.client.name}`, sub: `${u.overdueDays} days overdue · due ${formatDate(u.dueDate)}`, href: `/returns/${u.returnId}`, amountPaise: u.outstandingPaise })),
  });
  const longHeld = holders.filter((h) => h.daysOutside >= LONG_HOLD_DAYS);
  const longWorkers = [...new Map(longHeld.map((h) => [h.clientId, h])).values()];
  push({
    kind: "long-held-material",
    label: `${plural(longWorkers.length, "worker")} holding material ${LONG_HOLD_DAYS}+ days`,
    hint: `Material issued ${LONG_HOLD_DAYS} or more days ago and still outside`,
    count: longWorkers.length,
    tone: "attention",
    href: longWorkers.length === 1 ? `/clients/${longWorkers[0].clientId}` : "/reports?report=material-outside",
    records: longHeld.slice(0, 5).map((h) => ({ label: `${h.clientName} · ${h.materialName}`, sub: `${formatQty(h.qty)} ${h.unit} · ${h.daysOutside} days`, href: `/clients/${h.clientId}`, amountPaise: h.valuePaise })),
  });
  push({
    kind: "payments-due-today",
    label: `${formatINR(dueToday.reduce((s, u) => s + u.outstandingPaise, 0))} due today`,
    hint: "Returns whose payment falls due today",
    count: dueToday.length,
    amountPaise: dueToday.reduce((s, u) => s + u.outstandingPaise, 0),
    tone: "warning",
    href: dueToday.length === 1 ? `/returns/${dueToday[0].returnId}` : "/reports?report=payment-aging",
    records: dueToday.slice(0, 5).map((u) => ({ label: `${u.ret.returnNumber} · ${u.ret.job.client.name}`, sub: u.ret.job.jobNumber, href: `/returns/${u.returnId}`, amountPaise: u.outstandingPaise })),
  });
  const expectedToday = outside.filter((o) => o.expectedReturnDate === now && (o.status === "IN_PROGRESS" || o.status === "PARTIALLY_RECEIVED"));
  push({
    kind: "expected-today",
    label: `${plural(expectedToday.length, "challan")} expected back today`,
    hint: "Expected return date is today and material is still outside",
    count: expectedToday.length,
    tone: "warning",
    href: expectedToday.length === 1 ? `/jobs/${expectedToday[0].jobId}` : "/reports?report=challan-aging",
    records: expectedToday.slice(0, 5).map((o) => ({ label: `${o.jobNumber} · ${o.clientName}`, sub: `${formatQty(o.pending)} ${o.units > 1 ? "mixed units" : o.unit} pending`, href: `/jobs/${o.jobId}` })),
  });
  const mismatchJobs = [...new Map(mismatches.map((m) => [m.jobId, m])).values()];
  push({
    kind: "quantity-mismatch",
    label: `${plural(mismatchJobs.length, "challan")} with more returned than issued`,
    hint: "Returned + damaged + rejected + lost is more than was issued on a design line",
    count: mismatchJobs.length,
    tone: "attention",
    href: mismatchJobs.length === 1 ? `/jobs/${mismatchJobs[0].jobId}` : `/jobs/${mismatchJobs[0]?.jobId ?? ""}`,
    records: mismatches.slice(0, 5).map((m) => ({ label: `${m.jobNumber} · ${m.clientName}`, sub: `${m.designName}: ${formatQty(m.excess)} ${m.unit} over`, href: `/jobs/${m.jobId}` })),
  });
  const advances = jm.filter((j) => j.paidPaise > j.valuePaise).sort((a, b) => b.paidPaise - b.valuePaise - (a.paidPaise - a.valuePaise));
  push({
    kind: "advances",
    label: `${formatINR(advances.reduce((s, j) => s + j.paidPaise - j.valuePaise, 0))} paid ahead of work`,
    hint: "Challans where payments exceed the job work value received",
    count: advances.length,
    amountPaise: advances.reduce((s, j) => s + j.paidPaise - j.valuePaise, 0),
    tone: "attention",
    href: advances.length === 1 ? `/jobs/${advances[0].jobId}` : "/reports?report=payment-outstanding",
    records: advances.slice(0, 5).map((j) => ({ label: `${j.jobNumber} · ${j.clientName}`, sub: `Paid ${formatINR(j.paidPaise)} for ${formatINR(j.valuePaise)} of work`, href: `/jobs/${j.jobId}`, amountPaise: j.paidPaise - j.valuePaise })),
  });

  const holderClients = new Set(holders.map((h) => h.clientId));
  for (const c of activeClients) holderClients.add(c);

  return {
    ops: {
      activeJobs,
      draftJobs: count("DRAFT"),
      piecesOutside: roundQty(allOutside.reduce((s, o) => s + o.pending, 0)),
      overdueJobs: overdue.length,
      clientsWithPending: clients.size,
    },
    money: moneyTotals,
    overdue: overdue.sort((a, b) => (a.expectedReturnDate ?? "").localeCompare(b.expectedReturnDate ?? "")),
    clientsPending: [...clients.values()].sort((a, b) => b.pending - a.pending),
    designsPending: designRows,
    toPay: workers
      .filter((w) => w.outstandingPaise > 0)
      .map((w) => ({ clientId: w.clientId, clientName: w.clientName, qty: w.jobsOutstanding, valuePaise: w.outstandingPaise }))
      .sort((a, b) => b.valuePaise - a.valuePaise),
    recentActivity,
    today: now,
    range: { from: range.from ?? null, to: range.to ?? null },
    kpis: {
      activeWorkers: holderClients.size,
      activeChallans: activeJobs,
      materialOutside: qtyByUnit(holders, (h) => h.qty),
      materialValueOutsidePaise: holders.reduce((s, h) => s + h.valuePaise, 0),
      workValuePaise: period ? period.valuePaise : moneyTotals.completedValuePaise,
      paidPaise: period ? period.paidPaise : moneyTotals.paidPaise,
      outstandingPaise: moneyTotals.toPayPaise,
      advancePaise: workers.reduce((s, w) => s + w.advancePaise, 0),
      overduePayments: { amountPaise: overduePay.reduce((s, u) => s + u.outstandingPaise, 0), count: overduePay.length },
      overdueChallans: overdue.length,
    },
    attention,
    materialHolders: holders,
    todayReturns: arrivals.rows,
    recentPhotos: await toPhotoViews(db, photos),
  };
}

// ───────────────────────── Charts ─────────────────────────

export async function getCharts(range: { from?: string; to?: string } = {}): Promise<DashboardCharts> {
  const now = today();
  const from = range.from ?? monthsBack(now, 12);
  const to = range.to ?? now;
  const f = { from, to };
  const inRange = { voidedAt: null, date: { $gte: toDate(from), $lte: toDate(to) } };
  // Each line with its challan design line (unit, design, effective job work type).
  const withItem: PipelineStage[] = [
    { $lookup: { from: "jobs", localField: "jobId", foreignField: "_id", pipeline: [{ $project: { jobWorkTypeId: 1, items: 1 } }], as: "j" } },
    { $unwind: "$j" },
    { $unwind: "$lines" },
    { $set: { item: { $first: { $filter: { input: "$j.items", as: "i", cond: { $eq: ["$$i._id", "$lines.jobItemId"] } } } } } },
  ];
  const month = { $dateToString: { format: "%Y-%m", date: "$date", timezone: "UTC" } };
  const [issued, returned, holders, monthlyWork, monthlyPaid, jm, outside, completion, quality, byDesignRaw, byTypeRaw] = await Promise.all([
    db.dispatch.aggregate<{ unit: string; q: number }>([
      { $match: inRange },
      ...withItem,
      { $group: { _id: "$item.unit", q: { $sum: "$lines.qty" } } },
      { $project: { _id: 0, unit: "$_id", q: 1 } },
    ]),
    db.return.aggregate<{ unit: string; ok: number; ex: number }>([
      { $match: inRange },
      ...withItem,
      { $group: { _id: "$item.unit", ok: { $sum: "$lines.okQty" }, ex: { $sum: { $add: ["$lines.damagedQty", "$lines.rejectedQty", "$lines.lostQty"] } } } },
      { $project: { _id: 0, unit: "$_id", ok: 1, ex: 1 } },
    ]),
    materialHolders({}, now),
    db.return.aggregate<{ month: string; value: number }>([
      { $match: inRange },
      { $group: { _id: month, value: { $sum: returnValueExpr() } } },
      { $project: { _id: 0, month: "$_id", value: 1 } },
    ]),
    db.subBill.aggregate<{ month: string; paid: number }>([
      { $match: inRange },
      { $group: { _id: month, paid: { $sum: "$amountPaise" } } },
      { $project: { _id: 0, month: "$_id", paid: 1 } },
    ]),
    jobMoney({}, now),
    challansOutside({}, now),
    completionRows(f, now),
    workGrouped("worker", f, now),
    db.return.aggregate<{ id: string | null; designName: string; value: number }>([
      { $match: inRange },
      ...withItem,
      { $group: { _id: "$item.designId", designName: { $min: "$item.designName" }, value: { $sum: valueExpr() } } },
    ]),
    db.return.aggregate<{ id: string | null; value: number }>([
      { $match: inRange },
      ...withItem,
      { $group: { _id: { $ifNull: ["$item.jobWorkTypeId", "$j.jobWorkTypeId"] }, value: { $sum: valueExpr() } } },
    ]),
  ]);
  const designNames = new Map((await db.design.find({ _id: { $in: byDesignRaw.map((r) => r.id) } }, { select: "name" })).map((d) => [d.id, d.name]));
  const typeNames = new Map((await db.jobWorkType.find({ _id: { $in: byTypeRaw.map((r) => r.id) } }, { select: "name" })).map((t) => [t.id, t.name]));
  const byValue = (a: { value: number }, b: { value: number }) => b.value - a.value;
  const byDesign = byDesignRaw.map((r) => ({ id: r.id, name: (r.id && designNames.get(r.id)) ?? r.designName, value: r.value })).sort(byValue);
  const byType = byTypeRaw.map((r) => ({ id: r.id, name: r.id ? (typeNames.get(r.id) ?? null) : null, value: r.value })).sort(byValue);

  const units = new Set<string>([...issued.map((r) => r.unit), ...returned.map((r) => r.unit), ...holders.map((h) => h.unit)]);
  const materialFlow = [...units].map((unit) => ({
    unit: unit as Unit,
    issued: roundQty(issued.find((r) => r.unit === unit)?.q ?? 0),
    returned: roundQty(returned.find((r) => r.unit === unit)?.ok ?? 0),
    exceptions: roundQty(returned.find((r) => r.unit === unit)?.ex ?? 0),
    pending: roundQty(holders.filter((h) => h.unit === unit).reduce((s, h) => s + h.qty, 0)),
  }));

  const months = monthSpan(from, to);
  const workerPending = new Map<string, DashboardCharts["workerPending"][number]>();
  for (const h of holders) {
    const k = `${h.clientId}:${h.unit}`;
    const w = workerPending.get(k) ?? { clientId: h.clientId, clientName: h.clientName, unit: h.unit, pending: 0 };
    w.pending = roundQty(w.pending + h.qty);
    workerPending.set(k, w);
  }

  const aging = AGING_BUCKETS.map((bucket) => ({ bucket, challans: 0, rows: [] as typeof outside, valuePaise: 0 }));
  for (const o of outside) {
    const b = aging.find((a) => a.bucket === agingBucket(Math.max(0, diffDays(now, o.jobDate))))!;
    b.challans++;
    b.rows.push(o);
    b.valuePaise += o.pendingValuePaise;
  }

  const completionByWorker = new Map<string, { clientId: string; clientName: string; days: number[] }>();
  for (const c of completion) {
    if (c.daysToComplete === null) continue;
    const w = completionByWorker.get(c.clientId) ?? { clientId: c.clientId, clientName: c.clientName, days: [] };
    w.days.push(c.daysToComplete);
    completionByWorker.set(c.clientId, w);
  }

  const qualityByWorker = new Map<string, { clientId: string; clientName: string; ok: number; dl: number; rej: number }>();
  for (const g of quality) {
    if (!g.key) continue;
    const w = qualityByWorker.get(g.key) ?? { clientId: g.key, clientName: g.name, ok: 0, dl: 0, rej: 0 };
    w.ok += g.ok;
    w.dl += g.damaged + g.lost;
    w.rej += g.rejected;
    qualityByWorker.set(g.key, w);
  }

  return {
    range: { from, to },
    materialFlow: materialFlow.sort((a, b) => b.issued + b.pending - (a.issued + a.pending)),
    monthlyWork: months.map((month) => ({ month, valuePaise: Math.round(monthlyWork.find((m) => m.month === month)?.value ?? 0) })),
    monthlyPayments: months.map((month) => ({ month, paidPaise: Math.round(monthlyPaid.find((m) => m.month === month)?.paid ?? 0) })),
    workerOutstanding: workerMoney(jm)
      .filter((w) => w.outstandingPaise > 0)
      .sort((a, b) => b.outstandingPaise - a.outstandingPaise)
      .map((w) => ({ clientId: w.clientId, clientName: w.clientName, outstandingPaise: w.outstandingPaise })),
    workerPending: [...workerPending.values()].sort((a, b) => b.pending - a.pending),
    challanAging: aging.map((a) => ({ bucket: a.bucket, challans: a.challans, pending: qtyByUnit(a.rows, (r) => (r.units > 1 ? 0 : r.pending)), valuePaise: a.valuePaise })),
    completionDays: [...completionByWorker.values()]
      .map((w) => ({ clientId: w.clientId, clientName: w.clientName, avgDays: meanOf(w.days) ?? 0, challans: w.days.length }))
      .sort((a, b) => b.avgDays - a.avgDays),
    defects: [...qualityByWorker.values()]
      .map((w) => {
        const accounted = roundQty(w.ok + w.dl + w.rej);
        return { clientId: w.clientId, clientName: w.clientName, defectPct: percent(w.dl, accounted) ?? 0, rejectionPct: percent(w.rej, accounted) ?? 0, accounted };
      })
      .filter((w) => w.accounted > 0)
      .sort((a, b) => b.defectPct + b.rejectionPct - (a.defectPct + a.rejectionPct)),
    byDesign: byDesign.map((d) => ({ designId: d.id, designName: d.name, valuePaise: Math.round(d.value) })).filter((d) => d.valuePaise > 0),
    byJobWorkType: byType.map((t) => ({ jobWorkTypeId: t.id, name: t.name ?? "No job work type", valuePaise: Math.round(t.value) })).filter((t) => t.valuePaise > 0),
  };
}


// ───────────────────────── Pending material ─────────────────────────

export interface PendingMaterialRow {
  jobId: string;
  jobNumber: string;
  jobStatus: JobStatus;
  jobDate: string;
  expectedReturnDate: string | null;
  overdue: boolean;
  daysOut: number;
  clientId: string;
  clientName: string;
  productName: string;
  designName: string;
  sent: number;
  received: number;
  exceptions: number;
  pending: number;
  pendingValuePaise: number;
}

export async function pendingMaterial(filter: { clientId?: string; designId?: string; onlyPending?: boolean }) {
  // Completed challans have nothing pending, so only the rest are loaded.
  const jobs = await loadJobs(db, { clientId: filter.clientId, status: { $ne: "COMPLETED" } });
  const today = todayUTC().getTime();
  const rows: PendingMaterialRow[] = [];
  for (const job of jobs) {
    const items = summarizeJobItems(job);
    const row = toJobRow(job, items);
    // Show every line of jobs with material outside (zeros included, like the brief), unless onlyPending.
    if (row.totals.pending === 0) continue;
    for (const it of items) {
      if (filter.designId && it.designId !== filter.designId) continue;
      if (filter.onlyPending && it.pending === 0) continue;
      rows.push({
        jobId: job.id,
        jobNumber: job.jobNumber,
        jobStatus: row.status,
        jobDate: row.jobDate,
        expectedReturnDate: row.expectedReturnDate,
        overdue: row.overdue,
        daysOut: Math.max(0, Math.floor((today - job.jobDate.getTime()) / 86400000)),
        clientId: job.clientId,
        clientName: job.client.name,
        productName: job.product.name,
        designName: it.designName,
        sent: it.sent,
        received: it.ok,
        exceptions: it.exceptions,
        pending: it.pending,
        pendingValuePaise: it.pendingValuePaise,
      });
    }
  }
  rows.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.jobNumber.localeCompare(b.jobNumber));
  return {
    rows,
    totals: rows.reduce(
      (t, r) => ({ sent: t.sent + r.sent, received: t.received + r.received, exceptions: t.exceptions + r.exceptions, pending: t.pending + r.pending, pendingValuePaise: t.pendingValuePaise + r.pendingValuePaise }),
      { sent: 0, received: 0, exceptions: 0, pending: 0, pendingValuePaise: 0 },
    ),
  };
}

// ───────────────────────── Client summary ─────────────────────────

export interface ClientSummaryRow {
  clientId: string;
  clientName: string;
  isActive: boolean;
  jobs: number;
  activeJobs: number;
  sent: number;
  received: number;
  exceptions: number;
  pending: number;
  completedValuePaise: number;
  paidPaise: number;
  toPayPaise: number;
}

export async function clientSummaryReport(filter: { includeInactive?: boolean } = {}) {
  const [clients, jobs, paid] = await Promise.all([
    db.client.find(filter.includeInactive ? {} : { isActive: true }, { sort: { name: 1 } }),
    loadJobs(db),
    db.subBill.aggregate<{ id: string; paid: number }>([{ $match: { voidedAt: null } }, { $group: { _id: "$clientId", paid: { $sum: "$amountPaise" } } }]),
  ]);
  const map = new Map<string, ClientSummaryRow>(
    clients.map((c) => [
      c.id,
      { clientId: c.id, clientName: c.name, isActive: c.isActive, jobs: 0, activeJobs: 0, sent: 0, received: 0, exceptions: 0, pending: 0, completedValuePaise: 0, paidPaise: 0, toPayPaise: 0 },
    ]),
  );
  for (const job of jobs) {
    const r = map.get(job.clientId);
    if (!r) continue;
    const t = sumTotals(summarizeJobItems(job));
    r.jobs++;
    if (OPEN_JOB_STATUSES.includes(job.status as JobStatus) && job.status !== "DRAFT") r.activeJobs++;
    r.sent = roundQty(r.sent + t.sent);
    r.received = roundQty(r.received + t.ok);
    r.exceptions = roundQty(r.exceptions + t.exceptions);
    r.pending = roundQty(r.pending + t.pending);
    r.completedValuePaise += t.completedValuePaise;
  }
  for (const p of paid) {
    const r = map.get(p.id);
    if (r) r.paidPaise += p.paid;
  }
  for (const r of map.values()) r.toPayPaise = Math.max(0, r.completedValuePaise - r.paidPaise);
  const rows = [...map.values()];
  const totals = rows.reduce(
    (t, r) => {
      for (const k of ["jobs", "activeJobs", "sent", "received", "exceptions", "pending", "completedValuePaise", "paidPaise", "toPayPaise"] as const) t[k] += r[k];
      return t;
    },
    { jobs: 0, activeJobs: 0, sent: 0, received: 0, exceptions: 0, pending: 0, completedValuePaise: 0, paidPaise: 0, toPayPaise: 0 },
  );
  return { rows, totals };
}

// ───────────────────────── Payments report ─────────────────────────

export async function paymentsReport(filter: { from?: Date; to?: Date; clientId?: string }) {
  const match: Filter = { voidedAt: null };
  if (filter.clientId) match.jobId = { $in: await db.job.distinct("_id", { clientId: filter.clientId }) };
  if (filter.from || filter.to) match.date = { ...(filter.from && { $gte: filter.from }), ...(filter.to && { $lte: filter.to }) };
  const [subBills, workRows] = await Promise.all([
    listSubBills({ clientId: filter.clientId, from: filter.from, to: filter.to }),
    db.return.aggregate<{ ok: number; value: number }>([
      { $match: match },
      { $unwind: "$lines" },
      { $group: { _id: null, ok: { $sum: "$lines.okQty" }, value: { $sum: valueExpr() } } },
    ]),
  ]);
  const work = workRows[0] ?? { ok: 0, value: 0 };
  const active = subBills.filter((b) => !b.voidedAt);
  return {
    rows: subBills,
    summary: {
      completedPieces: roundQty(work.ok),
      completedValuePaise: Math.round(work.value),
      subBillCount: active.length,
      voidedCount: subBills.length - active.length,
      paidPieces: roundQty(active.reduce((s, b) => s + b.qty, 0)),
      paidPaise: active.reduce((s, b) => s + b.amountPaise, 0),
    },
  };
}

// ───────────────────────── To pay ─────────────────────────

/** Returned OK pieces that haven't been paid for yet, line by line and per job worker. */
export async function toPayReport(filter: { clientId?: string }) {
  const rows = await getUnpaid(db, { clientId: filter.clientId });
  const byClient = new Map<string, { clientId: string; clientName: string; jobs: Set<string>; qty: number; valuePaise: number }>();
  for (const r of rows) {
    const c = byClient.get(r.clientId) ?? { clientId: r.clientId, clientName: r.clientName, jobs: new Set<string>(), qty: 0, valuePaise: 0 };
    c.jobs.add(r.jobId);
    c.qty += r.unbilledQty;
    c.valuePaise += r.unbilledValuePaise;
    byClient.set(r.clientId, c);
  }
  return {
    rows,
    byClient: [...byClient.values()].map(({ jobs, ...c }) => ({ ...c, jobs: jobs.size })).sort((a, b) => b.valuePaise - a.valuePaise),
    totals: { jobs: new Set(rows.map((r) => r.jobId)).size, qty: rows.reduce((s, r) => s + r.unbilledQty, 0), valuePaise: rows.reduce((s, r) => s + r.unbilledValuePaise, 0) },
  };
}

// ───────────────────────── Client profile ─────────────────────────

export async function clientProfile(clientId: string): Promise<ClientSummary> {
  const client = await db.client.findById(clientId);
  if (!client) throw notFound("Client");
  const [jobs, subBills, mainBills, money, returns] = await Promise.all([
    loadJobs(db, { clientId }),
    listSubBills({ clientId }),
    listMainBills({ clientId }),
    moneySummary(db, clientId),
    db.job
      .distinct("_id", { clientId })
      .then((jobIds) => db.return.find<Return & { job: { id: string; jobNumber: string } }>({ jobId: { $in: jobIds } }, { populate: { path: "job", select: "jobNumber" } })),
  ]);
  const jobRows = jobs.map((j) => toJobRow(j));
  const all = sumTotals(jobRows.map((r) => r.totals));

  const timeline: ClientSummary["timeline"] = [];
  for (const j of jobs) {
    const t = jobRows.find((r) => r.id === j.id)!.totals;
    timeline.push({ at: j.createdAt.toISOString(), date: j.jobDate.toISOString(), type: "job", text: `${j.jobNumber} created – ${t.quantity} ${j.product.name}`, href: `/jobs/${j.id}`, amountPaise: t.expectedValuePaise });
    if (j.completedAt && j.status === "COMPLETED") timeline.push({ at: j.completedAt.toISOString(), date: j.completedAt.toISOString(), type: "completed", text: `${j.jobNumber} completed`, href: `/jobs/${j.id}` });
    if (j.cancelledAt) timeline.push({ at: j.cancelledAt.toISOString(), date: j.cancelledAt.toISOString(), type: "cancelled", text: `${j.jobNumber} cancelled`, href: `/jobs/${j.id}` });
  }
  for (const r of returns) {
    const qty = roundQty(r.lines.reduce((s, l) => s + num(l.okQty) + num(l.damagedQty) + num(l.rejectedQty) + num(l.lostQty), 0));
    timeline.push({ at: r.receivedAt.toISOString(), date: r.date.toISOString(), type: r.voidedAt ? "void" : "return", text: `${r.returnNumber}: ${formatQty(qty)} received on ${r.job.jobNumber}${r.voidedAt ? " (voided)" : ""}`, href: `/returns/${r.id}` });
  }
  for (const b of subBills) {
    timeline.push({ at: b.date, date: b.date, type: b.voidedAt ? "void" : "payment", text: `Paid ${b.billNumber} on ${b.job.jobNumber}${b.voidedAt ? " (voided)" : ""}`, href: `/bills/sub/${b.id}`, amountPaise: b.amountPaise });
  }
  for (const m of mainBills) {
    if (m.cancelledAt) continue;
    timeline.push({ at: m.date, date: m.date, type: "main_bill", text: `Final settlement ${m.billNumber} – ${m.job.jobNumber} fully paid`, href: `/bills/main/${m.id}`, amountPaise: m.totalPaise });
  }
  timeline.sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || b.at.localeCompare(a.at));

  return {
    client: { ...(await withEdited(db, [client]))[0], paymentPolicy: client.paymentPolicy as PaymentPolicy | null, createdAt: client.createdAt.toISOString() },
    totals: {
      jobs: jobs.length,
      activeJobs: jobRows.filter((r) => r.status === "IN_PROGRESS" || r.status === "PARTIALLY_RECEIVED").length,
      completedJobs: jobRows.filter((r) => r.status === "COMPLETED").length,
      sent: all.sent,
      received: all.ok,
      exceptions: all.exceptions,
      pending: all.pending,
      ...money,
    },
    jobs: jobRows,
    subBills,
    mainBills,
    timeline,
  };
}

// ───────────────────────── Search ─────────────────────────

const emptySearch = (): SearchResultsV2 => ({ clients: [], jobs: [], bills: [], products: [], designs: [], returns: [], materials: [], matchedAmountPaise: null, matchedDate: null });

/**
 * Global search (spec §48): workers (name, code, phone, alternate phone), challans, return numbers, payment
 * vouchers (number, reference), products, designs, materials (name, code, lot, roll), a date ("04 Oct",
 * 04/10/2026) and an amount ("2000", "₹2,000") matching vouchers and returns of exactly that amount.
 */
export async function search(q: string): Promise<SearchResultsV2> {
  const term = q.trim();
  if (!term) return emptySearch();
  const ci = contains(term);
  const date = parseSearchDate(term);
  const amount = parseAmountQuery(term);
  const digits = term.replace(/\D/g, "");
  const phone = digits.length >= 5 && /^[\d\s+()-]+$/.test(term) ? { $regex: digits } : null;

  // Returns whose value is exactly the amount typed (value is derived, so it is matched in the pipeline).
  const amountReturnIds = amount
    ? (
        await db.return.aggregate<{ id: string }>([
          { $match: { voidedAt: null, "lines.0": { $exists: true } } },
          { $project: { receivedAt: 1, value: roundHalfUp(returnValueExpr()) } },
          { $match: { value: amount } },
          { $sort: { receivedAt: -1 } },
          { $limit: 6 },
          { $project: { _id: 1 } },
        ])
      ).map((r) => r.id)
    : [];
  const [nameClientIds, nameProductIds, designItemIds] = await Promise.all([clientIdsNamed(db, term), productIdsNamed(db, term), itemIdsWhere(db, { designName: ci })]);

  const [clients, jobs, subBills, mainBills, products, designs, returns, materials] = await Promise.all([
    db.client.find<Client>(
      { $or: [{ name: ci }, { businessName: ci }, { phone: ci }, { alternatePhone: ci }, { workerCode: ci }, { gstin: ci }, ...(phone ? [{ phone }, { alternatePhone: phone }] : [])] },
      { limit: 8, sort: { name: 1 } },
    ),
    db.job.find<Job & { client: { name: string }; product: { name: string } }>(
      {
        $or: [
          { jobNumber: ci },
          { clientId: { $in: nameClientIds } },
          { productId: { $in: nameProductIds } },
          { "items._id": { $in: designItemIds } },
          { notes: ci },
          ...(date ? [{ jobDate: date }] : []),
        ],
      },
      { populate: [{ path: "client", select: "name" }, { path: "product", select: "name" }], sort: { jobDate: -1 }, limit: 10 },
    ),
    db.subBill.find<SubBill & { client: { name: string } }>(
      { $or: [{ billNumber: ci }, { reference: ci }, { clientId: { $in: nameClientIds } }, ...(date ? [{ date }] : []), ...(amount ? [{ amountPaise: amount }] : [])] },
      { populate: { path: "client", select: "name" }, sort: { date: -1 }, limit: 6 },
    ),
    db.job.distinct("_id", { jobNumber: ci }).then((jobIds) =>
      db.mainBill.find<import("@av/db").MainBill & { client: { name: string } }>(
        { $or: [{ billNumber: ci }, { clientId: { $in: nameClientIds } }, { jobId: { $in: jobIds } }, ...(date ? [{ date }] : []), ...(amount ? [{ totalPaise: amount }] : [])] },
        { populate: { path: "client", select: "name" }, sort: { date: -1 }, limit: 4 },
      ),
    ),
    db.product.find({ $or: [{ name: ci }, { code: ci }] }, { limit: 5 }),
    db.design.find({ $or: [{ name: ci }, { code: ci }] }, { limit: 5 }),
    db.return.find<{ id: string }>(
      { $or: [{ returnNumber: ci }, ...(date ? [{ date }] : []), ...(amountReturnIds.length ? [{ _id: { $in: amountReturnIds } }] : [])] },
      { select: "_id", sort: { date: -1, receivedAt: -1 }, limit: 8 },
    ),
    db.material.find({ $or: [{ name: ci }, { code: ci }, { lotNumber: ci }, { rollNumber: ci }] }, { limit: 6, sort: { name: 1 } }),
  ]);
  const returnRows = returns.length ? await loadReturnRows(db, { _id: { $in: returns.map((r) => r.id) } }, today(), { sort: { date: -1, receivedAt: -1 } }) : [];

  return {
    clients: clients.map((c) => ({ id: c.id, name: c.name, sub: [c.workerCode, c.businessName ?? c.phone].filter(Boolean).join(" · ") || null })),
    jobs: jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, clientName: j.client.name, productName: j.product.name, status: j.status as JobStatus, jobDate: j.jobDate.toISOString() })),
    bills: [
      ...mainBills.map((m) => ({ id: m.id, kind: "main" as const, billNumber: m.billNumber, clientName: m.client.name, amountPaise: m.totalPaise, date: m.date.toISOString() })),
      ...subBills.map((b) => ({ id: b.id, kind: "sub" as const, billNumber: b.billNumber, clientName: b.client.name, amountPaise: b.amountPaise, date: b.date.toISOString() })),
    ],
    products: products.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    designs: designs.map((d) => ({ id: d.id, name: d.name, code: d.code })),
    returns: returnRows.map((r) => ({ id: r.id, returnNumber: r.returnNumber, clientName: r.client.name, jobNumber: r.job.jobNumber, date: r.date, receivedAt: r.receivedAt, valuePaise: r.valuePaise, voided: !!r.voidedAt })),
    materials: materials.map((m) => ({ id: m.id, name: m.name, code: m.code, unit: m.unit as Unit, lotNumber: m.lotNumber, rollNumber: m.rollNumber })),
    matchedAmountPaise: amount,
    matchedDate: date ? date.toISOString().slice(0, 10) : null,
  };
}

