import { AGING_BUCKETS, UNIT_DECIMALS, type AgingBucket, type JobStatus, type PaymentPolicy, type PayStatus, type Unit } from "./enums";

/**
 * The single source of truth for every quantity and money figure in the app.
 * All money is integer paise. Quantities may be decimal (unit-dependent) and are kept to 3 places.
 * Inputs are already-aggregated, non-voided totals.
 */

// ───────────────────────── Quantities ─────────────────────────

/** Rounds to 3 decimals so sums of decimal quantities never drift (0.1 + 0.2 → 0.3). */
export function roundQty(n: number) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function sumQty(values: number[]) {
  return roundQty(values.reduce((s, v) => s + v, 0));
}

export function unitDecimals(unit: Unit | string | null | undefined) {
  return UNIT_DECIMALS[(unit ?? "PCS") as Unit] ?? 0;
}

/** True when `n` has no more decimals than the unit allows (125.5 MTR ok, 12.5 PCS not). */
export function qtyFitsUnit(n: number, unit: Unit | string | null | undefined) {
  const f = 10 ** unitDecimals(unit);
  return Math.abs(Math.round(n * f) - n * f) < 1e-6;
}

/** Value of `qty` at `ratePaise` per unit, rounded to the paisa. */
export function lineAmount(qty: number, ratePaise: number) {
  // qty has ≤3 decimals and the rate is whole paise, so the exact product has ≤3 decimals:
  // snap away float noise first (1.005 × 100 = 100.4999…) so this matches SQL ROUND().
  return Math.round(Math.round(qty * ratePaise * 1000) / 1000);
}

export interface ReturnLineQty {
  okQty: number;
  damagedQty: number;
  rejectedQty: number;
  lostQty: number;
}

export interface PayableFlags {
  payDamaged: boolean;
  payRejected: boolean;
  payLost: boolean;
}

/** Quantity on a return line that earns job work value. Good work always does; the rest only if the flag is on. */
export function payableQty(l: ReturnLineQty, f: Partial<PayableFlags> = {}) {
  return roundQty(l.okQty + (f.payDamaged ? l.damagedQty : 0) + (f.payRejected ? l.rejectedQty : 0) + (f.payLost ? l.lostQty : 0));
}

export function returnLineValue(l: ReturnLineQty & Partial<PayableFlags> & { ratePaise: number }) {
  return lineAmount(payableQty(l, l), l.ratePaise);
}

export function returnLineTotal(l: ReturnLineQty) {
  return roundQty(l.okQty + l.damagedQty + l.rejectedQty + l.lostQty);
}

// ───────────────────────── Design line (job item) ─────────────────────────

export interface ItemTotalsInput {
  quantity: number; // ordered quantity for this design line
  ratePaise: number; // challan rate
  initialSent: number; // Σ INITIAL dispatch lines (non-voided)
  additionalSent?: number; // Σ ADDITIONAL dispatch lines
  reworkSent: number; // Σ REWORK dispatch lines
  ok: number; // Σ good qty on non-voided returns
  damaged: number;
  rejected: number;
  lost: number;
  /** Σ payable qty on non-voided returns (defaults to ok). */
  payableQty?: number;
  /** Σ value of non-voided return lines at their own return rates (defaults to ok × challan rate). */
  valuePaise?: number;
  billedQty: number; // Σ qty on non-voided qty-based voucher lines (legacy)
}

export interface ItemSummary extends Required<ItemTotalsInput> {
  sent: number;
  notYetSent: number;
  exceptions: number;
  accounted: number;
  /** Quantity still outside with the job worker (never negative). */
  pending: number;
  /** Quantity accounted for beyond what was sent (only via an approved exception). */
  excess: number;
  /** Good qty not yet covered by qty-based vouchers (legacy view). */
  unbilledQty: number;
  /** Job work value earned so far (return rates). */
  completedValuePaise: number;
  pendingValuePaise: number;
  expectedValuePaise: number;
  billedValuePaise: number;
  unbilledValuePaise: number;
  isDone: boolean;
}

