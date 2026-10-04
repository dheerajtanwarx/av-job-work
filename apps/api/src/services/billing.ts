import { prisma, type DB, type Prisma } from "@av/db";
import {
  computeInvoiceTotals,
  invoiceCreateSchema,
  paymentCreateSchema,
  paymentStatus,
  type InvoiceDetail,
  type InvoiceListRow,
  type JobStatus,
  type MoneySummary,
  type PaymentRow,
  type PaymentStatus,
  type Settings,
  type UnbilledLine,
} from "@av/shared";
import type { z } from "zod";
import { audit } from "../lib/audit.js";
import { nextNumber } from "../lib/counter.js";
import { toDate, toDateOrNull } from "../lib/dates.js";
import { notFound, unprocessable } from "../lib/http.js";
import { loadJobs, summarizeJobItems } from "./jobs.js";

// ───────────────────────── Unbilled work ─────────────────────────

export async function getUnbilled(db: DB, filter: { clientId?: string; jobId?: string } = {}): Promise<UnbilledLine[]> {
  const jobs = await loadJobs(db, { clientId: filter.clientId, id: filter.jobId });
  const out: UnbilledLine[] = [];
  for (const job of jobs.slice().reverse()) {
    for (const it of summarizeJobItems(job)) {
      if (it.unbilledQty <= 0) continue;
      out.push({
        jobItemId: it.id,
        jobId: job.id,
        jobNumber: job.jobNumber,
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

// ───────────────────────── Invoices ─────────────────────────

export const invoiceInclude = {
  client: true,
  lines: { include: { jobItem: { select: { jobId: true } } } },
  payments: { include: { invoice: { select: { id: true, invoiceNumber: true } }, client: { select: { id: true, name: true } } }, orderBy: { date: "asc" } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithAll = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

function paidOf(inv: { payments: { amountPaise: number; voidedAt: Date | null }[] }) {
  return inv.payments.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amountPaise, 0);
}

export function toInvoiceRow(inv: InvoiceWithAll): InvoiceListRow {
  const paidPaise = paidOf(inv);
  const cancelled = !!inv.cancelledAt;
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: inv.date.toISOString(),
    dueDate: inv.dueDate?.toISOString() ?? null,
    client: { id: inv.client.id, name: inv.client.name },
    qty: inv.lines.reduce((s, l) => s + l.qty, 0),
    subtotalPaise: inv.subtotalPaise,
    taxPaise: inv.taxPaise,
    totalPaise: inv.totalPaise,
    paidPaise,
    outstandingPaise: cancelled ? 0 : inv.totalPaise - paidPaise,
    status: paymentStatus(inv.totalPaise, paidPaise, cancelled),
    jobNumbers: [...new Set(inv.lines.map((l) => l.jobNumber))],
  };
}

export function toPaymentRow(p: InvoiceWithAll["payments"][number]): PaymentRow {
  return {
    id: p.id,
    date: p.date.toISOString(),
    amountPaise: p.amountPaise,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    voidReason: p.voidReason,
    invoice: p.invoice,
    client: p.client,
  };
}

export async function listInvoices(filter: { clientId?: string; from?: Date; to?: Date; q?: string; status?: PaymentStatus | "OPEN" }) {
  const where: Prisma.InvoiceWhereInput = {
    clientId: filter.clientId,
    date: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
  if (filter.q) {
    where.OR = [
      { invoiceNumber: { contains: filter.q, mode: "insensitive" } },
      { client: { name: { contains: filter.q, mode: "insensitive" } } },
      { lines: { some: { OR: [{ jobNumber: { contains: filter.q, mode: "insensitive" } }, { designName: { contains: filter.q, mode: "insensitive" } }] } } },
    ];
  }
  const rows = (await prisma.invoice.findMany({ where, include: invoiceInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }] })).map(toInvoiceRow);
  if (!filter.status) return rows;
  if (filter.status === "OPEN") return rows.filter((r) => r.status === "UNPAID" || r.status === "PARTIAL");
  return rows.filter((r) => r.status === filter.status);
}

export async function getSettings(db: DB = prisma): Promise<Settings> {
  const s = await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return {
    businessName: s.businessName,
    address: s.address,
    phone: s.phone,
    email: s.email,
    gstin: s.gstin,
    billingPolicy: s.billingPolicy,
    defaultTaxPercent: Number(s.defaultTaxPercent),
    invoiceFooter: s.invoiceFooter,
  };
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!inv) throw notFound("Invoice");
  return {
    ...toInvoiceRow(inv),
    taxPercent: Number(inv.taxPercent),
    notes: inv.notes,
    cancelledAt: inv.cancelledAt?.toISOString() ?? null,
    cancelReason: inv.cancelReason,
    client: { ...inv.client, createdAt: inv.client.createdAt.toISOString() },
    lines: inv.lines.map((l) => ({
      id: l.id,
      jobItemId: l.jobItemId,
      jobId: l.jobItem.jobId,
      jobNumber: l.jobNumber,
      designName: l.designName,
      productName: l.productName,
      qty: l.qty,
      ratePaise: l.ratePaise,
      amountPaise: l.amountPaise,
    })),
    payments: inv.payments.map(toPaymentRow),
    business: await getSettings(),
  };
}

export async function createInvoice(input: z.output<typeof invoiceCreateSchema>, userId?: string) {
  const id = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw unprocessable("Choose a valid client");
    const unbilled = new Map((await getUnbilled(tx, { clientId: input.clientId })).map((u) => [u.jobItemId, u]));

    const lines = input.lines.map((l) => {
      const u = unbilled.get(l.jobItemId);
      if (!u) throw unprocessable("One of the lines has nothing left to bill for this client");
      if (l.qty > u.unbilledQty) throw unprocessable(`${u.jobNumber} ${u.designName}: only ${u.unbilledQty} completed pieces are left to bill`);
      return {
        jobItemId: l.jobItemId,
        jobNumber: u.jobNumber,
        designName: u.designName,
        productName: u.productName,
        qty: l.qty,
        ratePaise: u.ratePaise,
        amountPaise: l.qty * u.ratePaise,
      };
    });
    const totals = computeInvoiceTotals(lines, input.taxPercent);
    const invoiceNumber = await nextNumber(tx, "invoice", "INV");
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        clientId: input.clientId,
        date: toDate(input.date),
        dueDate: toDateOrNull(input.dueDate),
        taxPercent: input.taxPercent,
        ...totals,
        notes: input.notes,
        lines: { create: lines },
      },
    });
    await audit(tx, { entity: "Invoice", entityId: inv.id, action: "create", summary: `${invoiceNumber} created for ₹${totals.totalPaise / 100}`, after: lines, userId });
    return inv.id;
  });
  return getInvoice(id);
}

