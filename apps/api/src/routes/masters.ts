import { prisma } from "@av/db";
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
import { MANAGERS, requireRole } from "../middleware/auth.js";
import { loadJobs, summarizeJobItems, toJobRow } from "../services/jobs.js";
import { clientProfile } from "../services/reports.js";
import { materialLedger, materialRows } from "../services/materials.js";
import { workerLedger, workerMaterial, workerPerformance } from "../services/accounts.js";
import { moneySummary } from "../services/billing.js";

const activeFilter = (v: unknown) => (v === "true" ? true : v === "false" ? false : undefined);
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const termsText = (p: PaymentPolicy | null | undefined, d: number | null | undefined) => (p ? `${PAYMENT_POLICY_LABEL[p]}${d ? ` (${d} days)` : ""}` : "business default");

// ───────────── Job workers ─────────────
export const clientsRouter = Router();

clientsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const clients = await prisma.client.findMany({
    where: {
      isActive: activeFilter(req.query.active),
      OR: q ? [{ name: ci(q) }, { businessName: ci(q) }, { phone: ci(q) }, { alternatePhone: ci(q) }, { email: ci(q) }, { workerCode: ci(q) }, { workItems: ci(q) }] : undefined,
    },
    orderBy: { name: "asc" },
  });
  if (req.query.simple === "true") return res.json(await withEdited(prisma, clients));
  const ids = clients.map((c) => c.id);
  const jobs = await loadJobs(prisma, { clientId: { in: ids } });
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
    (await withEdited(prisma, clients)).map((c) => {
      const s = stats.get(c.id)!;
      return { ...c, activeJobs: s.activeJobs, pendingPieces: s.pendingPieces, toPayPaise: Math.max(0, s.value - s.paid) };
    }),
  );
});

clientsRouter.post("/", async (req, res) => {
  const data = parse(clientSchema, req.body);
  const c = await prisma.$transaction(async (tx) => {
    const workerCode = await nextNumber(tx, "worker", "WK", 4);
    const c = await tx.client.create({ data: { ...data, paymentDays: data.paymentPolicy ? (data.paymentDays ?? 0) : null, workerCode } });
    await audit(tx, { entity: "Client", entityId: c.id, action: "create", summary: `Job worker ${c.name} (${workerCode}) added – payment terms: ${termsText(c.paymentPolicy as PaymentPolicy, c.paymentDays)}`, after: c, userId: req.user?.id });
    return c;
  });
  res.status(201).json((await withEdited(prisma, [c]))[0]);
});

clientsRouter.get("/:id", async (req, res) => {
  res.json(await clientProfile(param(req.params.id)));
});

clientsRouter.get("/:id/money", async (req, res) => {
  res.json(await moneySummary(prisma, param(req.params.id)));
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
  res.json((await loadJobs(prisma, { clientId: param(req.params.id) })).map((j) => toJobRow(j, undefined, now)));
});

clientsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await prisma.client.findUnique({ where: { id } });
  if (!before) throw notFound("Job worker");
  const data = parse(clientSchema.partial(), req.body);
  if (data.paymentPolicy !== undefined) data.paymentDays = data.paymentPolicy ? (data.paymentDays ?? before.paymentDays ?? 0) : null;
  const c = await prisma.client.update({ where: { id }, data: { ...data, ...editedBy(req.user?.id) } });
  const termsChanged = c.paymentPolicy !== before.paymentPolicy || c.paymentDays !== before.paymentDays;
  await audit(prisma, {
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
  res.json((await withEdited(prisma, [c]))[0]);
});

// ───────────── Products ─────────────
export const productsRouter = Router();

productsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const rows = await prisma.product.findMany({
    where: { isActive: activeFilter(req.query.active), OR: q ? [{ name: ci(q) }, { code: ci(q) }] : undefined },
    include: { _count: { select: { jobs: true } } },
    orderBy: { name: "asc" },
  });
  res.json((await withEdited(prisma, rows)).map(({ _count, ...p }) => ({ ...p, jobCount: _count.jobs })));
});

productsRouter.post("/", async (req, res) => {
  const p = await prisma.product.create({ data: parse(productSchema, req.body) });
  await audit(prisma, { entity: "Product", entityId: p.id, action: "create", summary: `Product ${p.name} added`, after: p, userId: req.user?.id });
  res.status(201).json(p);
});

productsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw notFound("Product");
  const p = await prisma.product.update({ where: { id }, data: { ...parse(productSchema.partial(), req.body), ...editedBy(req.user?.id) } });
  await audit(prisma, { entity: "Product", entityId: id, action: "update", summary: `Product ${p.name} updated`, before, after: p, userId: req.user?.id });
  res.json((await withEdited(prisma, [p]))[0]);
});

// ───────────── Job work types ─────────────
export const jobWorkTypesRouter = Router();

jobWorkTypesRouter.get("/", async (req, res) => {
  const rows = await prisma.jobWorkType.findMany({
    where: { isActive: activeFilter(req.query.active) },
    include: { _count: { select: { jobs: true } } },
    orderBy: { name: "asc" },
  });
  res.json((await withEdited(prisma, rows)).map(({ _count, ...t }) => ({ ...t, jobCount: _count.jobs })));
});

jobWorkTypesRouter.post("/", async (req, res) => {
  const t = await prisma.jobWorkType.create({ data: parse(jobWorkTypeSchema, req.body) });
  await audit(prisma, { entity: "JobWorkType", entityId: t.id, action: "create", summary: `Job work type ${t.name} added`, userId: req.user?.id });
  res.status(201).json(t);
});

jobWorkTypesRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await prisma.jobWorkType.findUnique({ where: { id } });
  if (!before) throw notFound("Job work type");
  const t = await prisma.jobWorkType.update({ where: { id }, data: { ...parse(jobWorkTypeSchema.partial(), req.body), ...editedBy(req.user?.id) } });
  await audit(prisma, { entity: "JobWorkType", entityId: id, action: "update", summary: `Job work type ${t.name} updated`, before, after: t, userId: req.user?.id });
  res.json((await withEdited(prisma, [t]))[0]);
});

// ───────────── Designs ─────────────
export const designsRouter = Router();

designsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const rows = await prisma.design.findMany({
    where: { isActive: activeFilter(req.query.active), jobWorkTypeId: str(req.query.jobWorkTypeId), OR: q ? [{ name: ci(q) }, { code: ci(q) }] : undefined },
    include: { jobItems: { select: { jobId: true } }, jobWorkType: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  res.json((await withEdited(prisma, rows)).map(({ jobItems, ...d }) => ({ ...d, jobCount: new Set(jobItems.map((j) => j.jobId)).size })));
});

designsRouter.post("/", async (req, res) => {
  const d = await prisma.design.create({ data: parse(designSchema, req.body) });
  await audit(prisma, { entity: "Design", entityId: d.id, action: "create", summary: `Design ${d.name} added at ₹${d.defaultRatePaise / 100}`, userId: req.user?.id });
  res.status(201).json(d);
});

designsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await prisma.design.findUnique({ where: { id } });
  if (!before) throw notFound("Design");
  // Only the default for future challans changes – existing challan lines and returns keep their own rates.
  const d = await prisma.design.update({ where: { id }, data: { ...parse(designSchema.partial(), req.body), ...editedBy(req.user?.id) } });
  await audit(prisma, {
    entity: "Design",
    entityId: id,
    action: "update",
    summary: before.defaultRatePaise !== d.defaultRatePaise ? `${d.name}: default rate ₹${before.defaultRatePaise / 100} → ₹${d.defaultRatePaise / 100} (future challans only)` : `Design ${d.name} updated`,
    before,
    after: d,
    userId: req.user?.id,
  });
  res.json((await withEdited(prisma, [d]))[0]);
});

// ───────────── Materials & stock ─────────────
export const materialsRouter = Router();

materialsRouter.get("/", async (req, res) => {
  res.json(await materialRows({ q: str(req.query.q), active: activeFilter(req.query.active), simple: req.query.simple === "true" }));
});

materialsRouter.post("/", async (req, res) => {
  const { openingQty, ...data } = parse(materialSchema, req.body);
  if (openingQty && !qtyFitsUnit(openingQty, data.unit as Unit)) throw unprocessable(`Opening stock: ${openingQty} is not a valid quantity in ${data.unit}`);
  const m = await prisma.$transaction(async (tx) => {
    const code = data.code ?? (await nextNumber(tx, "material", "MAT", 4));
    if (await tx.material.findUnique({ where: { code } })) throw unprocessable(`Material code ${code} is already used`);
    const m = await tx.material.create({ data: { ...data, code } });
    await audit(tx, { entity: "Material", entityId: m.id, action: "create", summary: `Material ${m.code} ${m.name} added`, after: m, userId: req.user?.id });
    if (openingQty && openingQty > 0) {
      const mv = await tx.stockMovement.create({ data: { materialId: m.id, type: "RECEIPT", qty: openingQty, date: toDate(today()), reason: "Opening stock", enteredById: req.user?.id } });
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
  const before = await prisma.material.findUnique({ where: { id } });
  if (!before) throw notFound("Material");
  const { openingQty: _o, ...data } = parse(materialSchema.partial(), req.body);
  if (data.unit && data.unit !== before.unit && (await prisma.jobItem.count({ where: { materialId: id } }))) throw unprocessable("This material is already on challans – its unit can't change");
  if (data.code && data.code !== before.code && (await prisma.material.findUnique({ where: { code: data.code } }))) throw unprocessable(`Material code ${data.code} is already used`);
  const m = await prisma.material.update({ where: { id }, data: { ...data, code: data.code ?? undefined, ...editedBy(req.user?.id) } });
  await audit(prisma, { entity: "Material", entityId: id, action: "update", summary: `Material ${m.code} ${m.name} updated`, before, after: m, userId: req.user?.id });
  res.json((await withEdited(prisma, [m]))[0]);
});

export const stockRouter = Router();

/** Unified movement ledger across all materials (or filtered). */
stockRouter.get("/stock/movements", async (req, res) => {
  res.json(await materialLedger({ materialId: str(req.query.materialId), clientId: str(req.query.clientId), from: str(req.query.from), to: str(req.query.to) }));
});

stockRouter.post("/stock/movements", requireRole(...MANAGERS), async (req, res) => {
  const input = parse(stockMovementSchema, req.body);
  const m = await prisma.material.findUnique({ where: { id: input.materialId } });
  if (!m) throw unprocessable("Choose a valid material");
  if (!qtyFitsUnit(input.qty, m.unit as Unit)) throw unprocessable(`${input.qty} is not a valid quantity in ${m.unit}`);
  if (input.type !== "RECEIPT" && !input.reason) throw unprocessable("Give a reason for the stock adjustment");
  const mv = await prisma.stockMovement.create({ data: { ...input, date: toDate(input.date), enteredById: req.user?.id } });
  await audit(prisma, {
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
  const mv = await prisma.stockMovement.findUnique({ where: { id }, include: { material: true } });
  if (!mv) throw notFound("Stock entry");
  if (mv.voidedAt) throw unprocessable("This stock entry is already voided");
  await prisma.stockMovement.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
  await audit(prisma, { entity: "StockMovement", entityId: id, action: "void", summary: `${mv.material.name}: stock entry of ${mv.qty} ${mv.material.unit} voided`, reason, after: { materialId: mv.materialId }, userId: req.user?.id });
  res.json({ ok: true });
});