export function summarizeItem(i: ItemTotalsInput): ItemSummary {
  const additionalSent = i.additionalSent ?? 0;
  const payable = i.payableQty ?? i.ok;
  const valuePaise = i.valuePaise ?? lineAmount(i.ok, i.ratePaise);
  const sent = roundQty(i.initialSent + additionalSent + i.reworkSent);
  const exceptions = roundQty(i.damaged + i.rejected + i.lost);
  const accounted = roundQty(i.ok + exceptions);
  const rawPending = roundQty(sent - accounted);
  const pending = Math.max(0, rawPending);
  const notYetSent = Math.max(0, roundQty(i.quantity - i.initialSent - additionalSent));
  const unbilledQty = Math.max(0, roundQty(i.ok - i.billedQty));
  return {
    ...i,
    additionalSent,
    payableQty: payable,
    valuePaise,
    sent,
    notYetSent,
    exceptions,
    accounted,
    pending,
    excess: Math.max(0, -rawPending),
    unbilledQty,
    completedValuePaise: valuePaise,
    pendingValuePaise: lineAmount(pending, i.ratePaise),
    expectedValuePaise: lineAmount(i.quantity, i.ratePaise),
    billedValuePaise: lineAmount(i.billedQty, i.ratePaise),
    unbilledValuePaise: lineAmount(unbilledQty, i.ratePaise),
    isDone: notYetSent === 0 && pending === 0,
  };
}

export interface JobTotals {
  quantity: number;
  sent: number;
  notYetSent: number;
  ok: number;
  damaged: number;
  rejected: number;
  lost: number;
  exceptions: number;
  pending: number;
  excess: number;
  payableQty: number;
  billedQty: number;
  unbilledQty: number;
  completedValuePaise: number;
  pendingValuePaise: number;
  expectedValuePaise: number;
  billedValuePaise: number;
  unbilledValuePaise: number;
}

const QTY_KEYS = ["quantity", "sent", "notYetSent", "ok", "damaged", "rejected", "lost", "exceptions", "pending", "excess", "payableQty", "billedQty", "unbilledQty"] as const;
const MONEY_KEYS = ["completedValuePaise", "pendingValuePaise", "expectedValuePaise", "billedValuePaise", "unbilledValuePaise"] as const;

export function sumTotals(items: Pick<ItemSummary, keyof JobTotals>[]): JobTotals {
  const t = Object.fromEntries([...QTY_KEYS, ...MONEY_KEYS].map((k) => [k, 0])) as unknown as JobTotals;
  for (const it of items) {
    for (const k of QTY_KEYS) t[k] = roundQty(t[k] + (it[k] ?? 0));
    for (const k of MONEY_KEYS) t[k] += it[k] ?? 0;
  }
  return t;
}

export function deriveJobStatus(args: { cancelled: boolean; items: Pick<ItemSummary, "sent" | "isDone">[]; hasReturns: boolean }): JobStatus {
  if (args.cancelled) return "CANCELLED";
  const sent = args.items.reduce((s, i) => s + i.sent, 0);
  if (sent === 0) return "DRAFT";
  if (args.items.length > 0 && args.items.every((i) => i.isDone)) return "COMPLETED";
  return args.hasReturns ? "PARTIALLY_RECEIVED" : "IN_PROGRESS";
}

/** Returns true when the quantities on a return line need an explicit exception reason. */
export function exceedsPending(pending: number, line: ReturnLineQty) {
  return returnLineTotal(line) > pending + 1e-9;
}

// ───────────────────────── Money ─────────────────────────

export interface MoneyPosition {
  /** Job work value earned (Σ return line values). */
  valuePaise: number;
  /** Σ non-voided payment vouchers. */
  paidPaise: number;
  /** What is still payable (never negative). */
  outstandingPaise: number;
  /** Paid in excess of the work value. */
  advancePaise: number;
}

export function moneyPosition(valuePaise: number, paidPaise: number): MoneyPosition {
  const diff = valuePaise - paidPaise;
  return { valuePaise, paidPaise, outstandingPaise: Math.max(0, diff), advancePaise: Math.max(0, -diff) };
}

/** A challan is settled (and gets its final settlement) once it is complete and its work value is fully paid. */
export function isSettled(status: JobStatus, valuePaise: number, paidPaise: number) {
  return status === "COMPLETED" && valuePaise > 0 && paidPaise >= valuePaise;
}

/** @deprecated qty-based rule from before amount-based vouchers; use isSettled. */
export function isFullyPaid(status: JobStatus, totals: Pick<JobTotals, "billedQty" | "unbilledQty">) {
  return status === "COMPLETED" && totals.unbilledQty === 0 && totals.billedQty > 0;
}

