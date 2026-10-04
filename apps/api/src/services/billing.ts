import { prisma, type DB, type Prisma } from "@av/db";
import {
  subBillCreateSchema,
  sumTotals,
  type JobStatus,
  type MainBillDetail,
  type MoneySummary,
  type Settings,
  type SubBillDetail,
  type UnpaidLine,
} from "@av/shared";
import type { z } from "zod";
import { audit } from "../lib/audit.js";
import { nextNumber } from "../lib/counter.js";
import { iso, toDate } from "../lib/dates.js";
import { notFound, unprocessable } from "../lib/http.js";
import {
  loadJobs,
  mainBillRowInclude,
  recomputeJobStatus,
  subBillRowInclude,
  summarizeJobItems,
  toMainBillRow,
  toSubBillRow,
} from "./jobs.js";

// ───────────────────────── Work waiting to be paid ─────────────────────────

export async function getUnpaid(db: DB, filter: { clientId?: string; jobId?: string } = {}): Promise<UnpaidLine[]> {
  const jobs = await loadJobs(db, { clientId: filter.clientId, id: filter.jobId });
  const out: UnpaidLine[] = [];
  for (const job of jobs.slice().reverse()) {
    for (const it of summarizeJobItems(job)) {
      if (it.unbilledQty <= 0) continue;
      out.push({
        jobItemId: it.id,
        jobId: job.id,
        jobNumber: job.jobNumber,
        clientId: job.clientId,
        clientName: job.client.name,
        jobStatus: job.status as JobStatus,
        productName: job.product.name,
        designName: it.designName,
        ratePaise: it.ratePaise,
        ok: it.ok,
        billedQty: it.billedQty,
        unbilledQty: it.unbilledQty,
        unbilledValuePaise: it.unbilledValuePaise,
      });
    }
  }
  return out;
}

// ───────────────────────── Settings ─────────────────────────

export async function getSettings(db: DB = prisma): Promise<Settings> {
  const s = await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return { businessName: s.businessName, address: s.address, phone: s.phone, email: s.email, logo: s.logo, emailBills: s.emailBills, billingPolicy: s.billingPolicy };
}

// ───────────────────────── Sub bills (payments) ─────────────────────────

export async function listSubBills(filter: { clientId?: string; jobId?: string; from?: Date; to?: Date; q?: string; includeVoided?: boolean }) {
  const where: Prisma.SubBillWhereInput = {
    clientId: filter.clientId,
    jobId: filter.jobId,
    voidedAt: filter.includeVoided === false ? null : undefined,
    date: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
  if (filter.q) {
    where.OR = [
      { billNumber: { contains: filter.q, mode: "insensitive" } },
      { reference: { contains: filter.q, mode: "insensitive" } },
      { client: { name: { contains: filter.q, mode: "insensitive" } } },
      { job: { jobNumber: { contains: filter.q, mode: "insensitive" } } },
      { lines: { some: { designName: { contains: filter.q, mode: "insensitive" } } } },
    ];
  }
  const rows = await prisma.subBill.findMany({ where, include: subBillRowInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return rows.map(toSubBillRow);
}

export async function getSubBill(id: string): Promise<SubBillDetail> {
  const b = await prisma.subBill.findUnique({
    where: { id },
    include: { ...subBillRowInclude, client: true, lines: true, job: { select: { id: true, jobNumber: true, product: { select: { name: true } }, mainBill: true } } },
  });
  if (!b) throw notFound("Sub bill");
  const mb = b.job.mainBill;
  return {
    ...toSubBillRow(b),
    notes: b.notes,
    createdAt: b.createdAt.toISOString(),
    client: { ...b.client, createdAt: b.client.createdAt.toISOString() },
    lines: b.lines.map((l) => ({ id: l.id, jobItemId: l.jobItemId, designName: l.designName, qty: l.qty, ratePaise: l.ratePaise, amountPaise: l.amountPaise })),
    mainBill: mb ? { id: mb.id, billNumber: mb.billNumber, cancelled: !!mb.cancelledAt } : null,
    emailedAt: iso(b.emailedAt),
    emailedTo: b.emailedTo,
    business: await getSettings(),
  };
}

export async function createSubBill(input: z.output<typeof subBillCreateSchema>, userId?: string) {
  const id = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: input.jobId }, select: { id: true, jobNumber: true, clientId: true } });
    if (!job) throw unprocessable("Choose a valid job");
    const unpaid = new Map((await getUnpaid(tx, { jobId: job.id })).map((u) => [u.jobItemId, u]));

    const lines = input.lines.map((l) => {
      const u = unpaid.get(l.jobItemId);
      if (!u) throw unprocessable(`One of the lines has nothing left to pay on ${job.jobNumber}`);
      if (l.qty > u.unbilledQty) throw unprocessable(`${u.designName}: only ${u.unbilledQty} returned pieces are left to pay for`);
      return { jobItemId: l.jobItemId, designName: u.designName, qty: l.qty, ratePaise: u.ratePaise, amountPaise: l.qty * u.ratePaise };
    });
    const amountPaise = lines.reduce((s, l) => s + l.amountPaise, 0);
    const billNumber = await nextNumber(tx, "subBill", "SB");
    const b = await tx.subBill.create({
      data: {
        billNumber,
        clientId: job.clientId,
        jobId: job.id,
        date: toDate(input.date),
        amountPaise,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        lines: { create: lines },
      },
    });
    await audit(tx, { entity: "SubBill", entityId: b.id, action: "create", summary: `${billNumber}: ₹${amountPaise / 100} paid on ${job.jobNumber}`, after: lines, userId });
    await recomputeJobStatus(tx, job.id, userId);
    return b.id;
  });
  return id;
}

