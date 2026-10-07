import { all, type DB } from "@av/db";
import {
  allocatePayments,
  dayOf,
  effectiveTerms,
  paymentDueDate,
  returnPayment,
  roundQty,
  type PaymentPolicy,
  type PaymentTerms,
  type ReturnPayment,
} from "@av/shared";
import { roundHalfUp } from "../lib/mongo.js";

/**
 * Data access for every derived figure. Quantities and values are aggregated in MongoDB (one grouped pipeline
 * per source collection, however many challans) and handed to the pure functions in @av/shared/calc.
 * Nothing here is cached or stored, so a change to any dispatch, return or voucher is reflected everywhere.
 */

/** Stored quantity (already a number when read through @av/db) / null → number. */
export function num(d: number | string | null | undefined): number {
  if (d === null || d === undefined) return 0;
  return typeof d === "number" ? d : Number(d);
}

/**
 * Pipeline expression for the payable quantity of a return line (`l` = "$lines" after $unwind, or "$$l" in $map).
 * Mirrors payableQty(). Exact: quantities are Decimal128.
 */
export const payableExpr = (l = "$lines") => ({
  $add: [
    `${l}.okQty`,
    { $cond: [`${l}.payDamaged`, `${l}.damagedQty`, 0] },
    { $cond: [`${l}.payRejected`, `${l}.rejectedQty`, 0] },
    { $cond: [`${l}.payLost`, `${l}.lostQty`, 0] },
  ],
});
/** round(payable × return rate) for one return line, rounded per line like returnLineValue(). */
export const valueExpr = (l = "$lines") => roundHalfUp({ $multiply: [payableExpr(l), `${l}.ratePaise`] });
/** Σ line values of a whole return document (0 when it has no lines). */
export const returnValueExpr = () => ({ $sum: { $map: { input: "$lines", as: "l", in: valueExpr("$$l") } } });

export interface ItemAgg {
  initialSent: number;
  additionalSent: number;
  reworkSent: number;
  ok: number;
  damaged: number;
  rejected: number;
  lost: number;
  payableQty: number;
  valuePaise: number;
  billedQty: number;
}

export const emptyAgg = (): ItemAgg => ({
  initialSent: 0, additionalSent: 0, reworkSent: 0, ok: 0, damaged: 0, rejected: 0, lost: 0, payableQty: 0, valuePaise: 0, billedQty: 0,
});

export interface JobAgg {
  paidPaise: number;
  voucherCount: number;
  returnCount: number;
  firstReturnDate: string | null;
  lastReturnDate: string | null;
}

/** Per job item: dispatched by kind, returned by kind, payable qty, value at return rates, and legacy billed qty. */
export async function itemAggregates(db: DB, jobIds: string[]): Promise<Map<string, ItemAgg>> {
  const out = new Map<string, ItemAgg>();
  if (!jobIds.length) return out;
  const get = (id: string) => {
    let a = out.get(id);
    if (!a) out.set(id, (a = emptyAgg()));
    return a;
  };
  const live = { jobId: { $in: jobIds }, voidedAt: null };
  const [dispatched, returned, billed] = await all([
    () =>
      db.dispatch.aggregate<{ id: string; kind: string; q: number }>([
        { $match: live },
        { $unwind: "$lines" },
        { $group: { _id: { id: "$lines.jobItemId", kind: "$kind" }, q: { $sum: "$lines.qty" } } },
        { $project: { _id: 0, id: "$_id.id", kind: "$_id.kind", q: 1 } },
      ]),
    () =>
      db.return.aggregate<{ id: string; ok: number; damaged: number; rejected: number; lost: number; payable: number; value: number }>([
        { $match: live },
        { $unwind: "$lines" },
        {
          $group: {
            _id: "$lines.jobItemId",
            ok: { $sum: "$lines.okQty" },
            damaged: { $sum: "$lines.damagedQty" },
            rejected: { $sum: "$lines.rejectedQty" },
            lost: { $sum: "$lines.lostQty" },
            payable: { $sum: payableExpr() },
            value: { $sum: valueExpr() },
          },
        },
      ]),
    () =>
      db.subBill.aggregate<{ id: string; q: number }>([
        { $match: live },
        { $unwind: "$lines" },
        { $group: { _id: "$lines.jobItemId", q: { $sum: "$lines.qty" } } },
      ]),
  ]);
  for (const d of dispatched) {
    const a = get(d.id);
    if (d.kind === "REWORK") a.reworkSent = roundQty(d.q);
    else if (d.kind === "ADDITIONAL") a.additionalSent = roundQty(d.q);
    else a.initialSent = roundQty(d.q);
  }
  for (const r of returned) {
    const a = get(r.id);
    a.ok = roundQty(r.ok);
    a.damaged = roundQty(r.damaged);
    a.rejected = roundQty(r.rejected);
    a.lost = roundQty(r.lost);
    a.payableQty = roundQty(r.payable);
    a.valuePaise = Math.round(r.value);
  }
  for (const b of billed) get(b.id).billedQty = roundQty(b.q);
  return out;
}

