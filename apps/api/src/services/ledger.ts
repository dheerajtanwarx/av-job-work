import { Prisma, type DB } from "@av/db";
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

/**
 * Data access for every derived figure. Quantities and values are aggregated in SQL (one grouped query per
 * source table, however many challans) and handed to the pure functions in @av/shared/calc.
 * Nothing here is cached or stored, so a change to any dispatch, return or voucher is reflected everywhere.
 */

/** Prisma Decimal / number / null → number. */
export function num(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d === null || d === undefined) return 0;
  if (typeof d === "number") return d;
  if (typeof d === "string") return Number(d);
  return d.toNumber();
}

/** SQL for the payable quantity and value of a ReturnLine aliased `rl`. Mirrors payableQty()/returnLineValue(). */
export const PAYABLE_SQL = Prisma.sql`(rl."okQty" + CASE WHEN rl."payDamaged" THEN rl."damagedQty" ELSE 0 END + CASE WHEN rl."payRejected" THEN rl."rejectedQty" ELSE 0 END + CASE WHEN rl."payLost" THEN rl."lostQty" ELSE 0 END)`;
export const VALUE_SQL = Prisma.sql`ROUND(${PAYABLE_SQL} * rl."ratePaise")`;

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
  const [dispatched, returned, billed] = await Promise.all([
    db.$queryRaw<{ id: string; kind: string; q: number }[]>`
      SELECT dl."jobItemId" AS id, d.kind::text AS kind, SUM(dl.qty)::float8 AS q
      FROM "DispatchLine" dl JOIN "Dispatch" d ON d.id = dl."dispatchId"
      WHERE d."voidedAt" IS NULL AND d."jobId" = ANY(${jobIds}::text[])
      GROUP BY 1, 2`,
    db.$queryRaw<{ id: string; ok: number; damaged: number; rejected: number; lost: number; payable: number; value: number }[]>`
      SELECT rl."jobItemId" AS id, SUM(rl."okQty")::float8 AS ok, SUM(rl."damagedQty")::float8 AS damaged,
        SUM(rl."rejectedQty")::float8 AS rejected, SUM(rl."lostQty")::float8 AS lost,
        SUM(${PAYABLE_SQL})::float8 AS payable, SUM(${VALUE_SQL})::float8 AS value
      FROM "ReturnLine" rl JOIN "Return" r ON r.id = rl."returnId"
      WHERE r."voidedAt" IS NULL AND r."jobId" = ANY(${jobIds}::text[])
      GROUP BY 1`,
    db.$queryRaw<{ id: string; q: number }[]>`
      SELECT sl."jobItemId" AS id, SUM(sl.qty)::float8 AS q
      FROM "SubBillLine" sl JOIN "SubBill" sb ON sb.id = sl."subBillId"
      WHERE sb."voidedAt" IS NULL AND sb."jobId" = ANY(${jobIds}::text[])
      GROUP BY 1`,
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
  const [paid, rets] = await Promise.all([
    db.subBill.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds }, voidedAt: null }, _sum: { amountPaise: true }, _count: true }),
    db.return.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds }, voidedAt: null }, _count: true, _min: { date: true }, _max: { date: true } }),
  ]);
  for (const p of paid) {
    const a = out.get(p.jobId)!;
    a.paidPaise = p._sum.amountPaise ?? 0;
    a.voucherCount = p._count;
  }
  for (const r of rets) {
    const a = out.get(r.jobId)!;
    a.returnCount = r._count;
    a.firstReturnDate = r._min.date ? dayOf(r._min.date) : null;
    a.lastReturnDate = r._max.date ? dayOf(r._max.date) : null;
  }
  return out;
}

// ───────────────────────── Payment terms ─────────────────────────

export async function defaultTerms(db: DB): Promise<PaymentTerms & { payDamaged: boolean; payRejected: boolean; payLost: boolean }> {
  const s = await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
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
  const [jobs, values, vouchers, defaults] = await Promise.all([
    db.job.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, status: true, completedAt: true, paymentPolicy: true, paymentDays: true, client: { select: { paymentPolicy: true, paymentDays: true } } },
    }),
    db.$queryRaw<{ id: string; jobId: string; date: Date; receivedAt: Date; value: number }[]>`
      SELECT r.id, r."jobId", r.date, r."receivedAt", COALESCE(SUM(${VALUE_SQL}), 0)::float8 AS value
      FROM "Return" r LEFT JOIN "ReturnLine" rl ON rl."returnId" = r.id
      WHERE r."voidedAt" IS NULL AND r."jobId" = ANY(${jobIds}::text[])
      GROUP BY r.id
      ORDER BY r.date, r."receivedAt"`,
    db.subBill.findMany({ where: { jobId: { in: jobIds }, voidedAt: null }, select: { jobId: true, amountPaise: true, returnId: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    defaultTerms(db),
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
