import { db } from "@av/db";
import { NOTIFY_STATUSES, reasonSchema, settingsSchema, subBillCreateSchema, subBillUpdateSchema, type NotificationLogRow, type NotifyStatus } from "@av/shared";
import { Router } from "express";
import { audit, userNames } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { param, parse, str } from "../lib/http.js";
import { emailSubBill } from "../services/bill-email.js";
import { createSubBill, getMainBill, getSettings, getSubBill, getUnpaid, listMainBills, listSubBills, updateSubBill, voidSubBill } from "../services/billing.js";
import { OWNER_ONLY, requireRole } from "../middleware/auth.js";

const dateQ = (v: unknown) => (str(v) ? toDate(str(v)!) : undefined);

export const billingRouter = Router();

billingRouter.get("/bills/unpaid", async (req, res) => {
  res.json(await getUnpaid(db, { clientId: str(req.query.clientId), jobId: str(req.query.jobId) }));
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

billingRouter.patch("/sub-bills/:id", requireRole(...OWNER_ONLY), async (req, res) => {
  res.json(await updateSubBill(param(req.params.id), parse(subBillUpdateSchema, req.body), req.user));
});

billingRouter.post("/sub-bills/:id/void", requireRole(...OWNER_ONLY), async (req, res) => {
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

billingRouter.put("/settings", requireRole(...OWNER_ONLY), async (req, res) => {
  const data = parse(settingsSchema, req.body);
  const before = await getSettings();
  await db.settings.update({ _id: 1 }, { ...data, updatedById: req.user?.id }, { upsert: true });
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(data[k] ?? null));
  if (changed.length) {
    const fields = changed.map((k) => k.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ");
    await audit(db, { entity: "Settings", entityId: "1", action: "update", summary: `Settings changed: ${fields}`, before, after: data, userId: req.user?.id });
  }
  res.json(await getSettings());
});

/** Notification log (Settings → Notification log, and per record). Newest first. */
billingRouter.get("/notifications", async (req, res) => {
  const status = str(req.query.status);
  if (status && !NOTIFY_STATUSES.includes(status as NotifyStatus)) return res.status(422).json({ message: "Unknown status" });
  const take = Math.min(200, Math.max(1, Number(str(req.query.take)) || 50));
  const rows = await db.notificationLog.find(
    { entity: str(req.query.entity), entityId: str(req.query.entityId), status, channel: str(req.query.channel) },
    { sort: { createdAt: -1, _id: -1 }, limit: take },
  );
  const idsOf = (entity: string) => rows.filter((r) => r.entity === entity).map((r) => r.entityId);
  const [voucherIds, returnIds, dispatchIds] = [idsOf("SubBill"), idsOf("Return"), idsOf("Dispatch")];
  const [vouchers, returns, dispatches, names] = await Promise.all([
    voucherIds.length ? db.subBill.find({ _id: { $in: voucherIds } }, { select: "billNumber" }) : [],
    returnIds.length ? db.return.find({ _id: { $in: returnIds } }, { select: "returnNumber" }) : [],
    dispatchIds.length
      ? db.dispatch.find<{ id: string; job: { id: string; jobNumber: string } }>({ _id: { $in: dispatchIds } }, { select: "jobId", populate: { path: "job", select: "jobNumber" } })
      : [],
    userNames(db, rows.map((r) => r.userId)),
  ]);
  // Human reference and page for each logged record.
  const links = new Map<string, { ref: string; href: string }>([
    ...vouchers.map((v) => [`SubBill:${v.id}`, { ref: v.billNumber, href: `/bills/sub/${v.id}` }] as const),
    ...returns.map((x) => [`Return:${x.id}`, { ref: x.returnNumber, href: `/returns/${x.id}` }] as const),
    ...dispatches.map((d) => [`Dispatch:${d.id}`, { ref: `${d.job.jobNumber} issue`, href: `/jobs/${d.job.id}` }] as const),
  ]);
  const out: NotificationLogRow[] = rows.map((r) => {
    const link = links.get(`${r.entity}:${r.entityId}`) ?? null;
    return {
      id: r.id,
      channel: r.channel,
      kind: r.kind,
      entity: r.entity,
      entityId: r.entityId,
      ref: link?.ref ?? null,
      href: link?.href ?? null,
      recipient: r.recipient,
      status: r.status as NotifyStatus,
      error: r.error,
      auto: r.auto,
      user: r.userId ? (names.get(r.userId) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
  res.json(out);
});
