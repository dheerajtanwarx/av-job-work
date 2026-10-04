import { prisma, type DB, type Prisma } from "@av/db";
import {
  deriveJobStatus,
  exceedsPending,
  isOverdue,
  paymentStatus,
  sumTotals,
  summarizeItem,
  type DispatchCreateInput,
  type JobDetail,
  type JobItemView,
  type JobListRow,
  type JobStatus,
  type ReturnResult,
  type TimelineEvent,
  dispatchCreateSchema,
  jobCreateSchema,
  jobUpdateSchema,
  returnCreateSchema,
} from "@av/shared";
import type { z } from "zod";
import { audit } from "../lib/audit.js";
import { nextNumber } from "../lib/counter.js";
import { iso, toDate, toDateOrNull } from "../lib/dates.js";
import { HttpError, notFound, unprocessable } from "../lib/http.js";

/** Everything needed to compute a job's quantities and money. */
export const jobInclude = {
  client: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, unit: true } },
  items: {
    orderBy: { sortOrder: "asc" },
    include: {
      dispatchLines: { select: { qty: true, dispatch: { select: { kind: true, voidedAt: true } } } },
      returnLines: {
        select: { okQty: true, damagedQty: true, rejectedQty: true, lostQty: true, return: { select: { voidedAt: true } } },
      },
      invoiceLines: { select: { qty: true, invoice: { select: { cancelledAt: true } } } },
    },
  },
  returns: { where: { voidedAt: null }, select: { id: true }, take: 1 },
} satisfies Prisma.JobInclude;

export type JobWithLedger = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

export function summarizeJobItems(job: JobWithLedger): JobItemView[] {
  return job.items.map((it) => {
    let initialSent = 0;
    let reworkSent = 0;
    for (const dl of it.dispatchLines) {
      if (dl.dispatch.voidedAt) continue;
      if (dl.dispatch.kind === "REWORK") reworkSent += dl.qty;
      else initialSent += dl.qty;
    }
    let ok = 0,
      damaged = 0,
      rejected = 0,
      lost = 0;
    for (const rl of it.returnLines) {
      if (rl.return.voidedAt) continue;
      ok += rl.okQty;
      damaged += rl.damagedQty;
      rejected += rl.rejectedQty;
      lost += rl.lostQty;
    }
    const billedQty = it.invoiceLines.filter((l) => !l.invoice.cancelledAt).reduce((s, l) => s + l.qty, 0);
    return {
      id: it.id,
      designId: it.designId,
      designName: it.designName,
      sortOrder: it.sortOrder,
      ...summarizeItem({ quantity: it.quantity, ratePaise: it.ratePaise, initialSent, reworkSent, ok, damaged, rejected, lost, billedQty }),
    };
  });
}

export function toJobRow(job: JobWithLedger, items = summarizeJobItems(job)): JobListRow {
  const status = job.status as JobStatus;
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    jobDate: job.jobDate.toISOString(),
    expectedReturnDate: iso(job.expectedReturnDate),
    status,
    overdue: isOverdue(job.expectedReturnDate, status),
    client: job.client,
    product: job.product,
    designs: items.map((i) => i.designName),
    totals: sumTotals(items),
  };
}

export async function loadJobs(db: DB, where: Prisma.JobWhereInput = {}) {
  return db.job.findMany({ where, include: jobInclude, orderBy: [{ jobDate: "desc" }, { createdAt: "desc" }] });
}

async function loadJob(db: DB, id: string) {
  const job = await db.job.findUnique({ where: { id }, include: jobInclude });
  if (!job) throw notFound("Job");
  return job;
}

