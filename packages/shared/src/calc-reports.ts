import { diffDays, roundQty } from "./calc";

/**
 * Pure helpers for the dashboard, analytics and reports. Every figure is still derived by calc.ts;
 * these only classify or total figures that were already computed.
 */

// ───────────────────────── Material holding status ─────────────────────────

export const HOLDING_STATUSES = ["OVERDUE", "AGING", "OK"] as const;
export type HoldingStatus = (typeof HOLDING_STATUSES)[number];

export const HOLDING_STATUS_LABEL: Record<HoldingStatus, string> = { OVERDUE: "Overdue", AGING: "Aging", OK: "OK" };

/** Days a worker may hold material before it counts as "long outside" (dashboard attention). */
export const LONG_HOLD_DAYS = 30;
/** Days after which material outside is shown as Aging. */
export const AGING_HOLD_DAYS = 15;

/** Overdue when any challan behind it is past its expected return date or it has been out 30+ days; Aging after 15. */
export function holdingStatus(daysOutside: number, anyChallanOverdue: boolean): HoldingStatus {
  if (anyChallanOverdue || daysOutside >= LONG_HOLD_DAYS) return "OVERDUE";
  if (daysOutside > AGING_HOLD_DAYS) return "AGING";
  return "OK";
}

// ───────────────────────── Payment aging ─────────────────────────

export const PAYMENT_AGING_BUCKETS = ["NO_DUE_DATE", "NOT_DUE", "DUE_TODAY", "1-7", "8-15", "16-30", "30+"] as const;
export type PaymentAgingBucket = (typeof PAYMENT_AGING_BUCKETS)[number];

export const PAYMENT_AGING_LABEL: Record<PaymentAgingBucket, string> = {
  NO_DUE_DATE: "No due date",
  NOT_DUE: "Not due yet",
  DUE_TODAY: "Due today",
  "1-7": "1–7 days overdue",
  "8-15": "8–15 days overdue",
  "16-30": "16–30 days overdue",
  "30+": "30+ days overdue",
};

/** Where an outstanding amount sits relative to its due date. */
export function paymentAgingBucket(dueDate: string | null, today: string): PaymentAgingBucket {
  if (!dueDate) return "NO_DUE_DATE";
  const late = diffDays(today, dueDate);
  if (late < 0) return "NOT_DUE";
  if (late === 0) return "DUE_TODAY";
  if (late <= 7) return "1-7";
  if (late <= 15) return "8-15";
  if (late <= 30) return "16-30";
  return "30+";
}

// ───────────────────────── Search ─────────────────────────

/**
 * Reads an amount typed into search: "2000", "2,000", "₹2,000", "Rs 2000.50" → paise.
 * Returns null for anything that isn't clearly an amount (dates, codes, names).
 */
export function parseAmountQuery(q: string): number | null {
  const s = q.trim().replace(/^(₹|rs\.?|inr)\s*/i, "");
  if (!/^\d{1,3}(,\d{2,3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

// ───────────────────────── Totals ─────────────────────────

/** Sum of a numeric field over rows, rounded like quantities when `qty` is set. */
export function sumField<T>(rows: T[], get: (r: T) => number | null | undefined, qty = false) {
  const s = rows.reduce((t, r) => t + (get(r) ?? 0), 0);
  return qty ? roundQty(s) : s;
}

/** Mean of the non-null values, to one decimal; null when there are none. */
export function meanOf(values: (number | null | undefined)[]) {
  const xs = values.filter((v): v is number => typeof v === "number");
  return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
}

/** n / d as a percentage to one decimal, null when d is 0. */
export function percent(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

/** First day of the month, `count` months back from `today` (inclusive), for monthly chart ranges. */
export function monthsBack(today: string, count: number) {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1 - (count - 1);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** Every month ("2026-10") from `from` to `to`, inclusive, so charts show empty months as zero. */
export function monthSpan(from: string, to: string) {
  const out: string[] = [];
  let y = +from.slice(0, 4);
  let m = +from.slice(5, 7);
  const ey = +to.slice(0, 4);
  const em = +to.slice(5, 7);
  while ((y < ey || (y === ey && m <= em)) && out.length < 240) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

