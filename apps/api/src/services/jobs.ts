import { randomBytes } from "node:crypto";
import { all, db, newId, transaction, type Client, type DB, type Filter, type Job, type JobItem, type MainBill, type Populate, type SubBill } from "@av/db";
import {
  agingBucket,
  dayOf,
  deriveJobStatus,
  diffDays,
  isOverdue,
  isSettled,
  moneyPosition,
  payStatus,
  qtyFitsUnit,
  returnLineValue,
  sumTotals,
  summarizeItem,
  DISPATCH_KIND_LABEL,
  type JobDetail,
  type JobItemView,
  type JobListRow,
  type JobStatus,
  type MainBillRow,
  type PaymentPolicy,
  type SubBillRow,
  type TimelineEvent,
  type Unit,
  dispatchCreateSchema,
  jobCreateSchema,
  jobUpdateSchema,
} from "@av/shared";
import type { z } from "zod";
import { audit, editedBy, editMark, userNames } from "../lib/audit.js";
import { nextNumber } from "../lib/counter.js";
import { iso, toDate, toDateOrNull, today } from "../lib/dates.js";
import { notFound, unprocessable } from "../lib/http.js";
import { defaultTerms, emptyAgg, itemAggregates, jobAggregates, num, termsFor, type ItemAgg, type JobAgg } from "./ledger.js";
import { loadReturnRows } from "./return-rows.js";
import { checkStock } from "./stock.js";

export interface Actor {
  id: string;
  role: string;
}

/** The challan header and design lines; quantities and money are attached from aggregation pipelines. */
export const jobPopulate: Populate = [
  { path: "client", select: "name paymentPolicy paymentDays" },
  { path: "product", select: "name unit" },
  { path: "jobWorkType", select: "name" },
  { path: "items.design", select: "code" },
  { path: "items.material", select: "code name" },
  { path: "items.jobWorkType", select: "name" },
  { path: "items.photos", select: "kind originalName", match: { removedAt: null }, options: { sort: { createdAt: 1, _id: 1 } } },
];

type Named = { id: string; name: string };
export type JobItemBase = JobItem & {
  design: { id: string; code: string | null };
  material: { id: string; code: string; name: string } | null;
  jobWorkType: Named | null;
  photos: { id: string; kind: "ITEM" | "DESIGN"; originalName: string | null }[];
};
export type JobBase = Omit<Job, "items"> & {
  client: Pick<Client, "id" | "name" | "paymentPolicy" | "paymentDays">;
  product: Named & { unit: Unit };
  jobWorkType: Named | null;
  items: JobItemBase[];
};
export type JobWithLedger = JobBase & { agg: JobAgg; itemAgg: Map<string, ItemAgg> };

/** Missing optional relations come back as null (as the API has always returned them); design lines keep their order. */
function shapeJob(j: JobBase): JobBase {
  j.jobWorkType ??= null;
  j.items.sort((a, b) => a.sortOrder - b.sortOrder);
  for (const it of j.items) {
    it.material = it.material ? { id: it.material.id, code: it.material.code, name: it.material.name } : null;
    it.jobWorkType = it.jobWorkType ? { id: it.jobWorkType.id, name: it.jobWorkType.name } : null;
    it.photos = (it.photos ?? []).map((p) => ({ id: p.id, kind: p.kind, originalName: p.originalName }));
  }
  return j;
}

export async function withLedgers(db: DB, jobs: JobBase[]): Promise<JobWithLedger[]> {
  const ids = jobs.map((j) => j.id);
  const [items, agg] = await all([() => itemAggregates(db, ids), () => jobAggregates(db, ids)]);
  return jobs.map((j) => ({ ...j, agg: agg.get(j.id)!, itemAgg: items }));
}

export async function loadJobs(db: DB, where: Filter = {}, opts: { skip?: number; take?: number } = {}) {
  const jobs = await db.job.find<JobBase>(where, { populate: jobPopulate, sort: { jobDate: -1, createdAt: -1 }, skip: opts.skip, limit: opts.take });
  return withLedgers(db, jobs.map(shapeJob));
}

export async function loadJob(db: DB, id: string) {
  const job = await db.job.findById<JobBase>(id, { populate: jobPopulate });
  if (!job) throw notFound("Challan");
  return (await withLedgers(db, [shapeJob(job)]))[0];
}