/** Re-derives and persists the job status. Must be called after every quantity mutation. */
export async function recomputeJobStatus(db: DB, jobId: string, userId?: string | null) {
  const job = await loadJob(db, jobId);
  const items = summarizeJobItems(job);
  const status = deriveJobStatus({ cancelled: !!job.cancelledAt, items, hasReturns: job.returns.length > 0 });
  if (status !== job.status) {
    const becameComplete = status === "COMPLETED";
    await db.job.update({
      where: { id: jobId },
      data: { status, completedAt: becameComplete ? new Date() : status === "CANCELLED" ? job.completedAt : null },
    });
    if (becameComplete || job.status === "COMPLETED") {
      await audit(db, {
        entity: "Job",
        entityId: jobId,
        action: becameComplete ? "completed" : "reopened",
        summary: becameComplete ? "Job completed – all pieces accounted for" : "Job reopened",
        userId,
      });
    }
  }
  return { status, previous: job.status as JobStatus };
}

// ───────────────────────── Create / update ─────────────────────────

export async function createJob(input: z.output<typeof jobCreateSchema>, userId?: string) {
  const id = await prisma.$transaction(async (tx) => {
    const [client, product] = await Promise.all([
      tx.client.findUnique({ where: { id: input.clientId } }),
      tx.product.findUnique({ where: { id: input.productId } }),
    ]);
    if (!client) throw unprocessable("Choose a valid client");
    if (!product) throw unprocessable("Choose a valid product");
    const designs = await tx.design.findMany({ where: { id: { in: input.items.map((i) => i.designId) } } });
    const byId = new Map(designs.map((d) => [d.id, d]));
    for (const it of input.items) if (!byId.has(it.designId)) throw unprocessable("One of the designs no longer exists");

    const jobNumber = await nextNumber(tx, "job", "JOB");
    const job = await tx.job.create({
      data: {
        jobNumber,
        clientId: input.clientId,
        productId: input.productId,
        jobDate: toDate(input.jobDate),
        expectedReturnDate: toDateOrNull(input.expectedReturnDate),
        notes: input.notes,
        items: {
          create: input.items.map((it, idx) => ({
            designId: it.designId,
            designName: byId.get(it.designId)!.name,
            quantity: it.quantity,
            ratePaise: it.ratePaise,
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });
    await audit(tx, {
      entity: "Job",
      entityId: job.id,
      action: "create",
      summary: `Job ${jobNumber} created`,
      after: { items: job.items.map((i) => ({ design: i.designName, qty: i.quantity, rate: i.ratePaise })) },
      userId,
    });

    if (input.dispatchNow) {
      await tx.dispatch.create({
        data: {
          jobId: job.id,
          date: toDate(input.jobDate),
          kind: "INITIAL",
          lines: { create: job.items.map((i) => ({ jobItemId: i.id, qty: i.quantity })) },
        },
      });
    }
    await recomputeJobStatus(tx, job.id, userId);
    return job.id;
  });
  return getJobDetail(id);
}

export async function updateJob(jobId: string, input: z.output<typeof jobUpdateSchema>, userId?: string) {
  await prisma.$transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.cancelledAt) throw unprocessable("This job is cancelled and can't be edited");
    const items = summarizeJobItems(job);
    const started = items.some((i) => i.sent > 0) || job.returns.length > 0;

    const header: Prisma.JobUncheckedUpdateInput = {};
    if (input.clientId && input.clientId !== job.clientId) {
      if (items.some((i) => i.billedQty > 0)) throw unprocessable("This job has been billed – the client can't be changed");
      header.clientId = input.clientId;
    }
    if (input.productId) header.productId = input.productId;
    if (input.jobDate) header.jobDate = toDate(input.jobDate);
    if (input.expectedReturnDate !== undefined) header.expectedReturnDate = toDateOrNull(input.expectedReturnDate);
    if (input.notes !== undefined) header.notes = input.notes;
    if (Object.keys(header).length) await tx.job.update({ where: { id: jobId }, data: header });

    if (!input.items) return;
    const designs = await tx.design.findMany({ where: { id: { in: input.items.map((i) => i.designId) } } });
    const designName = new Map(designs.map((d) => [d.id, d.name]));
    for (const it of input.items) if (!designName.has(it.designId)) throw unprocessable("One of the designs no longer exists");

    if (!started) {
      // Draft: replace the design lines entirely.
      const before = items.map((i) => ({ design: i.designName, qty: i.quantity, rate: i.ratePaise }));
      await tx.jobItem.deleteMany({ where: { jobId } });
      await tx.jobItem.createMany({
        data: input.items.map((it, idx) => ({
          jobId,
          designId: it.designId,
          designName: designName.get(it.designId)!,
          quantity: it.quantity,
          ratePaise: it.ratePaise,
          sortOrder: idx,
        })),
      });
      await audit(tx, {
        entity: "Job",
        entityId: jobId,
        action: "update",
        summary: "Design lines edited (draft)",
        before,
        after: input.items.map((i) => ({ design: designName.get(i.designId), qty: i.quantity, rate: i.ratePaise })),
        userId,
      });
      return;
    }

    // Started job: existing lines can't be removed; qty/rate changes are guarded and audited.
    const byId = new Map(items.map((i) => [i.id, i]));
    const changes: string[] = [];
    let sortOrder = items.length;
    for (const it of input.items) {
      if (!it.id) {
        await tx.jobItem.create({
          data: { jobId, designId: it.designId, designName: designName.get(it.designId)!, quantity: it.quantity, ratePaise: it.ratePaise, sortOrder: sortOrder++ },
        });
        changes.push(`Added ${designName.get(it.designId)} – ${it.quantity} pcs @ ₹${it.ratePaise / 100}`);
        continue;
      }
      const cur = byId.get(it.id);
      if (!cur) throw unprocessable("A design line doesn't belong to this job");
      const data: Prisma.JobItemUpdateInput = {};
      if (it.quantity !== cur.quantity) {
        if (it.quantity < cur.initialSent)
          throw unprocessable(`${cur.designName}: ${cur.initialSent} pieces are already sent, quantity can't be lower than that`);
        data.quantity = it.quantity;
        changes.push(`${cur.designName}: quantity ${cur.quantity} → ${it.quantity}`);
      }
      if (it.ratePaise !== cur.ratePaise) {
        if (cur.billedQty > 0) throw unprocessable(`${cur.designName} is already billed at ₹${cur.ratePaise / 100}. Cancel that invoice first to change the rate.`);
        data.ratePaise = it.ratePaise;
        changes.push(`${cur.designName}: rate ₹${cur.ratePaise / 100} → ₹${it.ratePaise / 100}`);
      }
      if (Object.keys(data).length) await tx.jobItem.update({ where: { id: it.id }, data });
    }
    if (changes.length) {
      await audit(tx, {
        entity: "Job",
        entityId: jobId,
        action: "update",
        summary: changes.join("; ") + (input.reason ? ` (Reason: ${input.reason})` : ""),
        userId,
      });
    }
    await recomputeJobStatus(tx, jobId, userId);
  });
  return getJobDetail(jobId);
}

export async function cancelJob(jobId: string, reason: string, userId?: string) {
  await prisma.$transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.cancelledAt) throw unprocessable("This job is already cancelled");
    const totals = sumTotals(summarizeJobItems(job));
    await tx.job.update({ where: { id: jobId }, data: { cancelledAt: new Date(), cancelReason: reason, status: "CANCELLED" } });
    await audit(tx, {
      entity: "Job",
      entityId: jobId,
      action: "cancel",
      summary: `Job cancelled: ${reason}${totals.pending ? ` (${totals.pending} pieces still with the client)` : ""}`,
      userId,
    });
  });
  return getJobDetail(jobId);
}

