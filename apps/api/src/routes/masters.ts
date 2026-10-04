import { prisma } from "@av/db";
import { clientSchema, designSchema, productSchema, OPEN_JOB_STATUSES, sumTotals } from "@av/shared";
import { Router } from "express";
import { audit } from "../lib/audit.js";
import { notFound, param, parse, str } from "../lib/http.js";
import { moneySummary } from "../services/billing.js";
import { loadJobs, summarizeJobItems } from "../services/jobs.js";
import { clientProfile } from "../services/reports.js";

const activeFilter = (v: unknown) => (v === "true" ? true : v === "false" ? false : undefined);
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

// ───────────── Clients ─────────────
export const clientsRouter = Router();

clientsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const clients = await prisma.client.findMany({
    where: {
      isActive: activeFilter(req.query.active),
      OR: q ? [{ name: ci(q) }, { businessName: ci(q) }, { phone: ci(q) }, { email: ci(q) }] : undefined,
    },
    orderBy: { name: "asc" },
  });
  if (req.query.simple === "true") return res.json(clients);
  const ids = clients.map((c) => c.id);
  const [jobs, invoices] = await Promise.all([
    loadJobs(prisma, { clientId: { in: ids } }),
    prisma.invoice.findMany({ where: { clientId: { in: ids }, cancelledAt: null }, select: { clientId: true, totalPaise: true, payments: { select: { amountPaise: true, voidedAt: true } } } }),
  ]);
  const stats = new Map(ids.map((id) => [id, { activeJobs: 0, pendingPieces: 0, outstandingPaise: 0 }]));
  for (const j of jobs) {
    const s = stats.get(j.clientId)!;
    if (OPEN_JOB_STATUSES.includes(j.status) && j.status !== "DRAFT") s.activeJobs++;
    s.pendingPieces += sumTotals(summarizeJobItems(j)).pending;
  }
  for (const i of invoices) {
    stats.get(i.clientId)!.outstandingPaise += i.totalPaise - i.payments.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amountPaise, 0);
  }
  res.json(clients.map((c) => ({ ...c, ...stats.get(c.id) })));
});

clientsRouter.post("/", async (req, res) => {
  const data = parse(clientSchema, req.body);
  const c = await prisma.client.create({ data });
  await audit(prisma, { entity: "Client", entityId: c.id, action: "create", summary: `Client ${c.name} added`, userId: req.user?.id });
  res.status(201).json(c);
});

clientsRouter.get("/:id", async (req, res) => {
  res.json(await clientProfile(param(req.params.id)));
});

clientsRouter.get("/:id/money", async (req, res) => {
  res.json(await moneySummary(prisma, param(req.params.id)));
});

clientsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await prisma.client.findUnique({ where: { id } });
  if (!before) throw notFound("Client");
  const data = parse(clientSchema.partial(), req.body);
  const c = await prisma.client.update({ where: { id }, data });
  await audit(prisma, { entity: "Client", entityId: id, action: "update", before, after: c, userId: req.user?.id });
  res.json(c);
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
  res.json(rows.map(({ _count, ...p }) => ({ ...p, jobCount: _count.jobs })));
});

productsRouter.post("/", async (req, res) => {
  const p = await prisma.product.create({ data: parse(productSchema, req.body) });
  await audit(prisma, { entity: "Product", entityId: p.id, action: "create", summary: `Product ${p.name} added`, userId: req.user?.id });
  res.status(201).json(p);
});

productsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  if (!(await prisma.product.findUnique({ where: { id } }))) throw notFound("Product");
  const p = await prisma.product.update({ where: { id }, data: parse(productSchema.partial(), req.body) });
  await audit(prisma, { entity: "Product", entityId: id, action: "update", after: p, userId: req.user?.id });
  res.json(p);
});

// ───────────── Designs ─────────────
export const designsRouter = Router();

designsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const rows = await prisma.design.findMany({
    where: { isActive: activeFilter(req.query.active), OR: q ? [{ name: ci(q) }, { code: ci(q) }] : undefined },
    include: { jobItems: { select: { jobId: true } } },
    orderBy: { name: "asc" },
  });
  res.json(rows.map(({ jobItems, ...d }) => ({ ...d, jobCount: new Set(jobItems.map((j) => j.jobId)).size })));
});

designsRouter.post("/", async (req, res) => {
  const d = await prisma.design.create({ data: parse(designSchema, req.body) });
  await audit(prisma, { entity: "Design", entityId: d.id, action: "create", summary: `Design ${d.name} added`, userId: req.user?.id });
  res.status(201).json(d);
});

designsRouter.put("/:id", async (req, res) => {
  const id = param(req.params.id);
  const before = await prisma.design.findUnique({ where: { id } });
  if (!before) throw notFound("Design");
  // Only the default for future jobs changes – existing job lines keep their own rate snapshot.
  const d = await prisma.design.update({ where: { id }, data: parse(designSchema.partial(), req.body) });
  await audit(prisma, {
    entity: "Design",
    entityId: id,
    action: "update",
    summary: before.defaultRatePaise !== d.defaultRatePaise ? `Default rate ₹${before.defaultRatePaise / 100} → ₹${d.defaultRatePaise / 100} (future jobs only)` : undefined,
    before,
    after: d,
    userId: req.user?.id,
  });
  res.json(d);
});
