import { prisma, type Prisma } from "@av/db";
import {
  exceedsPending,
  formatINR,
  lineAmount,
  payableQty,
  qtyFitsUnit,
  returnLineTotal,
  roundQty,
  sumTotals,
  type ReturnDetail,
  type ReturnResult,
  type SubBillWithEmail,
  type Unit,
  returnCreateSchema,
  returnUpdateSchema,
} from "@av/shared";
import type { z } from "zod";
import { audit, userNames } from "../lib/audit.js";
import { nextNumber } from "../lib/counter.js";
import { toDate, today } from "../lib/dates.js";
import { HttpError, notFound, unprocessable } from "../lib/http.js";
import { MANAGERS } from "../middleware/auth.js";
import { emailSubBill } from "./bill-email.js";
import { createVoucherTx, getSettings, getSubBill, voucherFromReturn } from "./billing.js";
import { type Actor, getJobDetail, loadJob, recomputeJobStatus, subBillRowInclude, summarizeJobItems, toSubBillRow } from "./jobs.js";
import { defaultTerms, num, termsFor } from "./ledger.js";
import { photoInclude, toPhotoViews } from "./photo-views.js";
import { lineNumbers, loadReturnRows, returnRowInclude, toReturnRows } from "./return-rows.js";

const canOverride = (actor?: Actor) => !actor || MANAGERS.includes(actor.role as never);

function assertQty(n: number, unit: Unit, label: string) {
  if (!qtyFitsUnit(n, unit)) throw unprocessable(`${label}: ${n} is not a valid quantity in ${unit}`);
}

const flagNames = (f: { payDamaged: boolean; payRejected: boolean; payLost: boolean }) =>
  [f.payDamaged && "damaged", f.payRejected && "rejected", f.payLost && "lost"].filter(Boolean).join(", ") || "good only";

// ───────────────────────── Create ─────────────────────────