export function summarizeJobItems(job: JobWithLedger): JobItemView[] {
  return job.items.map((it) => {
    const a = job.itemAgg.get(it.id) ?? emptyAgg();
    return {
      id: it.id,
      designId: it.designId,
      designName: it.designName,
      designCode: it.design.code,
      unit: it.unit as Unit,
      material: it.material,
      jobWorkType: it.jobWorkType,
      notes: it.notes,
      sortOrder: it.sortOrder,
      photos: it.photos.map((p) => ({ id: p.id, kind: p.kind, name: p.originalName })),
      ...summarizeItem({ quantity: num(it.quantity), ratePaise: it.ratePaise, ...a }),
    };
  });
}

export function toJobRow(job: JobWithLedger, items = summarizeJobItems(job), now = today()): JobListRow {
  const status = job.status as JobStatus;
  const totals = sumTotals(items);
  const money = moneyPosition(totals.completedValuePaise, job.agg.paidPaise);
  const out = totals.pending > 0 && status !== "CANCELLED";
  const daysOut = out ? Math.max(0, diffDays(now, job.jobDate)) : 0;
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    jobDate: job.jobDate.toISOString(),
    expectedReturnDate: iso(job.expectedReturnDate),
    status,
    overdue: isOverdue(job.expectedReturnDate, status, now),
    daysOut,
    aging: out ? agingBucket(daysOut) : null,
    client: { id: job.client.id, name: job.client.name },
    product: { ...job.product, unit: job.product.unit as Unit },
    jobWorkType: job.jobWorkType,
    unit: (items[0]?.unit ?? job.product.unit) as Unit,
    designs: items.map((i) => i.designName),
    totals,
    money,
    payStatus: payStatus(money.valuePaise, money.paidPaise),
  };
}

/**
 * Re-derives and persists the challan status, then keeps the final settlement in step with it.
 * Must be called after every quantity or payment mutation.
 */
export async function recomputeJobStatus(db: DB, jobId: string, userId?: string | null) {
  const job = await loadJob(db, jobId);
  const items = summarizeJobItems(job);
  const status = deriveJobStatus({ cancelled: !!job.cancelledAt, items, hasReturns: job.agg.returnCount > 0 });
  if (status !== job.status) {
    const becameComplete = status === "COMPLETED";
    await db.job.update(jobId, { status, completedAt: becameComplete ? new Date() : status === "CANCELLED" ? job.completedAt : null });
    if (becameComplete || job.status === "COMPLETED") {
      await audit(db, {
        entity: "Job",
        entityId: jobId,
        action: becameComplete ? "completed" : "reopened",
        summary: becameComplete ? "Challan completed – all material accounted for" : "Challan reopened",
        userId,
      });
    }
  }
  const totals = sumTotals(items);
  await syncMainBill(db, job, isSettled(status, totals.completedValuePaise, job.agg.paidPaise), totals.payableQty, totals.completedValuePaise, userId);
  return { status, previous: job.status as JobStatus };
}

/**
 * A challan gets one final settlement once it is complete and its job work value is fully paid.
 * If that stops being true (a voucher or return is voided or edited) the settlement is cancelled, and it
 * is re-activated under the same number when the challan is settled again.
 */
async function syncMainBill(db: DB, job: JobWithLedger, settled: boolean, qty: number, valuePaise: number, userId?: string | null) {
  const existing = await db.mainBill.findOne({ jobId: job.id });
  const active = existing && !existing.cancelledAt;
  if (!settled) {
    if (active) {
      await db.mainBill.update(existing.id, { cancelledAt: new Date(), cancelReason: "Challan is no longer fully paid" });
      await audit(db, { entity: "Job", entityId: job.id, action: "settlement", summary: `Final settlement ${existing.billNumber} cancelled – challan is no longer fully paid`, userId });
    }
    return;
  }

  const last = await db.subBill.findOne({ jobId: job.id, voidedAt: null }, { sort: { date: -1, createdAt: -1 }, select: "date" });
  const date = last?.date ?? new Date();
  if (active) {
    if (existing.totalPaise !== valuePaise || num(existing.qty) !== qty) await db.mainBill.update(existing.id, { totalPaise: valuePaise, qty, date });
    return;
  }
  if (existing) {
    await db.mainBill.update(existing.id, { cancelledAt: null, cancelReason: null, totalPaise: valuePaise, qty, date });
    await audit(db, { entity: "Job", entityId: job.id, action: "settlement", summary: `Final settlement ${existing.billNumber} re-issued for ₹${valuePaise / 100}`, userId });
    return;
  }
  const billNumber = await nextNumber(db, "mainBill", "MB");
  await db.mainBill.create({ billNumber, jobId: job.id, clientId: job.clientId, date, qty, totalPaise: valuePaise });
  await audit(db, { entity: "Job", entityId: job.id, action: "settlement", summary: `Challan fully paid – final settlement ${billNumber} issued for ₹${valuePaise / 100}`, userId });
}

