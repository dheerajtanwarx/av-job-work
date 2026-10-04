import { prisma } from "@av/db";
import { OPEN_JOB_STATUSES, sumTotals, type ClientSummary, type Dashboard, type JobStatus, type SearchResults } from "@av/shared";
import { parseSearchDate, todayUTC } from "../lib/dates.js";
import { notFound } from "../lib/http.js";
import { invoiceInclude, listInvoices, listPayments, moneySummary, toInvoiceRow } from "./billing.js";
import { loadJobs, summarizeJobItems, toJobRow } from "./jobs.js";

// ───────────────────────── Dashboard ─────────────────────────

export async function getDashboard(): Promise<Dashboard> {
  const [jobs, money, recentReturns, recentPayments, recentJobs] = await Promise.all([
    loadJobs(prisma),
    moneySummary(prisma),
    prisma.return.findMany({ where: { voidedAt: null }, orderBy: { createdAt: "desc" }, take: 5, include: { lines: true, job: { select: { id: true, jobNumber: true, client: { select: { name: true } } } } } }),
    prisma.payment.findMany({ where: { voidedAt: null }, orderBy: { createdAt: "desc" }, take: 5, include: { invoice: { select: { id: true, invoiceNumber: true } }, client: { select: { name: true } } } }),
    prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { client: { select: { name: true } } } }),
  ]);

  const clients = new Map<string, Dashboard["clientsPending"][number]>();
  const designs = new Map<string, Dashboard["designsPending"][number] & { jobIds: Set<string> }>();
  const ready = new Map<string, Dashboard["readyToBill"][number]>();
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
    piecesOutside += row.totals.pending;
    if (row.totals.pending > 0) {
      const c = clients.get(job.clientId) ?? { clientId: job.clientId, clientName: job.client.name, jobs: 0, pending: 0, pendingValuePaise: 0 };
      c.jobs++;
      c.pending += row.totals.pending;
      c.pendingValuePaise += row.totals.pendingValuePaise;
      clients.set(job.clientId, c);
    }
    for (const it of items) {
      if (it.pending > 0) {
        const d = designs.get(it.designId) ?? { designId: it.designId, designName: it.designName, jobs: 0, pending: 0, jobIds: new Set<string>() };
        d.jobIds.add(job.id);
        d.jobs = d.jobIds.size;
        d.pending += it.pending;
        designs.set(it.designId, d);
      }
      if (it.unbilledQty > 0) {
        const r = ready.get(job.clientId) ?? { clientId: job.clientId, clientName: job.client.name, qty: 0, valuePaise: 0 };
        r.qty += it.unbilledQty;
        r.valuePaise += it.unbilledValuePaise;
        ready.set(job.clientId, r);
      }
    }
  }

  const recentActivity: Dashboard["recentActivity"] = [
    ...recentReturns.map((r) => ({
      type: "return",
      at: r.createdAt.toISOString(),
      text: `${r.lines.reduce((s, l) => s + l.okQty + l.damagedQty + l.rejectedQty + l.lostQty, 0)} pcs received on ${r.job.jobNumber} from ${r.job.client.name}`,
      href: `/jobs/${r.job.id}`,
    })),
    ...recentPayments.map((p) => ({
      type: "payment",
      at: p.createdAt.toISOString(),
      text: `₹${(p.amountPaise / 100).toLocaleString("en-IN")} received from ${p.client.name} (${p.invoice.invoiceNumber})`,
      href: `/invoices/${p.invoice.id}`,
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
    readyToBill: [...ready.values()].sort((a, b) => b.valuePaise - a.valuePaise),
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
  unbilledPaise: number;
  billedPaise: number;
  paidPaise: number;
  outstandingPaise: number;
}

export async function clientSummaryReport(filter: { includeInactive?: boolean } = {}) {
  const [clients, jobs, invoices] = await Promise.all([
    prisma.client.findMany({ where: filter.includeInactive ? {} : { isActive: true }, orderBy: { name: "asc" } }),
    loadJobs(prisma),
    prisma.invoice.findMany({ where: { cancelledAt: null }, select: { clientId: true, totalPaise: true, payments: { select: { amountPaise: true, voidedAt: true } } } }),
  ]);
  const map = new Map<string, ClientSummaryRow>(
    clients.map((c) => [
      c.id,
      { clientId: c.id, clientName: c.name, isActive: c.isActive, jobs: 0, activeJobs: 0, sent: 0, received: 0, exceptions: 0, pending: 0, completedValuePaise: 0, unbilledPaise: 0, billedPaise: 0, paidPaise: 0, outstandingPaise: 0 },
    ]),
  );
  for (const job of jobs) {
    const r = map.get(job.clientId);
    if (!r) continue;
    const t = sumTotals(summarizeJobItems(job));
    r.jobs++;
    if (OPEN_JOB_STATUSES.includes(job.status as JobStatus) && job.status !== "DRAFT") r.activeJobs++;
    r.sent += t.sent;
    r.received += t.ok;
    r.exceptions += t.exceptions;
    r.pending += t.pending;
    r.completedValuePaise += t.completedValuePaise;
    r.unbilledPaise += t.unbilledValuePaise;
  }
  for (const inv of invoices) {
    const r = map.get(inv.clientId);
    if (!r) continue;
    const paid = inv.payments.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amountPaise, 0);
    r.billedPaise += inv.totalPaise;
    r.paidPaise += paid;
    r.outstandingPaise += inv.totalPaise - paid;
  }
  const rows = [...map.values()];
  const totals = rows.reduce(
    (t, r) => {
      for (const k of ["jobs", "activeJobs", "sent", "received", "exceptions", "pending", "completedValuePaise", "unbilledPaise", "billedPaise", "paidPaise", "outstandingPaise"] as const) t[k] += r[k];
      return t;
    },
    { jobs: 0, activeJobs: 0, sent: 0, received: 0, exceptions: 0, pending: 0, completedValuePaise: 0, unbilledPaise: 0, billedPaise: 0, paidPaise: 0, outstandingPaise: 0 },
  );
  return { rows, totals };
}

// ───────────────────────── Billing report ─────────────────────────

export async function billingReport(filter: { from?: Date; to?: Date; clientId?: string }) {
  const dateWhere = filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined;
  const [invoices, returnLines] = await Promise.all([
    listInvoices({ clientId: filter.clientId, from: filter.from, to: filter.to }),
    prisma.returnLine.findMany({
      where: { return: { voidedAt: null, date: dateWhere, job: { clientId: filter.clientId } } },
      select: { okQty: true, jobItem: { select: { ratePaise: true } } },
    }),
  ]);
  const active = invoices.filter((i) => i.status !== "CANCELLED");
  return {
    rows: invoices,
    summary: {
      completedPieces: returnLines.reduce((s, l) => s + l.okQty, 0),
      completedValuePaise: returnLines.reduce((s, l) => s + l.okQty * l.jobItem.ratePaise, 0),
      invoiceCount: active.length,
      cancelledCount: invoices.length - active.length,
      billedPieces: active.reduce((s, i) => s + i.qty, 0),
      billedPaise: active.reduce((s, i) => s + i.totalPaise, 0),
      paidPaise: active.reduce((s, i) => s + i.paidPaise, 0),
      outstandingPaise: active.reduce((s, i) => s + i.outstandingPaise, 0),
    },
  };
}

// ───────────────────────── Outstanding ─────────────────────────

export async function outstandingReport(filter: { clientId?: string }) {
  const rows = (await listInvoices({ clientId: filter.clientId, status: "OPEN" })).sort((a, b) => a.date.localeCompare(b.date));
  const today = todayUTC().getTime();
  const withAge = rows.map((r) => ({ ...r, ageDays: Math.max(0, Math.floor((today - new Date(r.date).getTime()) / 86400000)) }));
  const byClient = new Map<string, { clientId: string; clientName: string; invoices: number; totalPaise: number; paidPaise: number; outstandingPaise: number }>();
  for (const r of rows) {
    const c = byClient.get(r.client.id) ?? { clientId: r.client.id, clientName: r.client.name, invoices: 0, totalPaise: 0, paidPaise: 0, outstandingPaise: 0 };
    c.invoices++;
    c.totalPaise += r.totalPaise;
    c.paidPaise += r.paidPaise;
    c.outstandingPaise += r.outstandingPaise;
    byClient.set(r.client.id, c);
  }
  return {
    rows: withAge,
    byClient: [...byClient.values()].sort((a, b) => b.outstandingPaise - a.outstandingPaise),
    totals: {
      invoices: rows.length,
      unpaid: rows.filter((r) => r.status === "UNPAID").length,
      partial: rows.filter((r) => r.status === "PARTIAL").length,
      totalPaise: rows.reduce((s, r) => s + r.totalPaise, 0),
      paidPaise: rows.reduce((s, r) => s + r.paidPaise, 0),
      outstandingPaise: rows.reduce((s, r) => s + r.outstandingPaise, 0),
    },
  };
}

// ───────────────────────── Client profile ─────────────────────────

export async function clientProfile(clientId: string): Promise<ClientSummary> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw notFound("Client");
  const [jobs, invoices, payments, money, returns] = await Promise.all([
    loadJobs(prisma, { clientId }),
    prisma.invoice.findMany({ where: { clientId }, include: invoiceInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    listPayments({ clientId }),
    moneySummary(prisma, clientId),
    prisma.return.findMany({ where: { job: { clientId } }, include: { lines: true, job: { select: { id: true, jobNumber: true } } } }),
  ]);
  const jobRows = jobs.map((j) => toJobRow(j));
  const all = sumTotals(jobRows.map((r) => r.totals));
  const invoiceRows = invoices.map(toInvoiceRow);

  const timeline: ClientSummary["timeline"] = [];
  for (const j of jobs) {
    const t = jobRows.find((r) => r.id === j.id)!.totals;
    timeline.push({ at: j.createdAt.toISOString(), date: j.jobDate.toISOString(), type: "job", text: `${j.jobNumber} created – ${t.quantity} ${j.product.name}`, href: `/jobs/${j.id}`, amountPaise: t.expectedValuePaise });
    if (j.completedAt && j.status === "COMPLETED") timeline.push({ at: j.completedAt.toISOString(), date: j.completedAt.toISOString(), type: "completed", text: `${j.jobNumber} completed`, href: `/jobs/${j.id}` });
    if (j.cancelledAt) timeline.push({ at: j.cancelledAt.toISOString(), date: j.cancelledAt.toISOString(), type: "cancelled", text: `${j.jobNumber} cancelled`, href: `/jobs/${j.id}` });
  }
  for (const r of returns) {
    const qty = r.lines.reduce((s, l) => s + l.okQty + l.damagedQty + l.rejectedQty + l.lostQty, 0);
    timeline.push({ at: r.createdAt.toISOString(), date: r.date.toISOString(), type: r.voidedAt ? "void" : "return", text: `${qty} pcs received on ${r.job.jobNumber}${r.voidedAt ? " (voided)" : ""}`, href: `/jobs/${r.job.id}` });
  }
  for (const i of invoiceRows) {
    timeline.push({ at: i.date, date: i.date, type: i.status === "CANCELLED" ? "void" : "invoice", text: `Invoice ${i.invoiceNumber}${i.status === "CANCELLED" ? " (cancelled)" : ""}`, href: `/invoices/${i.id}`, amountPaise: i.totalPaise });
  }
  for (const p of payments) {
    timeline.push({ at: p.date, date: p.date, type: p.voidedAt ? "void" : "payment", text: `Payment on ${p.invoice.invoiceNumber}${p.voidedAt ? " (voided)" : ""}`, href: `/invoices/${p.invoice.id}`, amountPaise: p.amountPaise });
  }
  timeline.sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || b.at.localeCompare(a.at));

  return {
    client: { ...client, createdAt: client.createdAt.toISOString() },
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
    invoices: invoiceRows,
    payments,
    timeline,
  };
}

// ───────────────────────── Search ─────────────────────────

export async function search(q: string): Promise<SearchResults> {
  const term = q.trim();
  if (!term) return { clients: [], jobs: [], invoices: [], products: [], designs: [] };
  const ci = { contains: term, mode: "insensitive" as const };
  const date = parseSearchDate(term);
  const [clients, jobs, invoices, products, designs] = await Promise.all([
    prisma.client.findMany({ where: { OR: [{ name: ci }, { businessName: ci }, { phone: ci }, { gstin: ci }] }, take: 8, orderBy: { name: "asc" } }),
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
    prisma.invoice.findMany({
      where: { OR: [{ invoiceNumber: ci }, { client: { name: ci } }, ...(date ? [{ date }] : [])] },
      include: { client: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 8,
    }),
    prisma.product.findMany({ where: { OR: [{ name: ci }, { code: ci }] }, take: 5 }),
    prisma.design.findMany({ where: { OR: [{ name: ci }, { code: ci }] }, take: 5 }),
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.name, sub: c.businessName ?? c.phone })),
    jobs: jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, clientName: j.client.name, productName: j.product.name, status: j.status as JobStatus, jobDate: j.jobDate.toISOString() })),
    invoices: invoices.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, clientName: i.client.name, totalPaise: i.totalPaise, date: i.date.toISOString() })),
    products: products.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    designs: designs.map((d) => ({ id: d.id, name: d.name, code: d.code })),
  };
}