// ───────────────────────── Dispatch ─────────────────────────

export async function createDispatch(jobId: string, input: z.output<typeof dispatchCreateSchema>, userId?: string) {
  await prisma.$transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.cancelledAt) throw unprocessable("This job is cancelled");
    const items = new Map(summarizeJobItems(job).map((i) => [i.id, i]));
    for (const l of input.lines) {
      const it = items.get(l.jobItemId);
      if (!it) throw unprocessable("A design line doesn't belong to this job");
      if (input.kind === "INITIAL" && l.qty > it.notYetSent)
        throw unprocessable(`${it.designName}: only ${it.notYetSent} pieces are left to send`);
      if (input.kind === "REWORK") {
        const reworkable = it.rejected + it.damaged - it.reworkSent;
        if (l.qty > reworkable) throw unprocessable(`${it.designName}: only ${Math.max(0, reworkable)} rejected/damaged pieces can be sent for rework`);
      }
    }
    const d = await tx.dispatch.create({
      data: { jobId, date: toDate(input.date), kind: input.kind, notes: input.notes, lines: { create: input.lines } },
    });
    await audit(tx, {
      entity: "Dispatch",
      entityId: d.id,
      action: "create",
      summary: `${input.kind === "REWORK" ? "Rework sent" : "Material sent"}: ${input.lines.reduce((s, l) => s + l.qty, 0)} pcs`,
      after: input.lines,
      userId,
    });
    await recomputeJobStatus(tx, jobId, userId);
  });
  return getJobDetail(jobId);
}