export async function createReturn(jobId: string, input: z.output<typeof returnCreateSchema>, actor?: Actor): Promise<ReturnResult> {
  const userId = actor?.id;
  const defaults = await defaultTerms(prisma);
  const result = await prisma.$transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    const items = new Map(summarizeJobItems(job).map((i) => [i.id, i]));
    if ([...items.values()].every((i) => i.sent === 0)) throw unprocessable("Nothing has been issued on this challan yet");

    const problems: { jobItemId: string; designName: string; pending: number; entered: number }[] = [];
    const lines = input.lines.map((l) => {
      const it = items.get(l.jobItemId);
      if (!it) throw unprocessable("A design line doesn't belong to this challan");
      for (const [k, label] of [["okQty", "Good"], ["damagedQty", "Damaged"], ["rejectedQty", "Rejected"], ["lostQty", "Lost"]] as const) assertQty(l[k], it.unit, `${it.designName} ${label}`);
      if (exceedsPending(it.pending, l) && !l.exceptionReason) problems.push({ jobItemId: it.id, designName: it.designName, pending: it.pending, entered: returnLineTotal(l) });
      const flags = { payDamaged: l.payDamaged ?? defaults.payDamaged, payRejected: l.payRejected ?? defaults.payRejected, payLost: l.payLost ?? defaults.payLost };
      // Only matters when it changes what is paid for on this line.
      const overridden = payableQty(l, flags) !== payableQty(l, defaults);
      if (overridden) {
        if (!canOverride(actor)) throw new HttpError(403, "Only the owner or a manager can change which quantities are payable");
        if (!l.payOverrideReason) throw unprocessable(`${it.designName}: give a reason for changing which quantities are payable`);
      }
      return { it, l, flags, overridden, ratePaise: l.ratePaise ?? it.ratePaise };
    });
    if (problems.length) {
      throw new HttpError(
        422,
        problems.map((p) => `${p.designName}: only ${p.pending} pending but ${p.entered} entered`).join(". ") + ". Add a reason to record it anyway.",
        { exceeds: problems },
      );
    }

    const returnNumber = await nextNumber(tx, "return", "RET");
    const r = await tx.return.create({
      data: {
        returnNumber,
        jobId,
        date: toDate(input.date),
        receivedAt: new Date(),
        notes: input.notes,
        enteredById: userId,
        lines: {
          create: lines.map(({ l, flags, overridden, ratePaise }) => ({
            jobItemId: l.jobItemId,
            okQty: l.okQty,
            damagedQty: l.damagedQty,
            rejectedQty: l.rejectedQty,
            lostQty: l.lostQty,
            ratePaise,
            ...flags,
            payOverrideReason: overridden ? l.payOverrideReason : null,
            exceptionReason: l.exceptionReason,
          })),
        },
      },
    });
    const receivedNow = roundQty(lines.reduce((s, x) => s + returnLineTotal(x.l), 0));
    const okNow = roundQty(lines.reduce((s, x) => s + x.l.okQty, 0));
    const valueNow = lines.reduce((s, x) => s + lineAmount(payableQty(x.l, x.flags), x.ratePaise), 0);

    await audit(tx, {
      entity: "Return",
      entityId: r.id,
      action: "create",
      summary: `${returnNumber}: ${lines.map((x) => `${x.it.designName} ${returnLineTotal(x.l)} ${x.it.unit} @ ${formatINR(x.ratePaise)}`).join(", ")} = ${formatINR(valueNow)}`,
      after: lines.map((x) => ({ design: x.it.designName, ...x.l, ratePaise: x.ratePaise, ...x.flags })),
      userId,
    });
    for (const x of lines) {
      if (x.ratePaise !== x.it.ratePaise) {
        await audit(tx, { entity: "Job", entityId: jobId, action: "update", summary: `${returnNumber}: ${x.it.designName} received at ${formatINR(x.ratePaise)} (challan rate ${formatINR(x.it.ratePaise)})`, userId });
      }
      if (x.overridden) {
        await audit(tx, { entity: "Job", entityId: jobId, action: "exception", summary: `${returnNumber}: ${x.it.designName} payable quantities: ${flagNames(x.flags)}. Reason: ${x.l.payOverrideReason}`, reason: x.l.payOverrideReason, userId });
      }
      if (x.l.exceptionReason && exceedsPending(x.it.pending, x.l)) {
        await audit(tx, {
          entity: "Job",
          entityId: jobId,
          action: "exception",
          summary: `${x.it.designName}: ${returnLineTotal(x.l)} recorded against ${x.it.pending} pending on ${returnNumber}. Reason: ${x.l.exceptionReason}`,
          reason: x.l.exceptionReason,
          userId,
        });
      }
    }
    const { status, previous } = await recomputeJobStatus(tx, jobId, userId);

    let voucherId: string | null = null;
    if (input.payment && input.payment.amountPaise > 0) {
      voucherId = (await createVoucherTx(tx, voucherFromReturn(jobId, r.id, input.date, input.payment), actor)).id;
    }
    return { id: r.id, returnNumber, receivedAt: r.receivedAt.toISOString(), receivedNow, okNow, okValueNowPaise: valueNow, justCompleted: status === "COMPLETED" && previous !== "COMPLETED", voucherId, job };
  });

  let voucher: SubBillWithEmail | null = null;
  if (result.voucherId) {
    const email = await emailSubBill(result.voucherId, userId, { auto: true });
    voucher = { ...(await getSubBill(result.voucherId)), email };
  }
  const [job, rows] = await Promise.all([getJobDetail(jobId), loadReturnRows(prisma, { id: result.id }, today())]);
  const terms = termsFor(result.job as never, result.job.client as never, defaults);
  const { voucherId: _v, job: _j, ...rest } = result;
  return { ...rest, job, terms, billingPolicy: terms.policy, payment: rows[0]?.payment ?? null, voucher, warnings: [] };
}

// ───────────────────────── Edit (audited) ─────────────────────────

