import { db, transaction, type Collection } from "@av/db";
import {
  clientSchema,
  designSchema,
  jobWorkTypeSchema,
  materialSchema,
  productSchema,
  reasonSchema,
  stockMovementSchema,
  OPEN_JOB_STATUSES,
  PAYMENT_POLICY_LABEL,
  qtyFitsUnit,
  sumTotals,
  type PaymentPolicy,
  type Unit,
} from "@av/shared";
import { Router } from "express";
import { audit, editedBy, withEdited } from "../lib/audit.js";
import { nextNumber } from "../lib/counter.js";
import { toDate, today } from "../lib/dates.js";
import { notFound, param, parse, str, unprocessable } from "../lib/http.js";
import { ci } from "../lib/mongo.js";
import { MANAGERS, requireRole } from "../middleware/auth.js";
import { loadJobs, summarizeJobItems, toJobRow } from "../services/jobs.js";
import { clientProfile } from "../services/reports.js";
import { materialLedger, materialRows } from "../services/materials.js";
import { workerLedger, workerMaterial, workerPerformance } from "../services/accounts.js";
import { moneySummary } from "../services/billing.js";

const activeFilter = (v: unknown) => (v === "true" ? true : v === "false" ? false : undefined);
/** Number of challans per master record (the old `_count.jobs`). `field` is matched on the challan or, for designs, its lines. */
async function jobCounts(field: "productId" | "jobWorkTypeId" | "items.designId", ids: string[]) {
  const rows =
    field === "items.designId"
      ? await db.job.aggregate<{ id: string; n: number }>([
          { $match: { "items.designId": { $in: ids } } },
          { $unwind: "$items" },
          { $match: { "items.designId": { $in: ids } } },
          { $group: { _id: { d: "$items.designId", j: "$_id" } } },
          { $group: { _id: "$_id.d", n: { $sum: 1 } } },
        ])
      : await db.job.aggregate<{ id: string; n: number }>([{ $match: { [field]: { $in: ids } } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** The row, or a 404 naming what was missing. */
const findOr404 = async <T>(c: Collection<T>, id: string, what: string) => {
  const row = await c.findById(id);
  if (!row) throw notFound(what);
  return row;
};
const termsText = (p: PaymentPolicy | null | undefined, d: number | null | undefined) => (p ? `${PAYMENT_POLICY_LABEL[p]}${d ? ` (${d} days)` : ""}` : "business default");

// ───────────── Job workers ─────────────
export const clientsRouter = Router();

clientsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const clients = await db.client.find(
    {
      isActive: activeFilter(req.query.active),
      ...(q && { $or: [{ name: ci(q) }, { businessName: ci(q) }, { phone: ci(q) }, { alternatePhone: ci(q) }, { email: ci(q) }, { workerCode: ci(q) }, { workItems: ci(q) }] }),
    },
    { sort: { name: 1 } },
  );
  if (req.query.simple === "true") return res.json(await withEdited(db, clients));
  const ids = clients.map((c) => c.id);
  const jobs = await loadJobs(db, { clientId: { $in: ids } });
  const stats = new Map(ids.map((id) => [id, { activeJobs: 0, pendingPieces: 0, value: 0, paid: 0 }]));
  for (const j of jobs) {
    const s = stats.get(j.clientId)!;
    if (OPEN_JOB_STATUSES.includes(j.status) && j.status !== "DRAFT") s.activeJobs++;
    const t = sumTotals(summarizeJobItems(j));
    s.pendingPieces += t.pending;
    s.value += t.completedValuePaise;
    s.paid += j.agg.paidPaise;
  }
  res.json(
    (await withEdited(db, clients)).map((c) => {
      const s = stats.get(c.id)!;
      return { ...c, activeJobs: s.activeJobs, pendingPieces: s.pendingPieces, toPayPaise: Math.max(0, s.value - s.paid) };
    }),
  );
});

clientsRouter.post("/", async (req, res) => {
  const data = parse(clientSchema, req.body);
  const c = await transaction(async (tx) => {
    const workerCode = await nextNumber(tx, "worker", "WK", 4);
    const c = await tx.client.create({ ...data, paymentDays: data.paymentPolicy ? (data.paymentDays ?? 0) : null, workerCode });
    await audit(tx, { entity: "Client", entityId: c.id, action: "create", summary: `Job worker ${c.name} (${workerCode}) added – payment terms: ${termsText(c.paymentPolicy as PaymentPolicy, c.paymentDays)}`, after: c, userId: req.user?.id });
    return c;
  });
  res.status(201).json((await withEdited(db, [c]))[0]);
});

clientsRouter.get("/:id", async (req, res) => {
  res.json(await clientProfile(param(req.params.id)));
});

clientsRouter.get("/:id/money", async (req, res) => {
  res.json(await moneySummary(db, param(req.params.id)));
});

clientsRouter.get("/:id/ledger", async (req, res) => {
  res.json(await workerLedger(param(req.params.id), { from: str(req.query.from), to: str(req.query.to) }));
});

clientsRouter.get("/:id/material", async (req, res) => {
  res.json(await workerMaterial(param(req.params.id)));
});

clientsRouter.get("/:id/performance", async (req, res) => {
  res.json(await workerPerformance(param(req.params.id)));
});

clientsRouter.get("/:id/challans", async (req, res) => {
  const now = today();
  res.json((await loadJobs(db, { clientId: param(req.params.id) })).map((j) => toJobRow(j, undefined, now)));
});

clientsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await findOr404(db.client, id, "Job worker");
  const data = parse(clientSchema.partial(), req.body);
  if (data.paymentPolicy !== undefined) data.paymentDays = data.paymentPolicy ? (data.paymentDays ?? before.paymentDays ?? 0) : null;
  const c = (await db.client.update(id, { ...data, ...editedBy(req.user?.id) }))!;
  const termsChanged = c.paymentPolicy !== before.paymentPolicy || c.paymentDays !== before.paymentDays;
  await audit(db, {
    entity: "Client",
    entityId: id,
    action: "update",
    summary: termsChanged
      ? `Payment terms ${termsText(before.paymentPolicy as PaymentPolicy, before.paymentDays)} → ${termsText(c.paymentPolicy as PaymentPolicy, c.paymentDays)}`
      : before.isActive !== c.isActive
        ? c.isActive ? "Reactivated" : "Marked inactive"
        : "Details updated",
    before,
    after: c,
    userId: req.user?.id,
  });
  res.json((await withEdited(db, [c]))[0]);
});