// ───────────────────────── Calendar dates (YYYY-MM-DD) ─────────────────────────

export const BUSINESS_TZ_DEFAULT = "Asia/Kolkata";

/** Today's calendar date in the business time zone, e.g. "2026-10-04". */
export function businessToday(tz = BUSINESS_TZ_DEFAULT, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Accepts "2026-10-04", an ISO timestamp or a Date stored as UTC midnight. */
export function dayOf(d: string | Date) {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}

const dayMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export function addDays(d: string | Date, n: number) {
  return new Date(dayMs(dayOf(d)) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(to: string | Date, from: string | Date) {
  return Math.round((dayMs(dayOf(to)) - dayMs(dayOf(from))) / 86_400_000);
}

export function isOverdue(expectedReturnDate: Date | string | null | undefined, status: JobStatus, today: string = businessToday()) {
  if (!expectedReturnDate) return false;
  if (status === "COMPLETED" || status === "CANCELLED" || status === "DRAFT") return false;
  return dayOf(expectedReturnDate) < today;
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 3) return AGING_BUCKETS[0];
  if (days <= 7) return AGING_BUCKETS[1];
  if (days <= 15) return AGING_BUCKETS[2];
  if (days <= 30) return AGING_BUCKETS[3];
  return AGING_BUCKETS[4];
}

// ───────────────────────── Payment terms & due dates ─────────────────────────

export interface PaymentTerms {
  policy: PaymentPolicy;
  days: number;
}

/** Challan override → worker terms → business default. */
export function effectiveTerms(
  job: { paymentPolicy?: PaymentPolicy | null; paymentDays?: number | null },
  worker: { paymentPolicy?: PaymentPolicy | null; paymentDays?: number | null },
  defaults: PaymentTerms,
): PaymentTerms {
  if (job.paymentPolicy) return { policy: job.paymentPolicy, days: job.paymentDays ?? 0 };
  if (worker.paymentPolicy) return { policy: worker.paymentPolicy, days: worker.paymentDays ?? 0 };
  return defaults;
}

/** When the work on a return must be paid. null = no due date (manual, or challan not complete yet). */
export function paymentDueDate(terms: PaymentTerms, returnDate: string | Date, challanCompletedDate?: string | Date | null): string | null {
  switch (terms.policy) {
    case "IMMEDIATE":
      return dayOf(returnDate);
    case "AFTER_EACH_RETURN":
    case "DAYS_AFTER_RETURN":
      return addDays(returnDate, terms.days);
    case "AFTER_COMPLETION":
      return challanCompletedDate ? addDays(challanCompletedDate, terms.days) : null;
    default:
      return null;
  }
}

/** Days past the due date (0 when not yet due or no due date). */
export function overdueDays(due: string | null, today: string = businessToday()) {
  return due ? Math.max(0, diffDays(today, due)) : 0;
}

export interface AllocReturn {
  id: string;
  valuePaise: number;
}

export interface AllocPayment {
  amountPaise: number;
  returnId?: string | null;
}

/**
 * Spreads payments over returns: a voucher linked to a return pays that return first; everything else
 * (and any surplus) pays the oldest unpaid return first. `returns` must be in chronological order.
 */
export function allocatePayments(returns: AllocReturn[], payments: AllocPayment[]) {
  const paid = new Map(returns.map((r) => [r.id, 0]));
  const value = new Map(returns.map((r) => [r.id, r.valuePaise]));
  let pool = 0;
  for (const p of payments) {
    if (p.returnId && paid.has(p.returnId)) {
      const room = Math.max(0, value.get(p.returnId)! - paid.get(p.returnId)!);
      const use = Math.min(room, p.amountPaise);
      paid.set(p.returnId, paid.get(p.returnId)! + use);
      pool += p.amountPaise - use;
    } else pool += p.amountPaise;
  }
  for (const r of returns) {
    if (pool <= 0) break;
    const use = Math.min(Math.max(0, r.valuePaise - paid.get(r.id)!), pool);
    paid.set(r.id, paid.get(r.id)! + use);
    pool -= use;
  }
  return { paid, advancePaise: pool };
}

export function payStatus(valuePaise: number, paidPaise: number): PayStatus {
  if (valuePaise <= 0) return "NOTHING_DUE";
  if (paidPaise >= valuePaise) return "PAID";
  return paidPaise > 0 ? "PARTIAL" : "NOT_PAID";
}

export interface ReturnPayment {
  valuePaise: number;
  paidPaise: number;
  outstandingPaise: number;
  status: PayStatus;
  dueDate: string | null;
  overdueDays: number;
}

export function returnPayment(valuePaise: number, paidPaise: number, dueDate: string | null, today: string = businessToday()): ReturnPayment {
  const outstandingPaise = Math.max(0, valuePaise - paidPaise);
  return {
    valuePaise,
    paidPaise,
    outstandingPaise,
    status: payStatus(valuePaise, paidPaise),
    dueDate,
    overdueDays: outstandingPaise > 0 ? overdueDays(dueDate, today) : 0,
  };
}

// ───────────────────────── Ledgers ─────────────────────────

export interface LedgerInput {
  date: string; // business date
  at: string; // exact timestamp, for ordering within a day
  debitPaise: number; // job work value payable to the worker
  creditPaise: number; // payment made
}

/** Sorts entries and adds a running balance (payable to the worker). */
export function buildLedger<T extends LedgerInput>(entries: T[], openingPaise = 0): (T & { balancePaise: number })[] {
  let bal = openingPaise;
  return [...entries]
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)) || a.at.localeCompare(b.at))
    .map((e) => {
      bal += e.debitPaise - e.creditPaise;
      return { ...e, balancePaise: bal };
    });
}