// ───────────────────────── Create / update ─────────────────────────

export const newPublicToken = () => randomBytes(32).toString("hex");

function assertUnit(qty: number, unit: Unit, label: string) {
  if (!qtyFitsUnit(qty, unit)) throw unprocessable(`${label}: ${qty} is not a valid quantity in ${unit}${unit === "PCS" || unit === "SET" || unit === "DOZEN" || unit === "ROLL" ? " (whole numbers only)" : ""}`);
}

export async function createJob(input: z.output<typeof jobCreateSchema>, actor?: Actor) {
  const userId = actor?.id;
  const id = await transaction(async (tx) => {
    const client = await tx.client.findById(input.clientId);
    const product = await tx.product.findById(input.productId);
    if (!client) throw unprocessable("Choose a valid job worker");
    if (!product) throw unprocessable("Choose a valid product");
    const designs = await tx.design.find({ _id: { $in: input.items.map((i) => i.designId) } });
    const materials = await tx.material.find({ _id: { $in: input.items.map((i) => i.materialId) } });
    const byId = new Map(designs.map((d) => [d.id, d]));
    const matById = new Map(materials.map((m) => [m.id, m]));
    for (const it of input.items) {
      const d = byId.get(it.designId);
      if (!d) throw unprocessable("One of the designs no longer exists");
      const m = matById.get(it.materialId);
      if (!m) throw unprocessable("Choose the material for every design line");
      assertUnit(it.quantity, m.unit as Unit, d.name);
    }

    const jobNumber = await nextNumber(tx, "job", "JW", 4);
    const job = await tx.job.create({
        jobNumber,
        clientId: input.clientId,
        productId: input.productId,
        jobWorkTypeId: input.jobWorkTypeId,
        jobDate: toDate(input.jobDate),
        expectedReturnDate: toDateOrNull(input.expectedReturnDate),
        paymentPolicy: input.paymentPolicy ?? null,
        paymentDays: input.paymentPolicy ? (input.paymentDays ?? 0) : null,
        notes: input.notes,
        publicToken: newPublicToken(),
        createdById: userId,
        items: input.items.map((it, idx) => ({
            designId: it.designId,
            designName: byId.get(it.designId)!.name,
            materialId: it.materialId,
            jobWorkTypeId: it.jobWorkTypeId ?? input.jobWorkTypeId ?? byId.get(it.designId)!.jobWorkTypeId,
            unit: matById.get(it.materialId)!.unit,
            quantity: it.quantity,
            ratePaise: it.ratePaise,
            notes: it.notes,
            sortOrder: idx,
          })),
    });
    await audit(tx, {
      entity: "Job",
      entityId: job.id,
      action: "create",
      summary: `Challan ${jobNumber} created`,
      after: { items: job.items.map((i) => ({ design: i.designName, material: matById.get(i.materialId!)?.name, qty: num(i.quantity), unit: i.unit, rate: i.ratePaise })) },
      userId,
    });

    if (input.dispatchNow) {
      const short = await checkStock(
        tx,
        job.items.map((i) => ({ materialId: i.materialId, qty: num(i.quantity), label: i.designName })),
        input.stockOverrideReason,
      );
      const d = await tx.dispatch.create({
        jobId: job.id,
        date: toDate(input.jobDate),
        kind: "INITIAL",
        enteredById: userId,
        lines: job.items.map((i) => ({ jobItemId: i.id, qty: i.quantity })),
      });
      await audit(tx, {
        entity: "Dispatch",
        entityId: d.id,
        action: "create",
        summary: `Material issued with ${jobNumber}`,
        reason: short.length ? input.stockOverrideReason : null,
        after: short.length ? { stockShort: short } : undefined,
        userId,
      });
      if (short.length) {
        await audit(tx, { entity: "Job", entityId: job.id, action: "exception", summary: `Issued more than in stock: ${short.map((s) => `${s.name} (${s.available} in stock, ${s.wanted} issued)`).join(", ")}`, reason: input.stockOverrideReason, userId });
      }
    }
    await recomputeJobStatus(tx, job.id, userId);
    return job.id;
  });
  return getJobDetail(id);
}