export async function cancelInvoice(id: string, reason: string, userId?: string) {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
  if (!inv) throw notFound("Invoice");
  if (inv.cancelledAt) throw unprocessable("This invoice is already cancelled");
  if (inv.payments.some((p) => !p.voidedAt)) throw unprocessable("This invoice has payments. Void the payments first, then cancel the invoice.");
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, { entity: "Invoice", entityId: id, action: "cancel", summary: `${inv.invoiceNumber} cancelled: ${reason}`, userId });
  });
  return getInvoice(id);
}

// ───────────────────────── Payments ─────────────────────────

export async function listPayments(filter: { clientId?: string; invoiceId?: string; from?: Date; to?: Date }) {
  const rows = await prisma.payment.findMany({
    where: { clientId: filter.clientId, invoiceId: filter.invoiceId, date: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined },
    include: { invoice: { select: { id: true, invoiceNumber: true } }, client: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toPaymentRow);
}

export async function createPayment(input: z.output<typeof paymentCreateSchema>, userId?: string) {
  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId }, include: { payments: true } });
    if (!inv) throw unprocessable("Choose a valid invoice");
    if (inv.cancelledAt) throw unprocessable("This invoice is cancelled");
    const outstanding = inv.totalPaise - paidOf(inv);
    if (outstanding <= 0) throw unprocessable("This invoice is already fully paid");
    if (input.amountPaise > outstanding) throw unprocessable(`Only ₹${(outstanding / 100).toLocaleString("en-IN")} is outstanding on ${inv.invoiceNumber}`);
    const p = await tx.payment.create({
      data: {
        clientId: inv.clientId,
        invoiceId: inv.id,
        date: toDate(input.date),
        amountPaise: input.amountPaise,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
      },
    });
    await audit(tx, { entity: "Payment", entityId: p.id, action: "create", summary: `₹${input.amountPaise / 100} received on ${inv.invoiceNumber}`, userId });
  });
  return getInvoice(input.invoiceId);
}

export async function voidPayment(id: string, reason: string, userId?: string) {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p) throw notFound("Payment");
  if (p.voidedAt) throw unprocessable("This payment is already voided");
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    await audit(tx, { entity: "Payment", entityId: id, action: "void", summary: `Payment of ₹${p.amountPaise / 100} voided: ${reason}`, userId });
  });
  return getInvoice(p.invoiceId);
}

// ───────────────────────── Money summary ─────────────────────────

export async function moneySummary(db: DB, clientId?: string): Promise<MoneySummary> {
  const [jobs, invoices] = await Promise.all([
    loadJobs(db, { clientId }),
    db.invoice.findMany({ where: { clientId, cancelledAt: null }, select: { totalPaise: true, payments: { select: { amountPaise: true, voidedAt: true } } } }),
  ]);
  let completedValuePaise = 0;
  let unbilledPaise = 0;
  for (const j of jobs)
    for (const it of summarizeJobItems(j)) {
      completedValuePaise += it.completedValuePaise;
      unbilledPaise += it.unbilledValuePaise;
    }
  const billedPaise = invoices.reduce((s, i) => s + i.totalPaise, 0);
  const paidPaise = invoices.reduce((s, i) => s + paidOf(i), 0);
  return { completedValuePaise, billedPaise, paidPaise, outstandingPaise: billedPaise - paidPaise, unbilledPaise };
}