// ───────────── Products ─────────────
export const productsRouter = Router();

productsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const rows = await db.product.find({ isActive: activeFilter(req.query.active), ...(q && { $or: [{ name: ci(q) }, { code: ci(q) }] }) }, { sort: { name: 1 } });
  const counts = await jobCounts("productId", rows.map((r) => r.id));
  res.json((await withEdited(db, rows)).map((p) => ({ ...p, jobCount: counts.get(p.id) ?? 0 })));
});

productsRouter.post("/", async (req, res) => {
  const p = await db.product.create(parse(productSchema, req.body));
  await audit(db, { entity: "Product", entityId: p.id, action: "create", summary: `Product ${p.name} added`, after: p, userId: req.user?.id });
  res.status(201).json(p);
});

productsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await findOr404(db.product, id, "Product");
  const p = (await db.product.update(id, { ...parse(productSchema.partial(), req.body), ...editedBy(req.user?.id) }))!;
  await audit(db, { entity: "Product", entityId: id, action: "update", summary: `Product ${p.name} updated`, before, after: p, userId: req.user?.id });
  res.json((await withEdited(db, [p]))[0]);
});

// ───────────── Job work types ─────────────
export const jobWorkTypesRouter = Router();

jobWorkTypesRouter.get("/", async (req, res) => {
  const rows = await db.jobWorkType.find({ isActive: activeFilter(req.query.active) }, { sort: { name: 1 } });
  const counts = await jobCounts("jobWorkTypeId", rows.map((r) => r.id));
  res.json((await withEdited(db, rows)).map((t) => ({ ...t, jobCount: counts.get(t.id) ?? 0 })));
});