export async function updateReturn(returnId: string, input: z.output<typeof returnUpdateSchema>, actor?: Actor) {
  const userId = actor?.id;
  const r = await prisma.return.findUnique({ where: { id: returnId }, include: { lines: true } });
  if (!r) throw notFound("Return");
  if (r.voidedAt) throw unprocessable("A voided return can't be edited");
  const warnings: string[] = [];

  await prisma.$transaction(async (tx) => {
    const job = await loadJob(tx, r.jobId);
    const items = new Map(summarizeJobItems(job).map((i) => [i.id, i]));
    const changes: string[] = [];
    const before: unknown[] = [];
    const after: unknown[] = [];

    for (const nl of input.lines ?? []) {
      const cur = r.lines.find((l) => l.id === nl.id);
      if (!cur) throw unprocessable("A line doesn't belong to this return");
      const it = items.get(cur.jobItemId)!;
      const curQ = { okQty: num(cur.okQty), damagedQty: num(cur.damagedQty), rejectedQty: num(cur.rejectedQty), lostQty: num(cur.lostQty) };
      for (const [k, label] of [["okQty", "Good"], ["damagedQty", "Damaged"], ["rejectedQty", "Rejected"], ["lostQty", "Lost"]] as const) assertQty(nl[k], it.unit, `${it.designName} ${label}`);
      // What could come back on this line if this return didn't exist.
      const room = roundQty(it.sent - (it.accounted - returnLineTotal(curQ)));
      const exceptionReason = nl.exceptionReason ?? cur.exceptionReason;
      if (returnLineTotal(nl) > room + 1e-9 && !exceptionReason) {
        throw new HttpError(422, `${it.designName}: only ${Math.max(0, room)} ${it.unit} can be on this return but ${returnLineTotal(nl)} entered. Add a reason to record it anyway.`, {
          exceeds: [{ jobItemId: it.id, designName: it.designName, pending: Math.max(0, room), entered: returnLineTotal(nl) }],
        });
      }
      const flags = { payDamaged: nl.payDamaged ?? cur.payDamaged, payRejected: nl.payRejected ?? cur.payRejected, payLost: nl.payLost ?? cur.payLost };
      const flagsChanged = flags.payDamaged !== cur.payDamaged || flags.payRejected !== cur.payRejected || flags.payLost !== cur.payLost;
      if (flagsChanged && !canOverride(actor)) throw new HttpError(403, "Only the owner or a manager can change which quantities are payable");

      const diff: string[] = [];
      for (const [k, label] of [["okQty", "good"], ["damagedQty", "damaged"], ["rejectedQty", "rejected"], ["lostQty", "lost"]] as const)
        if (nl[k] !== curQ[k]) diff.push(`${label} ${curQ[k]} → ${nl[k]}`);
      if (nl.ratePaise !== cur.ratePaise) diff.push(`rate ${formatINR(cur.ratePaise)} → ${formatINR(nl.ratePaise)}`);
      if (flagsChanged) diff.push(`payable ${flagNames(cur)} → ${flagNames(flags)}`);
      if (!diff.length) continue;

      changes.push(`${it.designName}: ${diff.join(", ")}`);
      before.push({ design: it.designName, ...curQ, ratePaise: cur.ratePaise, payDamaged: cur.payDamaged, payRejected: cur.payRejected, payLost: cur.payLost });
      after.push({ design: it.designName, okQty: nl.okQty, damagedQty: nl.damagedQty, rejectedQty: nl.rejectedQty, lostQty: nl.lostQty, ratePaise: nl.ratePaise, ...flags });
      await tx.returnLine.update({
        where: { id: cur.id },
        data: {
          okQty: nl.okQty,
          damagedQty: nl.damagedQty,
          rejectedQty: nl.rejectedQty,
          lostQty: nl.lostQty,
          ratePaise: nl.ratePaise,
          ...flags,
          payOverrideReason: flagsChanged ? input.reason : cur.payOverrideReason,
          exceptionReason,
        },
      });
    }

    const header: Prisma.ReturnUpdateInput = {};
    if (input.date && input.date !== r.date.toISOString().slice(0, 10)) {
      changes.push(`date ${r.date.toISOString().slice(0, 10)} → ${input.date}`);
      header.date = toDate(input.date);
    }
    if (input.notes !== undefined && input.notes !== r.notes) header.notes = input.notes;
    if (!changes.length && !Object.keys(header).length) return;
    await tx.return.update({ where: { id: returnId }, data: { ...header, editedAt: new Date() } });

    if (changes.length) {
      const summary = `${r.returnNumber} edited – ${changes.join("; ")}`;
      await audit(tx, { entity: "Return", entityId: returnId, action: "update", summary, reason: input.reason, before, after, userId });
      await audit(tx, { entity: "Job", entityId: r.jobId, action: "update", summary: `${summary}. Reason: ${input.reason}`, reason: input.reason, userId });
    }

    const after2 = await loadJob(tx, r.jobId);
    for (const it of summarizeJobItems(after2)) {
      if (it.billedQty > it.ok + 1e-9) throw unprocessable(`${it.designName}: ${it.billedQty} ${it.unit} are already paid by quantity. Void those vouchers first.`);
    }
    const totals = sumTotals(summarizeJobItems(after2));
    if (after2.agg.paidPaise > totals.completedValuePaise) {
      warnings.push(`Payments now exceed the work value by ${formatINR(after2.agg.paidPaise - totals.completedValuePaise)} – this is shown as an advance.`);
    }
    await recomputeJobStatus(tx, r.jobId, userId);
  });
  return { ...(await getReturn(returnId)), warnings };
}

export async function voidReturn(returnId: string, reason: string, actor?: Actor) {
  const r = await prisma.return.findUnique({ where: { id: returnId } });
  if (!r) throw notFound("Return");
  if (r.voidedAt) throw unprocessable("This return is already voided");
  await prisma.$transaction(async (tx) => {
    await tx.return.update({ where: { id: returnId }, data: { voidedAt: new Date(), voidReason: reason } });
    const job = await loadJob(tx, r.jobId);
    for (const it of summarizeJobItems(job)) {
      if (it.billedQty > it.ok + 1e-9) throw unprocessable(`${it.designName}: these pieces are already paid for by quantity. Void the payment voucher first.`);
    }
    await audit(tx, { entity: "Return", entityId: returnId, action: "void", summary: `${r.returnNumber} voided: ${reason}`, reason, userId: actor?.id });
    await recomputeJobStatus(tx, r.jobId, actor?.id);
  });
  return getJobDetail(r.jobId);
}

