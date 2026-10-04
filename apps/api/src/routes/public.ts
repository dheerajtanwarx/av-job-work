import { prisma } from "@av/db";
import type { PublicChallan } from "@av/shared";
import { Router } from "express";
import { getSettings } from "../services/billing.js";
import { getJobDetail } from "../services/jobs.js";

/** Unauthenticated, read-only, token-addressed views (QR challan view). Mounted before requireAuth. */
export const publicRouter = Router();

const TOKEN = /^[0-9a-f]{64}$/;

publicRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.set("Referrer-Policy", "no-referrer");
  next();
});

/**
 * The challan behind a printed QR code. Only what a job worker may see: no phone numbers, addresses, GSTIN, notes,
 * photos, internal ids or admin links. Unknown and malformed tokens get the same 404.
 */
publicRouter.get("/challans/:token", async (req, res) => {
  const token = String(req.params.token ?? "").toLowerCase();
  const job = TOKEN.test(token) ? await prisma.job.findUnique({ where: { publicToken: token }, select: { id: true } }) : null;
  if (!job) return res.status(404).json({ message: "This challan link is not valid. Please ask for a new QR code." });

  const [d, business] = await Promise.all([getJobDetail(job.id), getSettings()]);
  const designs = d.items.map((i) => ({
    designName: i.designName,
    designCode: i.designCode ?? null,
    unit: i.unit,
    issued: i.sent,
    returned: i.ok,
    damaged: i.damaged,
    rejected: i.rejected,
    lost: i.lost,
    pending: i.pending,
  }));
  const body: PublicChallan = {
    business: { name: business.businessName, logo: business.logo },
    challanNumber: d.jobNumber,
    challanDate: d.jobDate,
    status: d.status,
    overdue: d.overdue,
    workerName: d.client.name,
    product: d.product.name,
    jobWorkType: d.jobWorkType?.name ?? null,
    unit: d.unit,
    designs,
    totals: {
      issued: d.totals.sent,
      returned: d.totals.ok,
      damaged: d.totals.damaged,
      rejected: d.totals.rejected,
      lost: d.totals.lost,
      pending: d.totals.pending,
    },
    money: { workValuePaise: d.money.valuePaise, paidPaise: d.money.paidPaise, outstandingPaise: d.money.outstandingPaise, advancePaise: d.money.advancePaise },
    payStatus: d.payStatus,
    returns: d.returns
      .filter((r) => !r.voidedAt)
      .map((r) => ({ returnNumber: r.returnNumber, date: r.date, receivedAt: r.receivedAt, qty: r.total, okQty: r.okQty, ratePaise: r.ratePaise, valuePaise: r.valuePaise }))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
    generatedAt: new Date().toISOString(),
  };
  res.json(body);
});