jobWorkTypesRouter.post("/", async (req, res) => {
  const t = await db.jobWorkType.create(parse(jobWorkTypeSchema, req.body));
  await audit(db, { entity: "JobWorkType", entityId: t.id, action: "create", summary: `Job work type ${t.name} added`, userId: req.user?.id });
  res.status(201).json(t);
});

jobWorkTypesRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await findOr404(db.jobWorkType, id, "Job work type");
  const t = (await db.jobWorkType.update(id, { ...parse(jobWorkTypeSchema.partial(), req.body), ...editedBy(req.user?.id) }))!;
  await audit(db, { entity: "JobWorkType", entityId: id, action: "update", summary: `Job work type ${t.name} updated`, before, after: t, userId: req.user?.id });
  res.json((await withEdited(db, [t]))[0]);
});

// ───────────── Designs ─────────────
export const designsRouter = Router();

designsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const found = await db.design.find<import("@av/db").Design & { jobWorkType?: { id: string; name: string } | null }>(
    { isActive: activeFilter(req.query.active), jobWorkTypeId: str(req.query.jobWorkTypeId), ...(q && { $or: [{ name: ci(q) }, { code: ci(q) }] }) },
    { populate: { path: "jobWorkType", select: "name" }, sort: { name: 1 } },
  );
  const rows = found.map((d) => ({ ...d, jobWorkType: d.jobWorkType ? { id: d.jobWorkType.id, name: d.jobWorkType.name } : null }));
  const counts = await jobCounts("items.designId", rows.map((r) => r.id));
  res.json((await withEdited(db, rows)).map((d) => ({ ...d, jobCount: counts.get(d.id) ?? 0 })));
});

designsRouter.post("/", async (req, res) => {
  const d = await db.design.create(parse(designSchema, req.body));
  await audit(db, { entity: "Design", entityId: d.id, action: "create", summary: `Design ${d.name} added at ₹${d.defaultRatePaise / 100}`, userId: req.user?.id });
  res.status(201).json(d);
});

designsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await findOr404(db.design, id, "Design");
  // Only the default for future challans changes – existing challan lines and returns keep their own rates.
  const d = (await db.design.update(id, { ...parse(designSchema.partial(), req.body), ...editedBy(req.user?.id) }))!;
  await audit(db, {
    entity: "Design",
    entityId: id,
    action: "update",
    summary: before.defaultRatePaise !== d.defaultRatePaise ? `${d.name}: default rate ₹${before.defaultRatePaise / 100} → ₹${d.defaultRatePaise / 100} (future challans only)` : `Design ${d.name} updated`,
    before,
    after: d,
    userId: req.user?.id,
  });
  res.json((await withEdited(db, [d]))[0]);
});

// ───────────── Materials & stock ─────────────
export const materialsRouter = Router();

materialsRouter.get("/", async (req, res) => {
  res.json(await materialRows({ q: str(req.query.q), active: activeFilter(req.query.active), simple: req.query.simple === "true" }));
});

materialsRouter.post("/", async (req, res) => {
  const { openingQty, ...data } = parse(materialSchema, req.body);
  if (openingQty && !qtyFitsUnit(openingQty, data.unit as Unit)) throw unprocessable(`Opening stock: ${openingQty} is not a valid quantity in ${data.unit}`);
  const m = await transaction(async (tx) => {
    const code = data.code ?? (await nextNumber(tx, "material", "MAT", 4));
    if (await tx.material.exists({ code })) throw unprocessable(`Material code ${code} is already used`);
    const m = await tx.material.create({ ...data, code });
    await audit(tx, { entity: "Material", entityId: m.id, action: "create", summary: `Material ${m.code} ${m.name} added`, after: m, userId: req.user?.id });
    if (openingQty && openingQty > 0) {
      const mv = await tx.stockMovement.create({ materialId: m.id, type: "RECEIPT", qty: openingQty, date: toDate(today()), reason: "Opening stock", enteredById: req.user?.id });
      await audit(tx, { entity: "StockMovement", entityId: mv.id, action: "create", summary: `${m.name}: opening stock ${openingQty} ${m.unit}`, after: { materialId: m.id }, userId: req.user?.id });
    }
    return m;
  });
  res.status(201).json(m);
});

