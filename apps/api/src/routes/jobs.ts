import { prisma, type Prisma } from "@av/db";
import { dispatchCreateSchema, JOB_STATUSES, jobCreateSchema, jobUpdateSchema, OPEN_JOB_STATUSES, reasonSchema, returnCreateSchema, type JobStatus } from "@av/shared";
import { Router } from "express";
import { toDate } from "../lib/dates.js";
import { param, parse, str } from "../lib/http.js";
import { cancelJob, createDispatch, createJob, getJobDetail, loadJobs, regeneratePublicToken, toJobRow, updateJob, voidDispatch } from "../services/jobs.js";
import { challanLedger } from "../services/accounts.js";
import { createReturn, getReturn, listReturns, updateReturn, voidReturn } from "../services/returns.js";
import { returnUpdateSchema } from "@av/shared";

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
  res.status(201).json(await createJob(parse(jobCreateSchema, req.body), req.user));
});

jobsRouter.get("/:id", async (req, res) => {
  res.json(await getJobDetail(param(req.params.id)));
});

jobsRouter.patch("/:id", async (req, res) => {
  res.json(await updateJob(param(req.params.id), parse(jobUpdateSchema, req.body), req.user));
});

jobsRouter.get("/:id/ledger", async (req, res) => {
  res.json(await challanLedger(param(req.params.id)));
});

jobsRouter.post("/:id/public-token", async (req, res) => {
  res.json(await regeneratePublicToken(param(req.params.id), req.user));
});

jobsRouter.post("/:id/cancel", async (req, res) => {
  res.json(await cancelJob(param(req.params.id), parse(reasonSchema, req.body).reason, req.user));
});

jobsRouter.post("/:id/dispatches", async (req, res) => {
  res.status(201).json(await createDispatch(param(req.params.id), parse(dispatchCreateSchema, req.body), req.user));
});

jobsRouter.post("/:id/returns", async (req, res) => {
  res.status(201).json(await createReturn(param(req.params.id), parse(returnCreateSchema, req.body), req.user));
});

export const entriesRouter = Router();

entriesRouter.post("/dispatches/:id/void", async (req, res) => {
  res.json(await voidDispatch(param(req.params.id), parse(reasonSchema, req.body).reason, req.user));
});

entriesRouter.post("/returns/:id/void", async (req, res) => {
  res.json(await voidReturn(param(req.params.id), parse(reasonSchema, req.body).reason, req.user));
});

entriesRouter.get("/returns", async (req, res) => {
  res.json(
    await listReturns({
      clientId: str(req.query.clientId),
      jobId: str(req.query.jobId),
      designId: str(req.query.designId),
      productId: str(req.query.productId),
      jobWorkTypeId: str(req.query.jobWorkTypeId),
      from: str(req.query.from),
      to: str(req.query.to),
      q: str(req.query.q),
      includeVoided: req.query.voided === "true",
      skip: Number(req.query.skip) || 0,
      take: Math.min(200, Number(req.query.take) || 50),
    }),
  );
});

entriesRouter.get("/returns/:id", async (req, res) => {
  res.json(await getReturn(param(req.params.id)));
});

entriesRouter.patch("/returns/:id", async (req, res) => {
  res.json(await updateReturn(param(req.params.id), parse(returnUpdateSchema, req.body), req.user));
});