export async function voidDispatch(dispatchId: string, reason: string, userId?: string) {
  const d = await prisma.dispatch.findUnique({ where: { id: dispatchId }, include: { lines: true } });
  if (!d) throw notFound("Dispatch");
  if (d.voidedAt) throw unprocessable("This entry is already voided");
  await prisma.$transaction(async (tx) => {
    await tx.dispatch.update({ where: { id: dispatchId }, data: { voidedAt: new Date(), voidReason: reason } });
    const job = await loadJob(tx, d.jobId);
    for (const it of summarizeJobItems(job)) {
      if (it.excess > 0) throw unprocessable(`${it.designName}: pieces from this dispatch were already returned. Void those returns first.`);
    }
    await audit(tx, { entity: "Dispatch", entityId: dispatchId, action: "void", summary: `Dispatch voided: ${reason}`, userId });
    await audit(tx, { entity: "Job", entityId: d.jobId, action: "void", summary: `Dispatch voided: ${reason}`, userId });
    await recomputeJobStatus(tx, d.jobId, userId);
  });
  return getJobDetail(d.jobId);
}

// ───────────────────────── Returns ─────────────────────────

export async function createReturn(jobId: string, input: z.output<typeof returnCreateSchema>, userId?: string): Promise<ReturnResult> {
  const result = await prisma.$transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    const items = new Map(summarizeJobItems(job).map((i) => [i.id, i]));
    if ([...items.values()].every((i) => i.sent === 0)) throw unprocessable("Nothing has been sent on this job yet");

    const problems: { jobItemId: string; designName: string; pending: number; entered: number }[] = [];
    for (const l of input.lines) {
      const it = items.get(l.jobItemId);
      if (!it) throw unprocessable("A design line doesn't belong to this job");
      if (exceedsPending(it.pending, l) && !l.exceptionReason) {
        problems.push({ jobItemId: it.id, designName: it.designName, pending: it.pending, entered: l.okQty + l.damagedQty + l.rejectedQty + l.lostQty });
      }
    }
    if (problems.length) {
      throw new HttpError(
        422,
        problems.map((p) => `${p.designName}: only ${p.pending} pending but ${p.entered} entered`).join(". ") + ". Add a reason to record it anyway.",
        { exceeds: problems },
      );
    }

    const returnNumber = await nextNumber(tx, "return", "RET");
    const r = await tx.return.create({
      data: { returnNumber, jobId, date: toDate(input.date), notes: input.notes, lines: { create: input.lines } },
    });
    const okNow = input.lines.reduce((s, l) => s + l.okQty, 0);
    const receivedNow = input.lines.reduce((s, l) => s + l.okQty + l.damagedQty + l.rejectedQty + l.lostQty, 0);
    const okValueNowPaise = input.lines.reduce((s, l) => s + l.okQty * items.get(l.jobItemId)!.ratePaise, 0);

    await audit(tx, { entity: "Return", entityId: r.id, action: "create", summary: `${returnNumber}: ${receivedNow} pcs received`, after: input.lines, userId });
    for (const l of input.lines.filter((x) => x.exceptionReason && exceedsPending(items.get(x.jobItemId)!.pending, x))) {
      const it = items.get(l.jobItemId)!;
      await audit(tx, {
        entity: "Job",
        entityId: jobId,
        action: "exception",
        summary: `${it.designName}: ${l.okQty + l.damagedQty + l.rejectedQty + l.lostQty} recorded against ${it.pending} pending on ${returnNumber}. Reason: ${l.exceptionReason}`,
        userId,
      });
    }
    const { status, previous } = await recomputeJobStatus(tx, jobId, userId);
    return { id: r.id, returnNumber, receivedNow, okNow, okValueNowPaise, justCompleted: status === "COMPLETED" && previous !== "COMPLETED" };
  });
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return { ...result, job: await getJobDetail(jobId), billingPolicy: settings?.billingPolicy ?? "MANUAL" };
}