export async function voidSubBill(id: string, reason: string, userId?: string) {
  const b = await prisma.subBill.findUnique({ where: { id } });
  if (!b) throw notFound("Sub bill");
  if (b.voidedAt) throw unprocessable("This sub bill is already voided");
  await prisma.$transaction(async (tx) => {
    await tx.subBill.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    await audit(tx, { entity: "SubBill", entityId: id, action: "void", summary: `${b.billNumber} (₹${b.amountPaise / 100}) voided: ${reason}`, userId });
    await recomputeJobStatus(tx, b.jobId, userId);
  });
  return getSubBill(id);
}

// ───────────────────────── Main bills (job settlement) ─────────────────────────

export async function listMainBills(filter: { clientId?: string; from?: Date; to?: Date; q?: string }) {
  const where: Prisma.MainBillWhereInput = {
    clientId: filter.clientId,
    date: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
  if (filter.q) {
    where.OR = [
      { billNumber: { contains: filter.q, mode: "insensitive" } },
      { client: { name: { contains: filter.q, mode: "insensitive" } } },
      { job: { jobNumber: { contains: filter.q, mode: "insensitive" } } },
      { job: { product: { name: { contains: filter.q, mode: "insensitive" } } } },
    ];
  }
  const rows = await prisma.mainBill.findMany({ where, include: mainBillRowInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return rows.map(toMainBillRow);
}

export async function getMainBill(id: string): Promise<MainBillDetail> {
  const m = await prisma.mainBill.findUnique({ where: { id }, include: { ...mainBillRowInclude, client: true } });
  if (!m) throw notFound("Main bill");
  const [job] = await loadJobs(prisma, { id: m.jobId });
  const [details, subBills] = await Promise.all([
    prisma.job.findUniqueOrThrow({ where: { id: m.jobId }, include: { product: true, items: { select: { id: true, design: { select: { code: true } } } } } }),
    prisma.subBill.findMany({ where: { jobId: m.jobId, voidedAt: null }, include: subBillRowInclude, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  const codes = new Map(details.items.map((i) => [i.id, i.design.code]));
  const items = summarizeJobItems(job);
  const row = toMainBillRow(m);
  return {
    ...row,
    client: { ...m.client, createdAt: m.client.createdAt.toISOString() },
    job: {
      ...row.job,
      jobDate: details.jobDate.toISOString(),
      expectedReturnDate: iso(details.expectedReturnDate),
      completedAt: iso(details.completedAt),
      notes: details.notes,
    },
    product: { id: details.product.id, name: details.product.name, code: details.product.code, unit: details.product.unit, description: details.product.description },
    designs: items.map((it) => ({
      jobItemId: it.id,
      designName: it.designName,
      designCode: codes.get(it.id) ?? null,
      ratePaise: it.ratePaise,
      quantity: it.quantity,
      sent: it.sent,
      ok: it.ok,
      damaged: it.damaged,
      rejected: it.rejected,
      lost: it.lost,
      paidQty: it.billedQty,
      paidValuePaise: it.billedValuePaise,
    })),
    subBills: subBills.map(toSubBillRow),
    totals: sumTotals(items),
    business: await getSettings(),
  };
}

// ───────────────────────── Money summary ─────────────────────────

export async function moneySummary(db: DB, clientId?: string): Promise<MoneySummary> {
  const [jobs, paid] = await Promise.all([
    loadJobs(db, { clientId }),
    db.subBill.aggregate({ where: { clientId, voidedAt: null }, _sum: { amountPaise: true } }),
  ]);
  let completedValuePaise = 0;
  let toPayPaise = 0;
  for (const j of jobs)
    for (const it of summarizeJobItems(j)) {
      completedValuePaise += it.completedValuePaise;
      toPayPaise += it.unbilledValuePaise;
    }
  return { completedValuePaise, paidPaise: paid._sum.amountPaise ?? 0, toPayPaise };
}