materialsRouter.get("/:id", async (req, res) => {
  const [row] = await materialRows({ id: param(req.params.id) });
  if (!row) throw notFound("Material");
  res.json(row);
});

materialsRouter.get("/:id/ledger", async (req, res) => {
  res.json(await materialLedger({ materialId: param(req.params.id), from: str(req.query.from), to: str(req.query.to) }));
});

materialsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await findOr404(db.material, id, "Material");
  const { openingQty: _o, ...data } = parse(materialSchema.partial(), req.body);
  if (data.unit && data.unit !== before.unit && (await db.job.exists({ "items.materialId": id }))) throw unprocessable("This material is already on challans – its unit can't change");
  if (data.code && data.code !== before.code && (await db.material.exists({ code: data.code }))) throw unprocessable(`Material code ${data.code} is already used`);
  const m = (await db.material.update(id, { ...data, code: data.code ?? undefined, ...editedBy(req.user?.id) }))!;
  await audit(db, { entity: "Material", entityId: id, action: "update", summary: `Material ${m.code} ${m.name} updated`, before, after: m, userId: req.user?.id });
  res.json((await withEdited(db, [m]))[0]);
});

export const stockRouter = Router();

/** Unified movement ledger across all materials (or filtered). */
stockRouter.get("/stock/movements", async (req, res) => {
  res.json(await materialLedger({ materialId: str(req.query.materialId), clientId: str(req.query.clientId), from: str(req.query.from), to: str(req.query.to) }));
});

stockRouter.post("/stock/movements", requireRole(...MANAGERS), async (req, res) => {
  const input = parse(stockMovementSchema, req.body);
  const m = await db.material.findById(input.materialId);
  if (!m) throw unprocessable("Choose a valid material");
  if (!qtyFitsUnit(input.qty, m.unit as Unit)) throw unprocessable(`${input.qty} is not a valid quantity in ${m.unit}`);
  if (input.type !== "RECEIPT" && !input.reason) throw unprocessable("Give a reason for the stock adjustment");
  const mv = await db.stockMovement.create({ ...input, date: toDate(input.date), enteredById: req.user?.id });
  await audit(db, {
    entity: "StockMovement",
    entityId: mv.id,
    action: "create",
    summary: `${m.name}: ${input.type === "RECEIPT" ? "received" : input.type === "ADJUSTMENT_IN" ? "adjusted in" : "adjusted out"} ${input.qty} ${m.unit}`,
    reason: input.reason,
    after: input,
    userId: req.user?.id,
  });
  res.status(201).json(mv);
});

stockRouter.post("/stock/movements/:id/void", requireRole(...MANAGERS), async (req, res) => {
  const id = param(req.params.id);
  const { reason } = parse(reasonSchema, req.body);
  const mv = await db.stockMovement.findById<import("@av/db").StockMovement & { material: import("@av/db").Material }>(id, { populate: { path: "material" } });
  if (!mv) throw notFound("Stock entry");
  if (mv.voidedAt) throw unprocessable("This stock entry is already voided");
  await db.stockMovement.update(id, { voidedAt: new Date(), voidReason: reason });
  await audit(db, { entity: "StockMovement", entityId: id, action: "void", summary: `${mv.material.name}: stock entry of ${mv.qty} ${mv.material.unit} voided`, reason, after: { materialId: mv.materialId }, userId: req.user?.id });
  res.json({ ok: true });
});