export async function updateJob(jobId: string, input: z.output<typeof jobUpdateSchema>, actor?: Actor) {
  const userId = actor?.id;
  await transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.cancelledAt) throw unprocessable("This challan is cancelled and can't be edited");
    const items = summarizeJobItems(job);
    const started = items.some((i) => i.sent > 0) || job.agg.returnCount > 0;

    const header: Partial<Pick<Job, "clientId" | "productId" | "jobWorkTypeId" | "jobDate" | "expectedReturnDate" | "notes" | "paymentPolicy" | "paymentDays">> = {};
    if (input.clientId && input.clientId !== job.clientId) {
      if (job.agg.voucherCount > 0 || job.agg.returnCount > 0) throw unprocessable("This challan has returns or payments – the job worker can't be changed");
      header.clientId = input.clientId;
    }
    if (input.productId) header.productId = input.productId;
    if (input.jobWorkTypeId !== undefined && input.jobWorkTypeId !== job.jobWorkTypeId) header.jobWorkTypeId = input.jobWorkTypeId;
    if (input.jobDate) header.jobDate = toDate(input.jobDate);
    if (input.expectedReturnDate !== undefined) header.expectedReturnDate = toDateOrNull(input.expectedReturnDate);
    if (input.notes !== undefined) header.notes = input.notes;
    if (input.paymentPolicy !== undefined) {
      const policy = (input.paymentPolicy ?? null) as PaymentPolicy | null;
      const days = policy ? (input.paymentDays ?? 0) : null;
      if (policy !== job.paymentPolicy || days !== job.paymentDays) {
        header.paymentPolicy = policy;
        header.paymentDays = days;
        await audit(tx, {
          entity: "Job",
          entityId: jobId,
          action: "update",
          summary: `Payment terms ${job.paymentPolicy ?? "worker default"}${job.paymentDays ? ` (${job.paymentDays} days)` : ""} → ${policy ?? "worker default"}${days ? ` (${days} days)` : ""}`,
          reason: input.reason,
          before: { paymentPolicy: job.paymentPolicy, paymentDays: job.paymentDays },
          after: { paymentPolicy: policy, paymentDays: days },
          userId,
        });
      }
    }
    // Only fields that really change count as an edit.
    const same = (k: string, v: unknown) => {
      const cur = (job as unknown as Record<string, unknown>)[k];
      return cur instanceof Date || v instanceof Date ? (cur as Date | null)?.getTime() === (v as Date | null)?.getTime() : (cur ?? null) === (v ?? null);
    };
    for (const k of Object.keys(header)) if (same(k, header[k as keyof typeof header])) delete header[k as keyof typeof header];
    const FIELD: Record<string, string> = { clientId: "job worker", productId: "product", jobWorkTypeId: "job work type", jobDate: "challan date", expectedReturnDate: "expected return date", notes: "notes" };
    const fields = Object.keys(header).filter((k) => FIELD[k]).map((k) => FIELD[k]);
    if (fields.length) await audit(tx, { entity: "Job", entityId: jobId, action: "update", summary: `${job.jobNumber}: ${fields.join(", ")} changed${input.reason ? ` (Reason: ${input.reason})` : ""}`, reason: input.reason, userId });
    if (Object.keys(header).length) await tx.job.update(jobId, { ...header, ...editedBy(userId) });

    if (!input.items) return;
    const designs = await tx.design.find({ _id: { $in: input.items.map((i) => i.designId) } });
    const materials = await tx.material.find({ _id: { $in: input.items.map((i) => i.materialId).filter((x): x is string => !!x) } });
    const designById = new Map(designs.map((d) => [d.id, d]));
    const matById = new Map(materials.map((m) => [m.id, m]));
    for (const it of input.items) if (!designById.has(it.designId)) throw unprocessable("One of the designs no longer exists");
    const unitFor = (it: { materialId?: string | null }, fallback: Unit) => (it.materialId ? (matById.get(it.materialId)?.unit as Unit) : fallback);

    if (!started) {
      // Draft: replace the design lines entirely. New lines need a material.
      for (const it of input.items) {
        if (!it.materialId || !matById.has(it.materialId)) throw unprocessable("Choose the material for every design line");
        assertUnit(it.quantity, unitFor(it, "PCS"), designById.get(it.designId)!.name);
      }
      const before = items.map((i) => ({ design: i.designName, qty: i.quantity, rate: i.ratePaise }));
      const oldIds = items.map((i) => i.id);
      // Old lines are about to disappear: refuse if any entry (even a voided one) still points at them.
      const lineRef = { "lines.jobItemId": { $in: oldIds } };
      if ((await tx.dispatch.exists(lineRef)) || (await tx.return.exists(lineRef)) || (await tx.subBill.exists(lineRef)))
        throw unprocessable("This challan has entries recorded against its design lines – edit the lines one by one instead");
      const newItems = input.items.map((it, idx) => ({
        _id: newId(),
        designId: it.designId,
        designName: designById.get(it.designId)!.name,
        materialId: it.materialId,
        jobWorkTypeId: it.jobWorkTypeId ?? job.jobWorkTypeId ?? designById.get(it.designId)!.jobWorkTypeId,
        unit: unitFor(it, "PCS"),
        quantity: it.quantity,
        ratePaise: it.ratePaise,
        notes: it.notes ?? null,
        sortOrder: idx,
      }));
      for (const [idx, it] of input.items.entries()) {
        // A kept line keeps its reference photos.
        if (it.id && oldIds.includes(it.id)) await tx.jobItemPhoto.updateMany({ jobItemId: it.id }, { jobItemId: newItems[idx]._id });
      }
      await tx.jobItemPhoto.deleteMany({ jobItemId: { $in: oldIds } });
      await tx.job.update(jobId, { $set: { items: newItems } });
      await audit(tx, {
        entity: "Job",
        entityId: jobId,
        action: "update",
        summary: "Design lines edited (draft)",
        reason: input.reason,
        before,
        after: input.items.map((i) => ({ design: designById.get(i.designId)?.name, qty: i.quantity, rate: i.ratePaise })),
        userId,
      });
      return;
    }

    // Started challan: existing lines can't be removed; qty/rate changes are guarded and audited.
    const byId = new Map(items.map((i) => [i.id, i]));
    const changes: string[] = [];
    let sortOrder = items.length;
    for (const it of input.items) {
      const name = designById.get(it.designId)!.name;
      if (!it.id) {
        if (!it.materialId || !matById.has(it.materialId)) throw unprocessable(`${name}: choose the material`);
        const unit = unitFor(it, "PCS");
        assertUnit(it.quantity, unit, name);
        await tx.job.update(jobId, {
          $push: {
            items: {
              designId: it.designId,
              designName: name,
              materialId: it.materialId,
              jobWorkTypeId: it.jobWorkTypeId ?? job.jobWorkTypeId,
              unit,
              quantity: it.quantity,
              ratePaise: it.ratePaise,
              notes: it.notes ?? null,
              sortOrder: sortOrder++,
            },
          },
        });
        changes.push(`Added ${name} – ${it.quantity} ${unit} @ ₹${it.ratePaise / 100}`);
        continue;
      }
      const cur = byId.get(it.id);
      if (!cur) throw unprocessable("A design line doesn't belong to this challan");
      const data: Partial<Pick<JobItem, "quantity" | "ratePaise" | "notes">> = {};
      if (it.quantity !== cur.quantity) {
        assertUnit(it.quantity, cur.unit, cur.designName);
        if (it.quantity < cur.initialSent) throw unprocessable(`${cur.designName}: ${cur.initialSent} ${cur.unit} already issued, quantity can't be lower than that`);
        data.quantity = it.quantity;
        changes.push(`${cur.designName}: quantity ${cur.quantity} → ${it.quantity}`);
      }
      if (it.ratePaise !== cur.ratePaise) {
        // The challan rate is the default for future returns; recorded returns keep their own rate.
        if (cur.billedQty > 0) throw unprocessable(`${cur.designName} is already paid at ₹${cur.ratePaise / 100}. Void those vouchers first to change the rate.`);
        data.ratePaise = it.ratePaise;
        changes.push(`${cur.designName}: challan rate ₹${cur.ratePaise / 100} → ₹${it.ratePaise / 100} (recorded returns keep their own rate)`);
      }
      if (it.notes !== undefined && it.notes !== cur.notes) data.notes = it.notes;
      if (Object.keys(data).length) {
        const set = Object.fromEntries(Object.entries(data).map(([k, v]) => [`items.$[i].${k}`, v]));
        await tx.job.model.updateOne({ _id: jobId }, { $set: set }, { arrayFilters: [{ "i._id": it.id }] });
      }
    }
    if (changes.length) {
      await audit(tx, { entity: "Job", entityId: jobId, action: "update", summary: changes.join("; ") + (input.reason ? ` (Reason: ${input.reason})` : ""), reason: input.reason, userId });
      await tx.job.update(jobId, editedBy(userId));
    }
    await recomputeJobStatus(tx, jobId, userId);
  });
  return getJobDetail(jobId);
}

