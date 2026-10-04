import { prisma, type Prisma } from "@av/db";
import { dispatchCreateSchema, JOB_STATUSES, jobCreateSchema, jobUpdateSchema, OPEN_JOB_STATUSES, reasonSchema, returnCreateSchema, type JobStatus } from "@av/shared";
import { Router } from "express";
import { toDate } from "../lib/dates.js";
import { param, parse, str } from "../lib/http.js";
import { cancelJob, createDispatch, createJob, createReturn, getJobDetail, loadJobs, toJobRow, updateJob, voidDispatch, voidReturn } from "../services/jobs.js";

export const jobsRouter = Router();

jobsRouter.get("/", async (req, res) => {
  const q = str(req.query.q);
  const statusParam = str(req.query.status);
  const where: Prisma.JobWhereInput = {
    clientId: str(req.query.clientId),
    productId: str(req.query.productId),
    items: str(req.query.designId) ? { some: { designId: str(req.query.designId) } } : undefined,
  };
  const from = str(req.query.from);
  const to = str(req.query.to);
  if (from || to) where.jobDate = { gte: from ? toDate(from) : undefined, lte: to ? toDate(to) : undefined };
  if (statusParam === "open") where.status = { in: OPEN_JOB_STATUSES };
  else if (statusParam === "active" || statusParam === "overdue") where.status = { in: ["IN_PROGRESS", "PARTIALLY_RECEIVED"] };
  else if (statusParam && (JOB_STATUSES as readonly string[]).includes(statusParam)) where.status = statusParam as JobStatus;
  if (q) {
    const ci = { contains: q, mode: "insensitive" as const };
    where.OR = [{ jobNumber: ci }, { client: { name: ci } }, { product: { name: ci } }, { items: { some: { designName: ci } } }, { notes: ci }];
  }
  let rows = (await loadJobs(prisma, where)).map((j) => toJobRow(j));
  if (statusParam === "overdue") rows = rows.filter((r) => r.overdue);
  if (req.query.pending === "true") rows = rows.filter((r) => r.totals.pending > 0);
  res.json(rows);
});

jobsRouter.post("/", async (req, res) => {
  res.status(201).json(await createJob(parse(jobCreateSchema, req.body), req.user?.id));
});

jobsRouter.get("/:id", async (req, res) => {
  res.json(await getJobDetail(param(req.params.id)));
});

jobsRouter.patch("/:id", async (req, res) => {
  res.json(await updateJob(param(req.params.id), parse(jobUpdateSchema, req.body), req.user?.id));
});

jobsRouter.post("/:id/cancel", async (req, res) => {
  res.json(await cancelJob(param(req.params.id), parse(reasonSchema, req.body).reason, req.user?.id));
});

jobsRouter.post("/:id/dispatches", async (req, res) => {
  res.status(201).json(await createDispatch(param(req.params.id), parse(dispatchCreateSchema, req.body), req.user?.id));
});

jobsRouter.post("/:id/returns", async (req, res) => {
  res.status(201).json(await createReturn(param(req.params.id), parse(returnCreateSchema, req.body), req.user?.id));
});

export const entriesRouter = Router();

entriesRouter.post("/dispatches/:id/void", async (req, res) => {
  res.json(await voidDispatch(param(req.params.id), parse(reasonSchema, req.body).reason, req.user?.id));
});

entriesRouter.post("/returns/:id/void", async (req, res) => {
  res.json(await voidReturn(param(req.params.id), parse(reasonSchema, req.body).reason, req.user?.id));
});