// ───────────────────────── Read ─────────────────────────

export async function getReturn(returnId: string): Promise<ReturnDetail> {
  const r = await prisma.return.findUnique({ where: { id: returnId }, include: returnRowInclude });
  if (!r) throw notFound("Return");
  const now = today();
  const [[row], job, photos, vouchers, history, business] = await Promise.all([
    toReturnRows(prisma, [r], now),
    loadJob(prisma, r.jobId),
    prisma.returnPhoto.findMany({ where: { returnId }, include: photoInclude, orderBy: { createdAt: "asc" } }),
    prisma.subBill.findMany({ where: { returnId }, include: subBillRowInclude, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({
      where: { OR: [{ entity: "Return", entityId: returnId }, { entity: "ReturnPhoto", after: { path: ["returnId"], equals: returnId } }] },
      orderBy: { createdAt: "asc" },
    }),
    getSettings(),
  ]);
  const items = new Map(summarizeJobItems(job).map((i) => [i.id, i]));
  const names = await userNames(prisma, [...history.map((h) => h.userId), ...vouchers.map((v) => v.enteredById)]);
  return {
    ...row,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    lines: r.lines.map((l) => {
      const n = lineNumbers(l);
      const it = items.get(l.jobItemId)!;
      return {
        id: l.id,
        jobItemId: l.jobItemId,
        designId: l.jobItem.designId,
        designName: l.jobItem.designName,
        unit: l.jobItem.unit as Unit,
        okQty: n.okQty,
        damagedQty: n.damagedQty,
        rejectedQty: n.rejectedQty,
        lostQty: n.lostQty,
        ratePaise: l.ratePaise,
        challanRatePaise: l.jobItem.ratePaise,
        payDamaged: l.payDamaged,
        payRejected: l.payRejected,
        payLost: l.payLost,
        payOverrideReason: l.payOverrideReason,
        payableQty: n.payableQty,
        valuePaise: n.valuePaise,
        exceptionReason: l.exceptionReason,
        pendingBefore: r.voidedAt ? it.pending : roundQty(it.sent - (it.accounted - n.total)),
      };
    }),
    photos: await toPhotoViews(prisma, photos),
    vouchers: vouchers.map((v) => toSubBillRow(v, undefined, names)),
    history: history.map((h) => ({ at: h.createdAt.toISOString(), action: h.action, summary: h.summary, reason: h.reason, user: h.userId ? (names.get(h.userId) ?? null) : null })),
    business,
  };
}

export interface ReturnListFilter {
  clientId?: string;
  jobId?: string;
  designId?: string;
  productId?: string;
  jobWorkTypeId?: string;
  from?: string;
  to?: string;
  q?: string;
  includeVoided?: boolean;
  skip?: number;
  take?: number;
}

export function returnWhere(f: ReturnListFilter): Prisma.ReturnWhereInput {
  const where: Prisma.ReturnWhereInput = {
    jobId: f.jobId,
    voidedAt: f.includeVoided ? undefined : null,
    date: f.from || f.to ? { gte: f.from ? toDate(f.from) : undefined, lte: f.to ? toDate(f.to) : undefined } : undefined,
    job: { clientId: f.clientId, productId: f.productId },
  };
  const lineFilter: Prisma.ReturnLineWhereInput = {};
  if (f.designId) lineFilter.jobItem = { designId: f.designId };
  if (f.jobWorkTypeId) lineFilter.jobItem = { ...(lineFilter.jobItem as object), jobWorkTypeId: f.jobWorkTypeId };
  if (Object.keys(lineFilter).length) where.lines = { some: lineFilter };
  if (f.q) {
    const ci = { contains: f.q, mode: "insensitive" as const };
    where.OR = [{ returnNumber: ci }, { job: { jobNumber: ci } }, { job: { client: { name: ci } } }, { lines: { some: { jobItem: { designName: ci } } } }, { notes: ci }];
  }
  return where;
}

/** Returns, newest arrival first, paginated. */
export async function listReturns(f: ReturnListFilter) {
  const where = returnWhere(f);
  const [total, rows] = await Promise.all([
    prisma.return.count({ where }),
    loadReturnRows(prisma, where, today(), { orderBy: [{ date: "desc" }, { receivedAt: "desc" }], skip: f.skip, take: f.take ?? 50 }),
  ]);
  return { total, rows };
}