export async function cancelJob(jobId: string, reason: string, actor?: Actor) {
  await transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.cancelledAt) throw unprocessable("This challan is already cancelled");
    const totals = sumTotals(summarizeJobItems(job));
    await tx.job.update(jobId, { cancelledAt: new Date(), cancelReason: reason, status: "CANCELLED" });
    await audit(tx, {
      entity: "Job",
      entityId: jobId,
      action: "cancel",
      summary: `Challan cancelled: ${reason}${totals.pending ? ` (${totals.pending} still with the job worker)` : ""}`,
      reason,
      userId: actor?.id,
    });
    await recomputeJobStatus(tx, jobId, actor?.id);
  });
  return getJobDetail(jobId);
}

export async function regeneratePublicToken(jobId: string, actor?: Actor) {
  if (!(await db.job.exists({ _id: jobId }))) throw notFound("Challan");
  await db.job.update(jobId, { publicToken: newPublicToken() });
  await audit(db, { entity: "Job", entityId: jobId, action: "update", summary: "QR link regenerated – the old QR code no longer works", userId: actor?.id });
  return getJobDetail(jobId);
}

// ───────────────────────── Dispatch ─────────────────────────

export async function createDispatch(jobId: string, input: z.output<typeof dispatchCreateSchema>, actor?: Actor) {
  const userId = actor?.id;
  await transaction(async (tx) => {
    const job = await loadJob(tx, jobId);
    if (job.cancelledAt) throw unprocessable("This challan is cancelled");
    const items = new Map(summarizeJobItems(job).map((i) => [i.id, i]));
    const why = input.reason ?? input.notes;
    if (input.kind !== "INITIAL" && !why) throw unprocessable(`Give a reason for the ${DISPATCH_KIND_LABEL[input.kind].toLowerCase()}`);
    for (const l of input.lines) {
      const it = items.get(l.jobItemId);
      if (!it) throw unprocessable("A design line doesn't belong to this challan");
      assertUnit(l.qty, it.unit, it.designName);
      if (input.kind === "INITIAL" && l.qty > it.notYetSent + 1e-9)
        throw unprocessable(`${it.designName}: only ${it.notYetSent} ${it.unit} left to issue. Use "Additional issue" to send more than ordered.`);
      if (input.kind === "REWORK") {
        const reworkable = it.rejected + it.damaged - it.reworkSent;
        if (l.qty > reworkable + 1e-9) throw unprocessable(`${it.designName}: only ${Math.max(0, reworkable)} rejected/damaged ${it.unit} can be sent for rework`);
      }
    }
    const short =
      input.kind === "REWORK"
        ? []
        : await checkStock(
            tx,
            input.lines.map((l) => ({ materialId: items.get(l.jobItemId)!.material?.id ?? null, qty: l.qty, label: items.get(l.jobItemId)!.designName })),
            input.reason,
          );
    const d = await tx.dispatch.create({ jobId, date: toDate(input.date), kind: input.kind, notes: input.notes ?? (input.kind !== "INITIAL" ? input.reason : null), enteredById: userId, lines: input.lines });
    const total = input.lines.reduce((s, l) => s + l.qty, 0);
    await audit(tx, {
      entity: "Dispatch",
      entityId: d.id,
      action: "create",
      summary: `${DISPATCH_KIND_LABEL[input.kind]}: ${input.lines.map((l) => `${items.get(l.jobItemId)!.designName} ${l.qty}`).join(", ")}`,
      reason: why,
      after: input.lines,
      userId,
    });
    if (input.kind !== "INITIAL" || short.length) {
      await audit(tx, {
        entity: "Job",
        entityId: jobId,
        action: "exception",
        summary: `${DISPATCH_KIND_LABEL[input.kind]} of ${total}${short.length ? ` – more than in stock (${short.map((s) => `${s.name}: ${s.available} available`).join(", ")})` : ""}. Reason: ${why}`,
        reason: why,
        userId,
      });
    }
    await recomputeJobStatus(tx, jobId, userId);
  });
  return getJobDetail(jobId);
}

