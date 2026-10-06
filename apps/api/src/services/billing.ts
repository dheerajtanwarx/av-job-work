import { prisma, type DB, type Prisma } from "@av/db";
import {
  formatINR,
  lineAmount,
  moneyPosition,
  sumTotals,
  type JobStatus,
  type MainBillDetail,
  type MoneySummary,
  type PaymentPolicy,
  type Settings,
  type SubBillDetail,
  type UnpaidLine,
  type Unit,
  paymentNowSchema,
  subBillCreateSchema,
  subBillUpdateSchema,
  PAYMENT_METHOD_LABEL,
  formatDate,
} from "@av/shared";
import type { z } from "zod";
import { audit, editedBy, userNames } from "../lib/audit.js";
import { nextNumber } from "../lib/counter.js";
import { iso, toDate } from "../lib/dates.js";
import { HttpError, notFound, unprocessable } from "../lib/http.js";
import { type Actor, loadJob, loadJobs, mainBillRowInclude, recomputeJobStatus, subBillRowInclude, summarizeJobItems, toMainBillRow, toSubBillRow } from "./jobs.js";
import { num } from "./ledger.js";

// ───────────────────────── Work waiting to be paid (qty view, legacy) ─────────────────────────

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
  const policy = s.defaultPaymentPolicy as PaymentPolicy;
  return {
    businessName: s.businessName,
    address: s.address,
    phone: s.phone,
    email: s.email,
    logo: s.logo,
    emailBills: s.emailBills,
    defaultPaymentPolicy: policy,
    defaultPaymentDays: s.defaultPaymentDays,
    payDamagedDefault: s.payDamagedDefault,
    payRejectedDefault: s.payRejectedDefault,
    payLostDefault: s.payLostDefault,
    billingPolicy: policy,
  };
}

// ───────────────────────── Payment vouchers ─────────────────────────