export async function voidReturn(returnId: string, reason: string, userId?: string) {
  const r = await prisma.return.findUnique({ where: { id: returnId } });
  if (!r) throw notFound("Return");
  if (r.voidedAt) throw unprocessable("This return is already voided");
  await prisma.$transaction(async (tx) => {
    await tx.return.update({ where: { id: returnId }, data: { voidedAt: new Date(), voidReason: reason } });
    const job = await loadJob(tx, r.jobId);
    for (const it of summarizeJobItems(job)) {
      if (it.billedQty > it.ok) throw unprocessable(`${it.designName}: these pieces are already billed. Cancel the invoice first.`);
    }
    await audit(tx, { entity: "Return", entityId: returnId, action: "void", summary: `${r.returnNumber} voided: ${reason}`, userId });
    await recomputeJobStatus(tx, r.jobId, userId);
  });
  return getJobDetail(r.jobId);
}

// ───────────────────────── Read ─────────────────────────

export async function getJobDetail(jobId: string): Promise<JobDetail> {
  const job = await loadJob(prisma, jobId);
  const items = summarizeJobItems(job);
  const row = toJobRow(job, items);
  const itemName = new Map(job.items.map((i) => [i.id, i.designName]));

  const [full, invoiceLines, audits] = await Promise.all([
    prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        dispatches: { include: { lines: true }, orderBy: { createdAt: "asc" } },
        returns: { include: { lines: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.invoiceLine.findMany({
      where: { jobItem: { jobId } },
      include: { invoice: { include: { payments: true, lines: { select: { qty: true, amountPaise: true, jobItem: { select: { jobId: true } } } } } } },
    }),
    prisma.auditLog.findMany({ where: { entity: "Job", entityId: jobId, action: { in: ["update", "exception", "reopened", "void"] } }, orderBy: { createdAt: "asc" } }),
  ]);

  const timeline: TimelineEvent[] = [];
  const at = (d: Date) => d.toISOString();
  timeline.push({ type: "created", at: at(job.createdAt), date: at(job.jobDate), text: `Job created – ${row.totals.quantity} ${job.product.name} for ${job.client.name}` });

  for (const d of full.dispatches) {
    timeline.push({
      type: "dispatch",
      at: at(d.createdAt),
      date: at(d.date),
      id: d.id,
      kind: d.kind,
      total: d.lines.reduce((s, l) => s + l.qty, 0),
      lines: d.lines.map((l) => ({ designName: itemName.get(l.jobItemId) ?? "?", qty: l.qty })),
      notes: d.notes,
      voided: d.voidedAt ? { at: at(d.voidedAt), reason: d.voidReason } : null,
    });
  }
  for (const r of full.returns) {
    const okTotal = r.lines.reduce((s, l) => s + l.okQty, 0);
    const exceptionTotal = r.lines.reduce((s, l) => s + l.damagedQty + l.rejectedQty + l.lostQty, 0);
    timeline.push({
      type: "return",
      at: at(r.createdAt),
      date: at(r.date),
      id: r.id,
      returnNumber: r.returnNumber,
      total: okTotal + exceptionTotal,
      okTotal,
      exceptionTotal,
      lines: r.lines.map((l) => ({
        designName: itemName.get(l.jobItemId) ?? "?",
        okQty: l.okQty,
        damagedQty: l.damagedQty,
        rejectedQty: l.rejectedQty,
        lostQty: l.lostQty,
        exceptionReason: l.exceptionReason,
      })),
      notes: r.notes,
      voided: r.voidedAt ? { at: at(r.voidedAt), reason: r.voidReason } : null,
    });
  }

  const invoices = new Map<string, (typeof invoiceLines)[number]["invoice"]>();
  for (const l of invoiceLines) invoices.set(l.invoiceId, l.invoice);
  const invoiceSummaries: JobDetail["invoices"] = [];
  for (const inv of invoices.values()) {
    const forJob = inv.lines.filter((l) => l.jobItem.jobId === jobId);
    const paidPaise = inv.payments.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amountPaise, 0);
    invoiceSummaries.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: at(inv.date),
      totalPaise: inv.totalPaise,
      paidPaise,
      status: paymentStatus(inv.totalPaise, paidPaise, !!inv.cancelledAt),
    });
    timeline.push({
      type: "invoice",
      at: at(inv.createdAt),
      date: at(inv.date),
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      qty: forJob.reduce((s, l) => s + l.qty, 0),
      amountPaise: inv.totalPaise,
      cancelled: !!inv.cancelledAt,
    });
    for (const p of inv.payments) {
      timeline.push({
        type: "payment",
        at: at(p.createdAt),
        date: at(p.date),
        id: p.id,
        invoiceNumber: inv.invoiceNumber,
        amountPaise: p.amountPaise,
        method: p.method,
        voided: !!p.voidedAt,
      });
    }
  }
  if (job.completedAt && job.status === "COMPLETED") {
    timeline.push({ type: "completed", at: at(job.completedAt), date: lastActivityDate(full.returns, full.dispatches) ?? at(job.completedAt), text: "Job completed – all pieces accounted for" });
  }
  if (job.cancelledAt) {
    timeline.push({ type: "cancelled", at: at(job.cancelledAt), date: at(job.cancelledAt), text: `Job cancelled${job.cancelReason ? `: ${job.cancelReason}` : ""}` });
  }
  for (const a of audits) {
    if (a.action === "void") continue; // voids are shown on the entry itself
    timeline.push({ type: "audit", at: at(a.createdAt), date: at(a.createdAt), text: a.summary ?? a.action });
  }
  timeline.sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || a.at.localeCompare(b.at));

  invoiceSummaries.sort((a, b) => a.date.localeCompare(b.date));
  return {
    ...row,
    notes: job.notes,
    cancelReason: job.cancelReason,
    cancelledAt: iso(job.cancelledAt),
    completedAt: iso(job.completedAt),
    createdAt: at(job.createdAt),
    items,
    timeline,
    invoices: invoiceSummaries,
  };
}

function lastActivityDate(returns: { date: Date; voidedAt: Date | null }[], dispatches: { date: Date; voidedAt: Date | null }[]) {
  const dates = [...returns, ...dispatches].filter((x) => !x.voidedAt).map((x) => x.date.getTime());
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
}

export type { DispatchCreateInput };