export async function voidDispatch(dispatchId: string, reason: string, actor?: Actor) {
  const d = await db.dispatch.findById(dispatchId);
  if (!d) throw notFound("Dispatch");
  if (d.voidedAt) throw unprocessable("This entry is already voided");
  await transaction(async (tx) => {
    // Re-checked inside the transaction so two concurrent voids can't both go through.
    if (!(await tx.dispatch.update({ _id: dispatchId, voidedAt: null }, { voidedAt: new Date(), voidReason: reason }))) throw unprocessable("This entry is already voided");
    const job = await loadJob(tx, d.jobId);
    for (const it of summarizeJobItems(job)) {
      if (it.excess > 0) throw unprocessable(`${it.designName}: material from this issue was already returned. Void those returns first.`);
    }
    await audit(tx, { entity: "Dispatch", entityId: dispatchId, action: "void", summary: `Material issue voided: ${reason}`, reason, userId: actor?.id });
    await audit(tx, { entity: "Job", entityId: d.jobId, action: "void", summary: `Material issue voided: ${reason}`, reason, userId: actor?.id });
    await recomputeJobStatus(tx, d.jobId, actor?.id);
  });
  return getJobDetail(d.jobId);
}

// ───────────────────────── Read ─────────────────────────

export async function getJobDetail(jobId: string): Promise<JobDetail> {
  const now = today();
  const job = await loadJob(db, jobId);
  const items = summarizeJobItems(job);
  const row = toJobRow(job, items, now);
  const itemName = new Map(job.items.map((i) => [i.id, i.designName]));

  const [dispatches, returns, subBills, mainBill, audits, defaults, returnDocs] = await all([
    () => db.dispatch.find({ jobId }, { sort: { createdAt: 1 } }),
    () => loadReturnRows(db, { jobId }, now),
    () => db.subBill.find<SubBillWithRow>({ jobId }, { populate: subBillRowPopulate, sort: { date: 1, createdAt: 1 } }),
    () => db.mainBill.findOne<MainBillWithRow>({ jobId }, { populate: mainBillRowPopulate }),
    () => db.auditLog.find({ entity: "Job", entityId: jobId, action: { $in: ["update", "rate", "settlement", "exception", "reopened", "void"] } }, { sort: { createdAt: 1 } }),
    () => defaultTerms(db),
    () => db.return.find({ jobId }, { select: "lines" }),
  ]);
  const returnLines = returnDocs.flatMap((r) => r.lines.map((l) => ({ ...l, returnId: r.id })));
  const names = await userNames(db, [
    ...dispatches.map((d) => d.enteredById),
    ...subBills.flatMap((b) => [b.enteredById, b.editedById, b.voidedById]),
    ...audits.map((a) => a.userId),
    job.editedById,
  ]);

  const timeline: TimelineEvent[] = [];
  const at = (d: Date) => d.toISOString();
  timeline.push({ type: "created", at: at(job.createdAt), date: at(job.jobDate), text: `Challan created – ${row.totals.quantity} ${row.unit} ${job.product.name} for ${job.client.name}` });

  for (const d of dispatches) {
    timeline.push({
      type: "dispatch",
      at: at(d.createdAt),
      date: at(d.date),
      id: d.id,
      kind: d.kind,
      total: d.lines.reduce((s, l) => s + num(l.qty), 0),
      lines: d.lines.map((l) => ({ designName: itemName.get(l.jobItemId) ?? "?", qty: num(l.qty) })),
      notes: d.notes,
      enteredBy: d.enteredById ? (names.get(d.enteredById) ?? null) : null,
      voided: d.voidedAt ? { at: at(d.voidedAt), reason: d.voidReason } : null,
    });
  }
  for (const r of returns) {
    const lines = returnLines.filter((l) => l.returnId === r.id);
    timeline.push({
      type: "return",
      at: r.receivedAt,
      date: r.date,
      id: r.id,
      returnNumber: r.returnNumber,
      receivedAt: r.receivedAt,
      total: r.total,
      okTotal: r.okQty,
      exceptionTotal: r.damagedQty + r.rejectedQty + r.lostQty,
      valuePaise: r.valuePaise,
      lines: lines.map((l) => {
        const q = { okQty: num(l.okQty), damagedQty: num(l.damagedQty), rejectedQty: num(l.rejectedQty), lostQty: num(l.lostQty) };
        return { designName: itemName.get(l.jobItemId) ?? "?", ...q, ratePaise: l.ratePaise, valuePaise: returnLineValue({ payDamaged: l.payDamaged, payRejected: l.payRejected, payLost: l.payLost, ...q, ratePaise: l.ratePaise }), exceptionReason: l.exceptionReason };
      }),
      notes: null,
      photoCount: r.photoCount,
      payment: r.payment,
      enteredBy: r.enteredBy,
      voided: r.voidedAt ? { at: r.voidedAt, reason: r.voidReason } : null,
    });
  }
  const returnNumbers = new Map(returns.map((r) => [r.id, r.returnNumber]));
  for (const b of subBills) {
    const sb = toSubBillRow(b, returnNumbers, names);
    timeline.push({
      type: "sub_bill",
      at: at(b.createdAt),
      date: sb.date,
      id: b.id,
      billNumber: b.billNumber,
      qty: sb.qty,
      amountPaise: b.amountPaise,
      method: b.method,
      returnNumber: sb.returnNumber,
      enteredBy: sb.enteredBy,
      edited: sb.edited,
      voided: b.voidedAt ? { at: at(b.voidedAt), reason: b.voidReason, by: sb.voidedBy } : null,
    });
  }
  if (job.completedAt && job.status === "COMPLETED") {
    const lastReturn = returns.filter((r) => !r.voidedAt).at(-1);
    timeline.push({ type: "completed", at: lastReturn ? lastReturn.receivedAt : at(job.completedAt), date: lastReturn?.date ?? at(job.completedAt), text: "Challan completed – all material accounted for" });
  }
  if (mainBill && !mainBill.cancelledAt) {
    timeline.push({ type: "main_bill", at: at(mainBill.updatedAt), date: at(mainBill.date), id: mainBill.id, billNumber: mainBill.billNumber, totalPaise: mainBill.totalPaise, cancelled: false });
  }
  if (job.cancelledAt) {
    timeline.push({ type: "cancelled", at: at(job.cancelledAt), date: at(job.cancelledAt), text: `Challan cancelled${job.cancelReason ? `: ${job.cancelReason}` : ""}` });
  }
  for (const a of audits) {
    if (a.action === "void") continue; // voids are shown on the entry itself
    timeline.push({ type: "audit", at: at(a.createdAt), date: at(a.createdAt), text: a.summary ?? a.action, by: a.userId ? (names.get(a.userId) ?? null) : null });
  }
  timeline.sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)) || a.at.localeCompare(b.at));

  return {
    ...row,
    notes: job.notes,
    cancelReason: job.cancelReason,
    cancelledAt: iso(job.cancelledAt),
    completedAt: iso(job.completedAt),
    createdAt: at(job.createdAt),
    publicToken: job.publicToken,
    paymentPolicy: job.paymentPolicy as PaymentPolicy | null,
    paymentDays: job.paymentDays,
    terms: termsFor(job as never, job.client as never, defaults),
    items,
    returns,
    timeline,
    subBills: subBills.map((b) => toSubBillRow(b, returnNumbers, names)),
    mainBill: mainBill ? toMainBillRow(mainBill) : null,
    edited: editMark(job, names),
  };
}

