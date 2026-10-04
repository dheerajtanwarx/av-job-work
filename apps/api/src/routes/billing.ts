import { prisma } from "@av/db";
import { invoiceCreateSchema, paymentCreateSchema, PAYMENT_STATUSES, reasonSchema, settingsSchema, type PaymentStatus } from "@av/shared";
import { Router } from "express";
import { audit } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { param, parse, str } from "../lib/http.js";
import { cancelInvoice, createInvoice, createPayment, getInvoice, getSettings, getUnbilled, listInvoices, listPayments, voidPayment } from "../services/billing.js";

const dateQ = (v: unknown) => (str(v) ? toDate(str(v)!) : undefined);

export const billingRouter = Router();

billingRouter.get("/billing/unbilled", async (req, res) => {
  res.json(await getUnbilled(prisma, { clientId: str(req.query.clientId), jobId: str(req.query.jobId) }));
});

billingRouter.get("/invoices", async (req, res) => {
  const status = str(req.query.status);
  res.json(
    await listInvoices({
      clientId: str(req.query.clientId),
      from: dateQ(req.query.from),
      to: dateQ(req.query.to),
      q: str(req.query.q),
      status: status === "OPEN" || (PAYMENT_STATUSES as readonly string[]).includes(status ?? "") ? (status as PaymentStatus | "OPEN") : undefined,
    }),
  );
});

billingRouter.post("/invoices", async (req, res) => {
  res.status(201).json(await createInvoice(parse(invoiceCreateSchema, req.body), req.user?.id));
});

billingRouter.get("/invoices/:id", async (req, res) => {
  res.json(await getInvoice(param(req.params.id)));
});

billingRouter.post("/invoices/:id/cancel", async (req, res) => {
  res.json(await cancelInvoice(param(req.params.id), parse(reasonSchema, req.body).reason, req.user?.id));
});

billingRouter.get("/payments", async (req, res) => {
  res.json(await listPayments({ clientId: str(req.query.clientId), invoiceId: str(req.query.invoiceId), from: dateQ(req.query.from), to: dateQ(req.query.to) }));
});

billingRouter.post("/payments", async (req, res) => {
  res.status(201).json(await createPayment(parse(paymentCreateSchema, req.body), req.user?.id));
});

billingRouter.post("/payments/:id/void", async (req, res) => {
  res.json(await voidPayment(param(req.params.id), parse(reasonSchema, req.body).reason, req.user?.id));
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