// ───────────────────────── Material stock ─────────────────────────

export interface StockInput {
  received: number; // RECEIPT
  adjustIn: number;
  adjustOut: number;
  issued: number; // INITIAL + ADDITIONAL dispatches
  rework: number; // REWORK dispatches (taken from the damaged/rejected pile)
  ok: number;
  damaged: number;
  rejected: number;
  lost: number;
}

export function stockPosition(s: StockInput) {
  return {
    /** Good stock at the warehouse, ready to issue. */
    available: roundQty(s.received + s.adjustIn - s.adjustOut - s.issued + s.ok),
    /** Damaged/rejected pieces back at the warehouse and not sent for rework. */
    damagedHeld: roundQty(s.damaged + s.rejected - s.rework),
    /** Still with job workers. */
    withWorkers: Math.max(0, roundQty(s.issued + s.rework - s.ok - s.damaged - s.rejected - s.lost)),
    lost: s.lost,
  };
}

// ───────────────────────── Worker performance ─────────────────────────

export interface ChallanPerf {
  jobDate: string;
  status: JobStatus;
  overdue: boolean;
  firstReturnDate: string | null;
  lastReturnDate: string | null;
  initialSent: number;
  reworkSent: number;
  ok: number;
  damaged: number;
  rejected: number;
  lost: number;
  pending: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function workerMetrics(challans: ChallanPerf[]) {
  const live = challans.filter((c) => c.status !== "CANCELLED");
  const completed = live.filter((c) => c.status === "COMPLETED" && c.lastReturnDate);
  const returned = live.filter((c) => c.firstReturnDate);
  const accounted = live.reduce((s, c) => s + c.ok + c.damaged + c.rejected + c.lost, 0);
  const issued = live.reduce((s, c) => s + c.initialSent, 0);
  return {
    challans: live.length,
    avgCompletionDays: avg(completed.map((c) => diffDays(c.lastReturnDate!, c.jobDate))),
    avgFirstReturnDays: avg(returned.map((c) => diffDays(c.firstReturnDate!, c.jobDate))),
    avgFinalReturnDays: avg(returned.map((c) => diffDays(c.lastReturnDate!, c.jobDate))),
    pending: roundQty(live.reduce((s, c) => s + c.pending, 0)),
    overdueChallans: live.filter((c) => c.overdue).length,
    /** Damaged + lost as % of everything that came back or was written off. */
    defectPct: pct(live.reduce((s, c) => s + c.damaged + c.lost, 0), accounted),
    rejectionPct: pct(live.reduce((s, c) => s + c.rejected, 0), accounted),
    /** Rework issued as % of the quantity originally issued. */
    reworkPct: pct(live.reduce((s, c) => s + c.reworkSent, 0), issued),
    reworkChallans: live.filter((c) => c.reworkSent > 0).length,
  };
}
export type WorkerMetrics = ReturnType<typeof workerMetrics>;