// ───────────────────────── Bill rows ─────────────────────────
// Live here (not in billing.ts) so challan detail can use them without a circular import.

export const subBillRowPopulate: Populate = [
  { path: "client", select: "name" },
  { path: "job", select: "jobNumber productId", populate: { path: "product", select: "name" } },
  { path: "return", select: "returnNumber" },
];
export type SubBillWithRow = SubBill & {
  client: Named;
  job: { id: string; jobNumber: string; product: { name: string } };
  return?: { returnNumber: string } | null;
};

export function toSubBillRow(
  b: SubBillWithRow,
  _returnNumbers?: Map<string, string>,
  names?: Map<string, string>,
): SubBillRow {
  return {
    id: b.id,
    billNumber: b.billNumber,
    date: b.date.toISOString(),
    client: { id: b.client.id, name: b.client.name },
    job: { id: b.job.id, jobNumber: b.job.jobNumber, productName: b.job.product.name },
    returnId: b.returnId,
    returnNumber: b.return?.returnNumber ?? null,
    qty: b.lines.reduce((s, l) => s + num(l.qty), 0),
    amountPaise: b.amountPaise,
    method: b.method,
    reference: b.reference,
    enteredBy: b.enteredById ? (names?.get(b.enteredById) ?? null) : null,
    edited: editMark(b, names ?? new Map()),
    voidedAt: iso(b.voidedAt),
    voidedBy: b.voidedById ? (names?.get(b.voidedById) ?? null) : null,
    voidReason: b.voidReason,
  };
}

export const mainBillRowPopulate: Populate = [
  { path: "client", select: "name" },
  {
    path: "job",
    select: "jobNumber productId",
    populate: [
      { path: "product", select: "name" },
      { path: "subBillCount", match: { voidedAt: null } },
    ],
  },
];
export type MainBillWithRow = MainBill & {
  client: Named;
  job: { id: string; jobNumber: string; product: { name: string }; subBillCount: number };
};

export function toMainBillRow(m: MainBillWithRow): MainBillRow {
  return {
    id: m.id,
    billNumber: m.billNumber,
    date: m.date.toISOString(),
    client: { id: m.client.id, name: m.client.name },
    job: { id: m.job.id, jobNumber: m.job.jobNumber, productName: m.job.product.name },
    qty: num(m.qty),
    totalPaise: m.totalPaise,
    subBillCount: m.job.subBillCount,
    cancelledAt: iso(m.cancelledAt),
    cancelReason: m.cancelReason,
  };
}