/** Per job: amount paid, voucher count, and first/last (non-voided) return dates. */
export async function jobAggregates(db: DB, jobIds: string[]): Promise<Map<string, JobAgg>> {
  const out = new Map<string, JobAgg>(jobIds.map((id) => [id, { paidPaise: 0, voucherCount: 0, returnCount: 0, firstReturnDate: null, lastReturnDate: null }]));
  if (!jobIds.length) return out;
  const live = { $match: { jobId: { $in: jobIds }, voidedAt: null } };
  const [paid, rets] = await all([
    () => db.subBill.aggregate<{ id: string; paid: number; n: number }>([live, { $group: { _id: "$jobId", paid: { $sum: "$amountPaise" }, n: { $sum: 1 } } }]),
    () => db.return.aggregate<{ id: string; n: number; first: Date; last: Date }>([live, { $group: { _id: "$jobId", n: { $sum: 1 }, first: { $min: "$date" }, last: { $max: "$date" } } }]),
  ]);
  for (const p of paid) {
    const a = out.get(p.id)!;
    a.paidPaise = p.paid;
    a.voucherCount = p.n;
  }
  for (const r of rets) {
    const a = out.get(r.id)!;
    a.returnCount = r.n;
    a.firstReturnDate = r.first ? dayOf(r.first) : null;
    a.lastReturnDate = r.last ? dayOf(r.last) : null;
  }
  return out;
}

// ───────────────────────── Payment terms ─────────────────────────

export async function defaultTerms(db: DB): Promise<PaymentTerms & { payDamaged: boolean; payRejected: boolean; payLost: boolean }> {
  const s = (await db.settings.update({ _id: 1 }, { $setOnInsert: {} }, { upsert: true }))!;
  return {
    policy: s.defaultPaymentPolicy as PaymentPolicy,
    days: s.defaultPaymentDays,
    payDamaged: s.payDamagedDefault,
    payRejected: s.payRejectedDefault,
    payLost: s.payLostDefault,
  };
}

export function termsFor(
  job: { paymentPolicy: PaymentPolicy | null; paymentDays: number | null },
  client: { paymentPolicy: PaymentPolicy | null; paymentDays: number | null },
  defaults: PaymentTerms,
) {
  return effectiveTerms(job, client, defaults);
}

// ───────────────────────── Return-level payment state ─────────────────────────

export interface ReturnMoney extends ReturnPayment {
  returnId: string;
  jobId: string;
  date: string;
  receivedAt: string;
}

/**
 * For each non-voided return of the given challans: its value, what has been paid towards it (allocation:
 * linked vouchers first, then oldest return first), its due date under the challan's payment terms and days overdue.
 */
export async function returnMoney(db: DB, jobIds: string[], today: string): Promise<Map<string, ReturnMoney>> {
  const out = new Map<string, ReturnMoney>();
  if (!jobIds.length) return out;
  type JobTerms = { id: string; status: string; completedAt: Date | null; paymentPolicy: PaymentPolicy | null; paymentDays: number | null; client: { paymentPolicy: PaymentPolicy | null; paymentDays: number | null } };
  const [jobs, values, vouchers, defaults] = await all([
    () =>
      db.job.find<JobTerms>(
        { _id: { $in: jobIds } },
        { select: "status completedAt paymentPolicy paymentDays clientId", populate: { path: "client", select: "paymentPolicy paymentDays" } },
      ),
    () =>
      db.return.aggregate<{ id: string; jobId: string; date: Date; receivedAt: Date; value: number }>([
        { $match: { jobId: { $in: jobIds }, voidedAt: null } },
        { $sort: { date: 1, receivedAt: 1 } },
        { $project: { jobId: 1, date: 1, receivedAt: 1, value: returnValueExpr() } },
      ]),
    () => db.subBill.find<{ jobId: string; amountPaise: number; returnId: string | null }>({ jobId: { $in: jobIds }, voidedAt: null }, { select: "jobId amountPaise returnId", sort: { date: 1, createdAt: 1 } }),
    () => defaultTerms(db),
  ]);
  const byJob = new Map<string, typeof values>();
  for (const v of values) byJob.set(v.jobId, [...(byJob.get(v.jobId) ?? []), v]);
  for (const job of jobs) {
    const rets = byJob.get(job.id) ?? [];
    const { paid } = allocatePayments(
      rets.map((r) => ({ id: r.id, valuePaise: Math.round(r.value) })),
      vouchers.filter((v) => v.jobId === job.id),
    );
    const terms = termsFor(job as never, job.client as never, defaults);
    const completedDate = job.status === "COMPLETED" && rets.length ? dayOf(rets[rets.length - 1].date) : null;
    for (const r of rets) {
      const due = paymentDueDate(terms, r.date, completedDate);
      out.set(r.id, { returnId: r.id, jobId: job.id, date: dayOf(r.date), receivedAt: r.receivedAt.toISOString(), ...returnPayment(Math.round(r.value), paid.get(r.id) ?? 0, due, today) });
    }
  }
  return out;
}