export async function listSubBills(filter: { clientId?: string; jobId?: string; from?: Date; to?: Date; q?: string; includeVoided?: boolean; take?: number; skip?: number }) {
  const where: Prisma.SubBillWhereInput = {
    clientId: filter.clientId,
    jobId: filter.jobId,
    voidedAt: filter.includeVoided === false ? null : undefined,
    date: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
  if (filter.q) {
    const ci = { contains: filter.q, mode: "insensitive" as const };
    where.OR = [
      { billNumber: ci },
      { reference: ci },
      { client: { name: ci } },
      { job: { jobNumber: ci } },
      { return: { returnNumber: ci } },
      { lines: { some: { designName: ci } } },
    ];
  }
  const rows = await prisma.subBill.findMany({ where, include: subBillRowInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: filter.take, skip: filter.skip });
  const names = await userNames(prisma, rows.flatMap((r) => [r.enteredById, r.editedById, r.voidedById]));
  return rows.map((r) => toSubBillRow(r, undefined, names));
}

export async function getSubBill(id: string): Promise<SubBillDetail> {
  const b = await prisma.subBill.findUnique({
    where: { id },
    include: { ...subBillRowInclude, client: true, lines: true, job: { select: { id: true, jobNumber: true, product: { select: { name: true } }, mainBill: true } } },
  });
  if (!b) throw notFound("Payment voucher");
  const mb = b.job.mainBill;
  const [job, history, notifications] = await Promise.all([
    loadJob(prisma, b.jobId),
    prisma.auditLog.findMany({ where: { entity: "SubBill", entityId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notificationLog.findMany({ where: { entity: "SubBill", entityId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const names = await userNames(prisma, [b.enteredById, b.editedById, b.voidedById, ...history.map((h) => h.userId)]);
  const totals = sumTotals(summarizeJobItems(job));
  return {
    ...toSubBillRow(b, undefined, names),
    notes: b.notes,
    createdAt: b.createdAt.toISOString(),
    client: {
      ...b.client,
      paymentPolicy: b.client.paymentPolicy as PaymentPolicy | null,
      createdAt: b.client.createdAt.toISOString(),
    },
    lines: b.lines.map((l) => ({ id: l.id, jobItemId: l.jobItemId, designName: l.designName, qty: num(l.qty), ratePaise: l.ratePaise, amountPaise: l.amountPaise })),
    mainBill: mb ? { id: mb.id, billNumber: mb.billNumber, cancelled: !!mb.cancelledAt } : null,
    advanceReason: b.advanceReason,
    challanMoney: moneyPosition(totals.completedValuePaise, job.agg.paidPaise),
    emailedAt: iso(b.emailedAt),
    emailedTo: b.emailedTo,
    history: history.map((h) => ({ at: h.createdAt.toISOString(), action: h.action, summary: h.summary, reason: h.reason, user: h.userId ? (names.get(h.userId) ?? null) : null })),
    notifications: notifications.map((n) => ({ id: n.id, channel: n.channel, kind: n.kind, recipient: n.recipient, status: n.status as "sent" | "skipped" | "failed", error: n.error, auto: n.auto, createdAt: n.createdAt.toISOString() })),
    business: await getSettings(),
  };
}

type VoucherInput = z.output<typeof subBillCreateSchema>;

/**
 * Records a payment voucher inside an existing transaction.
 * - Amount-based (partial payments allowed), or qty-based lines (legacy) priced at the challan rate.
 * - Paying more than is outstanding needs `advanceReason`.
 * - A repeated `idempotencyKey` returns the voucher already recorded instead of paying twice.
 */
export async function createVoucherTx(tx: DB, input: VoucherInput, actor?: Actor): Promise<{ id: string; created: boolean }> {
  const userId = actor?.id;
  if (input.idempotencyKey) {
    const existing = await tx.subBill.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, jobId: true } });
    if (existing) {
      if (existing.jobId !== input.jobId) throw unprocessable("This payment form was already used for another challan. Reload and try again.");
      return { id: existing.id, created: false };
    }
  }
  const job = await loadJob(tx, input.jobId).catch(() => {
    throw unprocessable("Choose a valid challan");
  });
  if (input.returnId) {
    const r = await tx.return.findUnique({ where: { id: input.returnId }, select: { jobId: true, voidedAt: true, returnNumber: true } });
    if (!r || r.jobId !== job.id) throw unprocessable("That return doesn't belong to this challan");
    if (r.voidedAt) throw unprocessable(`${r.returnNumber} is voided`);
  }
  const items = new Map(summarizeJobItems(job).map((i) => [i.id, i]));

  let lines: { jobItemId: string; designName: string; qty: number; ratePaise: number; amountPaise: number }[] = [];
  if (input.lines?.length) {
    lines = input.lines.map((l) => {
      const it = items.get(l.jobItemId);
      if (!it || it.unbilledQty <= 0) throw unprocessable(`One of the lines has nothing left to pay on ${job.jobNumber}`);
      if (l.qty > it.unbilledQty + 1e-9) throw unprocessable(`${it.designName}: only ${it.unbilledQty} returned ${it.unit} are left to pay for`);
      return { jobItemId: l.jobItemId, designName: it.designName, qty: l.qty, ratePaise: it.ratePaise, amountPaise: lineAmount(l.qty, it.ratePaise) };
    });
  }
  const amountPaise = input.amountPaise && input.amountPaise > 0 ? input.amountPaise : lines.reduce((s, l) => s + l.amountPaise, 0);
  if (amountPaise <= 0) throw unprocessable("Enter the amount paid");

  const totals = sumTotals([...items.values()]);
  const outstanding = moneyPosition(totals.completedValuePaise, job.agg.paidPaise).outstandingPaise;
  if (amountPaise > outstanding && !input.advanceReason) {
    throw new HttpError(
      422,
      `Only ${formatINR(outstanding)} is payable on ${job.jobNumber} right now. Add a reason to record ${formatINR(amountPaise - outstanding)} as an advance.`,
      { outstandingPaise: outstanding, needsAdvanceReason: true },
    );
  }

  const billNumber = await nextNumber(tx, "subBill", "SB");
  const b = await tx.subBill.create({
    data: {
      billNumber,
      clientId: job.clientId,
      jobId: job.id,
      returnId: input.returnId,
      date: toDate(input.date),
      amountPaise,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      advanceReason: amountPaise > outstanding ? input.advanceReason : null,
      idempotencyKey: input.idempotencyKey,
      enteredById: userId,
      lines: { create: lines },
    },
  });
  await audit(tx, {
    entity: "SubBill",
    entityId: b.id,
    action: "create",
    summary: `${billNumber}: ${formatINR(amountPaise)} paid on ${job.jobNumber}${amountPaise > outstanding ? ` (${formatINR(amountPaise - outstanding)} advance)` : ""}`,
    reason: amountPaise > outstanding ? input.advanceReason : null,
    after: { amountPaise, method: input.method, reference: input.reference, returnId: input.returnId, lines },
    userId,
  });
  await recomputeJobStatus(tx, job.id, userId);
  return { id: b.id, created: true };
}

export async function createSubBill(input: VoucherInput, actor?: Actor) {
  try {
    return await prisma.$transaction((tx) => createVoucherTx(tx, input, actor));
  } catch (e) {
    // Two identical submits racing: the loser hits the unique key – hand back the winner.
    if (input.idempotencyKey && (e as { code?: string }).code === "P2002") {
      const existing = await prisma.subBill.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
      if (existing) return { id: existing.id, created: false };
    }
    throw e;
  }
}

/** A payment made together with a return: always linked to that return. */
export function voucherFromReturn(jobId: string, returnId: string, date: string, p: z.output<typeof paymentNowSchema>): VoucherInput {
  return { jobId, returnId, date, method: p.method, reference: p.reference, notes: p.notes, amountPaise: p.amountPaise, advanceReason: p.advanceReason, idempotencyKey: p.idempotencyKey, lines: undefined };
}

export async function voidSubBill(id: string, reason: string, actor?: Actor) {
  const b = await prisma.subBill.findUnique({ where: { id } });
  if (!b) throw notFound("Payment voucher");
  if (b.voidedAt) throw unprocessable("This payment voucher is already voided");
  await prisma.$transaction(async (tx) => {
    await tx.subBill.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason, voidedById: actor?.id ?? null } });
    await audit(tx, { entity: "SubBill", entityId: id, action: "void", summary: `${b.billNumber} (${formatINR(b.amountPaise)}) voided: ${reason}`, reason, userId: actor?.id });
    await recomputeJobStatus(tx, b.jobId, actor?.id);
  });
  return getSubBill(id);
}

/**
 * Owner-only change to a recorded payment. A reason is always required; the old and new values go to the
 * audit log and the voucher is marked "Edited by …". The challan's status and final settlement follow.
 * Qty-based (legacy) vouchers keep their amount: it is the sum of their design lines.
 */
export async function updateSubBill(id: string, input: z.output<typeof subBillUpdateSchema>, actor?: Actor) {
  const userId = actor?.id;
  await prisma.$transaction(async (tx) => {
    const b = await tx.subBill.findUnique({ where: { id }, include: { lines: { select: { id: true } } } });
    if (!b) throw notFound("Payment voucher");
    if (b.voidedAt) throw unprocessable("A voided payment can't be changed");

    const data: Prisma.SubBillUncheckedUpdateInput = {};
    const changes: string[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const note = (field: string, from: unknown, to: unknown, text: string) => {
      before[field] = from;
      after[field] = to;
      changes.push(text);
    };

    if (input.date && toDate(input.date).getTime() !== b.date.getTime()) {
      data.date = toDate(input.date);
      note("date", b.date.toISOString(), input.date, `date ${formatDate(b.date)} → ${formatDate(input.date)}`);
    }
    if (input.method && input.method !== b.method) {
      data.method = input.method;
      note("method", b.method, input.method, `method ${PAYMENT_METHOD_LABEL[b.method]} → ${PAYMENT_METHOD_LABEL[input.method]}`);
    }
    if (input.reference !== undefined && input.reference !== b.reference) {
      data.reference = input.reference;
      note("reference", b.reference, input.reference, `reference ${b.reference ?? "—"} → ${input.reference ?? "—"}`);
    }
    if (input.notes !== undefined && input.notes !== b.notes) {
      data.notes = input.notes;
      note("notes", b.notes, input.notes, "notes changed");
    }
    if (input.amountPaise !== undefined && input.amountPaise !== b.amountPaise) {
      if (b.lines.length) throw unprocessable("This voucher pays for design quantities, so its amount can't be changed. Void it and record a new payment.");
      // Outstanding as if this voucher were not there; more than that is an advance and needs a reason.
      const job = await loadJob(tx, b.jobId);
      const outstanding = moneyPosition(sumTotals(summarizeJobItems(job)).completedValuePaise, job.agg.paidPaise - b.amountPaise).outstandingPaise;
      const advanceReason = input.advanceReason ?? b.advanceReason;
      if (input.amountPaise > outstanding && !advanceReason) {
        throw new HttpError(
          422,
          `Only ${formatINR(outstanding)} is payable on ${job.jobNumber}. Add a reason to record ${formatINR(input.amountPaise - outstanding)} as an advance.`,
          { outstandingPaise: outstanding, needsAdvanceReason: true },
        );
      }
      data.amountPaise = input.amountPaise;
      data.advanceReason = input.amountPaise > outstanding ? advanceReason : null;
      note("amountPaise", b.amountPaise, input.amountPaise, `amount ${formatINR(b.amountPaise)} → ${formatINR(input.amountPaise)}`);
    }
    if (!changes.length) throw unprocessable("Nothing was changed");

    await tx.subBill.update({ where: { id }, data: { ...data, ...editedBy(userId) } });
    const summary = `${b.billNumber} edited: ${changes.join("; ")}`;
    await audit(tx, { entity: "SubBill", entityId: id, action: "update", summary, reason: input.reason, before, after, userId });
    await audit(tx, { entity: "Job", entityId: b.jobId, action: "update", summary: `${summary}. Reason: ${input.reason}`, reason: input.reason, userId });
    await recomputeJobStatus(tx, b.jobId, userId);
  });
  return getSubBill(id);
}

// ───────────────────────── Final settlements ─────────────────────────

export async function listMainBills(filter: { clientId?: string; from?: Date; to?: Date; q?: string }) {
  const where: Prisma.MainBillWhereInput = {
    clientId: filter.clientId,
    date: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
  if (filter.q) {
    const ci = { contains: filter.q, mode: "insensitive" as const };
    where.OR = [{ billNumber: ci }, { client: { name: ci } }, { job: { jobNumber: ci } }, { job: { product: { name: ci } } }];
  }
  const rows = await prisma.mainBill.findMany({ where, include: mainBillRowInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return rows.map(toMainBillRow);
}

export async function getMainBill(id: string): Promise<MainBillDetail> {
  const m = await prisma.mainBill.findUnique({ where: { id }, include: { ...mainBillRowInclude, client: true } });
  if (!m) throw notFound("Final settlement");
  const [job, details, subBills] = await Promise.all([
    loadJob(prisma, m.jobId),
    prisma.job.findUniqueOrThrow({ where: { id: m.jobId }, include: { product: true } }),
    prisma.subBill.findMany({ where: { jobId: m.jobId, voidedAt: null }, include: subBillRowInclude, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  const items = summarizeJobItems(job);
  const settled = !m.cancelledAt;
  const row = toMainBillRow(m);
  return {
    ...row,
    client: { ...m.client, paymentPolicy: m.client.paymentPolicy as PaymentPolicy | null, createdAt: m.client.createdAt.toISOString() },
    job: {
      ...row.job,
      jobDate: details.jobDate.toISOString(),
      expectedReturnDate: iso(details.expectedReturnDate),
      completedAt: iso(details.completedAt),
      notes: details.notes,
    },
    product: { id: details.product.id, name: details.product.name, code: details.product.code, unit: details.product.unit as Unit, description: details.product.description },
    designs: items.map((it) => ({
      jobItemId: it.id,
      designName: it.designName,
      designCode: it.designCode ?? null,
      ratePaise: it.ratePaise,
      quantity: it.quantity,
      sent: it.sent,
      ok: it.ok,
      damaged: it.damaged,
      rejected: it.rejected,
      lost: it.lost,
      // A settled challan is paid in full; payments are by amount, so paid = everything payable.
      paidQty: settled ? it.payableQty : it.billedQty,
      paidValuePaise: settled ? it.completedValuePaise : it.billedValuePaise,
    })),
    subBills: subBills.map((b) => toSubBillRow(b)),
    totals: sumTotals(items),
    business: await getSettings(),
  };
}

// ───────────────────────── Money summary ─────────────────────────

/** Work value, paid and still payable. Payable is netted per worker (an advance on one challan offsets another). */
export async function moneySummary(db: DB, clientId?: string): Promise<MoneySummary> {
  const jobs = await loadJobs(db, { clientId });
  const perWorker = new Map<string, { value: number; paid: number }>();
  let completedValuePaise = 0;
  let paidPaise = 0;
  for (const j of jobs) {
    const value = sumTotals(summarizeJobItems(j)).completedValuePaise;
    completedValuePaise += value;
    paidPaise += j.agg.paidPaise;
    const w = perWorker.get(j.clientId) ?? { value: 0, paid: 0 };
    w.value += value;
    w.paid += j.agg.paidPaise;
    perWorker.set(j.clientId, w);
  }
  let toPayPaise = 0;
  for (const w of perWorker.values()) toPayPaise += Math.max(0, w.value - w.paid);
  return { completedValuePaise, paidPaise, toPayPaise };
}
