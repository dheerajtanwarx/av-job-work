import { prisma } from "@av/db";
import { reasonSchema, settingsSchema, subBillCreateSchema } from "@av/shared";
import { Router } from "express";
import { audit } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { param, parse, str } from "../lib/http.js";
import { emailSubBill } from "../services/bill-email.js";
import { createSubBill, getMainBill, getSettings, getSubBill, getUnpaid, listMainBills, listSubBills, voidSubBill } from "../services/billing.js";

const dateQ = (v: unknown) => (str(v) ? toDate(str(v)!) : undefined);

export const billingRouter = Router();

billingRouter.get("/bills/unpaid", async (req, res) => {
  res.json(await getUnpaid(prisma, { clientId: str(req.query.clientId), jobId: str(req.query.jobId) }));
});

billingRouter.get("/sub-bills", async (req, res) => {
  res.json(
    await listSubBills({
      clientId: str(req.query.clientId),
      jobId: str(req.query.jobId),
      from: dateQ(req.query.from),
      to: dateQ(req.query.to),
      q: str(req.query.q),
      includeVoided: req.query.voided === "false" ? false : undefined,
    }),
  );
});

billingRouter.post("/sub-bills", async (req, res) => {
  const { id, created } = await createSubBill(parse(subBillCreateSchema, req.body), req.user);
  // The voucher is saved either way; the email result is reported alongside it. A repeated submit
  // (same idempotency key) returns the existing voucher and never emails again.
  const email = created
    ? await emailSubBill(id, req.user?.id, { auto: true })
    : { status: "skipped" as const, to: null, message: "This payment was already recorded" };
  res.status(created ? 201 : 200).json({ ...(await getSubBill(id)), email, duplicate: !created });
});

billingRouter.post("/sub-bills/:id/email", async (req, res) => {
  const id = param(req.params.id);
  const email = await emailSubBill(id, req.user?.id);
  res.json({ ...(await getSubBill(id)), email });
});

billingRouter.get("/sub-bills/:id", async (req, res) => {
  res.json(await getSubBill(param(req.params.id)));
});

billingRouter.post("/sub-bills/:id/void", async (req, res) => {
  res.json(await voidSubBill(param(req.params.id), parse(reasonSchema, req.body).reason, req.user));
});

billingRouter.get("/main-bills", async (req, res) => {
  res.json(await listMainBills({ clientId: str(req.query.clientId), from: dateQ(req.query.from), to: dateQ(req.query.to), q: str(req.query.q) }));
});

billingRouter.get("/main-bills/:id", async (req, res) => {
  res.json(await getMainBill(param(req.params.id)));
});

billingRouter.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

billingRouter.put("/settings", async (req, res) => {
  const data = parse(settingsSchema, req.body);
  await prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await audit(prisma, { entity: "Settings", entityId: "1", action: "update", after: data, userId: req.user?.id });
  res.json(await getSettings());
});
