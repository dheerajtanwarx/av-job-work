import { prisma } from "@av/db";
import { formatQty, OPEN_JOB_STATUSES, roundQty, sumTotals, type ClientSummary, type Dashboard, type JobStatus, type PaymentPolicy, type SearchResults } from "@av/shared";
import { parseSearchDate, todayUTC } from "../lib/dates.js";
import { notFound } from "../lib/http.js";
import { getUnpaid, listMainBills, listSubBills, moneySummary } from "./billing.js";
import { loadJobs, summarizeJobItems, toJobRow } from "./jobs.js";
import { num, VALUE_SQL } from "./ledger.js";

// ───────────────────────── Dashboard ─────────────────────────

export async function getDashboard(): Promise<Dashboard> {
  const [jobs, money, recentReturns, recentSubBills, recentJobs] = await Promise.all([
    loadJobs(prisma),
    moneySummary(prisma),
    prisma.return.findMany({ where: { voidedAt: null }, orderBy: { createdAt: "desc" }, take: 5, include: { lines: true, job: { select: { id: true, jobNumber: true, client: { select: { name: true } } } } } }),
    prisma.subBill.findMany({ where: { voidedAt: null }, orderBy: { createdAt: "desc" }, take: 5, include: { client: { select: { name: true } } } }),
    prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { client: { select: { name: true } } } }),
  ]);

  const clients = new Map<string, Dashboard["clientsPending"][number]>();
  const designs = new Map<string, Dashboard["designsPending"][number] & { jobIds: Set<string> }>();
  const toPay = new Map<string, Dashboard["toPay"][number] & { paid: number; value: number }>();
  const overdue = [];
  let activeJobs = 0,
    draftJobs = 0,
    piecesOutside = 0;

  for (const job of jobs) {
    const items = summarizeJobItems(job);
    const row = toJobRow(job, items);
    if (row.status === "DRAFT") draftJobs++;
    if (row.status === "IN_PROGRESS" || row.status === "PARTIALLY_RECEIVED") activeJobs++;
    if (row.overdue) overdue.push(row);
    piecesOutside = roundQty(piecesOutside + row.totals.pending);
    if (row.totals.pending > 0) {
      const c = clients.get(job.clientId) ?? { clientId: job.clientId, clientName: job.client.name, jobs: 0, pending: 0, pendingValuePaise: 0 };
      c.jobs++;
      c.pending = roundQty(c.pending + row.totals.pending);
      c.pendingValuePaise += row.totals.pendingValuePaise;
      clients.set(job.clientId, c);
    }
    for (const it of items) {
      if (it.pending > 0) {
        const d = designs.get(it.designId) ?? { designId: it.designId, designName: it.designName, jobs: 0, pending: 0, jobIds: new Set<string>() };
        d.jobIds.add(job.id);
        d.jobs = d.jobIds.size;
        d.pending = roundQty(d.pending + it.pending);
        designs.set(it.designId, d);
      }
    }
    const w = toPay.get(job.clientId) ?? { clientId: job.clientId, clientName: job.client.name, qty: 0, valuePaise: 0, paid: 0, value: 0 };
    w.value += row.money.valuePaise;
    w.paid += row.money.paidPaise;
    if (row.money.outstandingPaise > 0) w.qty++;
    toPay.set(job.clientId, w);
  }

  const recentActivity: Dashboard["recentActivity"] = [
    ...recentReturns.map((r) => ({
      type: "return",
      at: r.createdAt.toISOString(),
      text: `${formatQty(roundQty(r.lines.reduce((s, l) => s + num(l.okQty) + num(l.damagedQty) + num(l.rejectedQty) + num(l.lostQty), 0)))} received on ${r.job.jobNumber} from ${r.job.client.name}`,
      href: `/jobs/${r.job.id}`,
    })),
    ...recentSubBills.map((b) => ({
      type: "payment",
      at: b.createdAt.toISOString(),
      text: `₹${(b.amountPaise / 100).toLocaleString("en-IN")} paid to ${b.client.name} (${b.billNumber})`,
      href: `/bills/sub/${b.id}`,
    })),
    ...recentJobs.map((j) => ({ type: "job", at: j.createdAt.toISOString(), text: `${j.jobNumber} created for ${j.client.name}`, href: `/jobs/${j.id}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return {
    ops: { activeJobs, draftJobs, piecesOutside, overdueJobs: overdue.length, clientsWithPending: clients.size },
    money,
    overdue: overdue.sort((a, b) => (a.expectedReturnDate ?? "").localeCompare(b.expectedReturnDate ?? "")),
    clientsPending: [...clients.values()].sort((a, b) => b.pending - a.pending),
    designsPending: [...designs.values()].map(({ jobIds: _j, ...d }) => d).sort((a, b) => b.pending - a.pending),
    toPay: [...toPay.values()]
      .map(({ paid, value, ...w }) => ({ ...w, valuePaise: Math.max(0, value - paid) }))
      .filter((w) => w.valuePaise > 0)
      .sort((a, b) => b.valuePaise - a.valuePaise),
    recentActivity,
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
  const jobs = await loadJobs(prisma, { clientId: filter.clientId });
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
    prisma.client.findMany({ where: filter.includeInactive ? {} : { isActive: true }, orderBy: { name: "asc" } }),
    loadJobs(prisma),
    prisma.subBill.groupBy({ by: ["clientId"], where: { voidedAt: null }, _sum: { amountPaise: true } }),
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
    const r = map.get(p.clientId);
    if (r) r.paidPaise += p._sum.amountPaise ?? 0;
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
  const dateWhere = filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined;
  const [subBills, [work]] = await Promise.all([
    listSubBills({ clientId: filter.clientId, from: filter.from, to: filter.to }),
    prisma.$queryRaw<{ ok: number; value: number }[]>`
      SELECT COALESCE(SUM(rl."okQty"), 0)::float8 AS ok, COALESCE(SUM(${VALUE_SQL}), 0)::float8 AS value
      FROM "ReturnLine" rl JOIN "Return" r ON r.id = rl."returnId" JOIN "Job" j ON j.id = r."jobId"
      WHERE r."voidedAt" IS NULL
        AND (${filter.clientId ?? null}::text IS NULL OR j."clientId" = ${filter.clientId ?? null})
        AND (${dateWhere?.gte ?? null}::date IS NULL OR r.date >= ${dateWhere?.gte ?? null})
        AND (${dateWhere?.lte ?? null}::date IS NULL OR r.date <= ${dateWhere?.lte ?? null})`,
  ]);
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
  const rows = await getUnpaid(prisma, { clientId: filter.clientId });
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
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw notFound("Client");
  const [jobs, subBills, mainBills, money, returns] = await Promise.all([
    loadJobs(prisma, { clientId }),
    listSubBills({ clientId }),
    listMainBills({ clientId }),
    moneySummary(prisma, clientId),
    prisma.return.findMany({ where: { job: { clientId } }, include: { lines: true, job: { select: { id: true, jobNumber: true } } } }),
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
    client: { ...client, paymentPolicy: client.paymentPolicy as PaymentPolicy | null, createdAt: client.createdAt.toISOString() },
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

export async function search(q: string): Promise<SearchResults> {
  const term = q.trim();
  if (!term) return { clients: [], jobs: [], bills: [], products: [], designs: [] };
  const ci = { contains: term, mode: "insensitive" as const };
  const date = parseSearchDate(term);
  const [clients, jobs, subBills, mainBills, products, designs] = await Promise.all([
    prisma.client.findMany({ where: { OR: [{ name: ci }, { businessName: ci }, { phone: ci }, { alternatePhone: ci }, { workerCode: ci }, { gstin: ci }] }, take: 8, orderBy: { name: "asc" } }),
    prisma.job.findMany({
      where: {
        OR: [
          { jobNumber: ci },
          { client: { name: ci } },
          { product: { name: ci } },
          { items: { some: { designName: ci } } },
          { notes: ci },
          ...(date ? [{ jobDate: date }] : []),
        ],
      },
      include: { client: { select: { name: true } }, product: { select: { name: true } } },
      orderBy: { jobDate: "desc" },
      take: 10,
    }),
    prisma.subBill.findMany({
      where: { OR: [{ billNumber: ci }, { reference: ci }, { client: { name: ci } }, ...(date ? [{ date }] : [])] },
      include: { client: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 6,
    }),
    prisma.mainBill.findMany({
      where: { OR: [{ billNumber: ci }, { client: { name: ci } }, { job: { jobNumber: ci } }, ...(date ? [{ date }] : [])] },
      include: { client: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 4,
    }),
    prisma.product.findMany({ where: { OR: [{ name: ci }, { code: ci }] }, take: 5 }),
    prisma.design.findMany({ where: { OR: [{ name: ci }, { code: ci }] }, take: 5 }),
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.name, sub: c.businessName ?? c.phone })),
    jobs: jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, clientName: j.client.name, productName: j.product.name, status: j.status as JobStatus, jobDate: j.jobDate.toISOString() })),
    bills: [
      ...mainBills.map((m) => ({ id: m.id, kind: "main" as const, billNumber: m.billNumber, clientName: m.client.name, amountPaise: m.totalPaise, date: m.date.toISOString() })),
      ...subBills.map((b) => ({ id: b.id, kind: "sub" as const, billNumber: b.billNumber, clientName: b.client.name, amountPaise: b.amountPaise, date: b.date.toISOString() })),
    ],
    products: products.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    designs: designs.map((d) => ({ id: d.id, name: d.name, code: d.code })),
  };
}
