import type { JobStatus, PaymentStatus } from "./enums";

/**
 * The single source of truth for every quantity and money figure in the app.
 * All money is integer paise. Inputs are already-aggregated, non-voided totals.
 */

export interface ItemTotalsInput {
  quantity: number; // ordered pieces for this design line
  ratePaise: number;
  initialSent: number; // Σ INITIAL dispatch lines (non-voided)
  reworkSent: number; // Σ REWORK dispatch lines (non-voided)
  ok: number; // Σ okQty on non-voided returns
  damaged: number;
  rejected: number;
  lost: number;
  billedQty: number; // Σ qty on non-cancelled invoice lines
}

export interface ItemSummary extends ItemTotalsInput {
  sent: number;
  notYetSent: number;
  exceptions: number;
  accounted: number;
  /** Pieces still outside with the job worker (never negative). */
  pending: number;
  /** Pieces accounted for beyond what was sent (only via an approved exception). */
  excess: number;
  unbilledQty: number;
  completedValuePaise: number;
  pendingValuePaise: number;
  expectedValuePaise: number;
  billedValuePaise: number;
  unbilledValuePaise: number;
  isDone: boolean;
}

export function summarizeItem(i: ItemTotalsInput): ItemSummary {
  const sent = i.initialSent + i.reworkSent;
  const exceptions = i.damaged + i.rejected + i.lost;
  const accounted = i.ok + exceptions;
  const rawPending = sent - accounted;
  const pending = Math.max(0, rawPending);
  const notYetSent = Math.max(0, i.quantity - i.initialSent);
  const unbilledQty = Math.max(0, i.ok - i.billedQty);
  return {
    ...i,
    sent,
    notYetSent,
    exceptions,
    accounted,
    pending,
    excess: Math.max(0, -rawPending),
    unbilledQty,
    completedValuePaise: i.ok * i.ratePaise,
    pendingValuePaise: pending * i.ratePaise,
    expectedValuePaise: i.quantity * i.ratePaise,
    billedValuePaise: i.billedQty * i.ratePaise,
    unbilledValuePaise: unbilledQty * i.ratePaise,
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
  billedQty: number;
  unbilledQty: number;
  completedValuePaise: number;
  pendingValuePaise: number;
  expectedValuePaise: number;
  billedValuePaise: number;
  unbilledValuePaise: number;
}

const TOTAL_KEYS: (keyof JobTotals)[] = [
  "quantity", "sent", "notYetSent", "ok", "damaged", "rejected", "lost", "exceptions", "pending", "excess",
  "billedQty", "unbilledQty", "completedValuePaise", "pendingValuePaise", "expectedValuePaise",
  "billedValuePaise", "unbilledValuePaise",
];

export function sumTotals(items: Pick<ItemSummary, keyof JobTotals>[]): JobTotals {
  const t = Object.fromEntries(TOTAL_KEYS.map((k) => [k, 0])) as unknown as JobTotals;
  for (const it of items) for (const k of TOTAL_KEYS) t[k] += it[k];
  return t;
}

export function deriveJobStatus(args: {
  cancelled: boolean;
  items: Pick<ItemSummary, "sent" | "isDone">[];
  hasReturns: boolean;
}): JobStatus {
  if (args.cancelled) return "CANCELLED";
  const sent = args.items.reduce((s, i) => s + i.sent, 0);
  if (sent === 0) return "DRAFT";
  if (args.items.length > 0 && args.items.every((i) => i.isDone)) return "COMPLETED";
  return args.hasReturns ? "PARTIALLY_RECEIVED" : "IN_PROGRESS";
}

/** Returns true when the quantities on a return line need an explicit exception reason. */
export function exceedsPending(pending: number, line: { okQty: number; damagedQty: number; rejectedQty: number; lostQty: number }) {
  return line.okQty + line.damagedQty + line.rejectedQty + line.lostQty > pending;
}

export function lineAmount(qty: number, ratePaise: number) {
  return qty * ratePaise;
}

export function computeInvoiceTotals(lines: { qty: number; ratePaise: number }[], taxPercent: number) {
  const subtotalPaise = lines.reduce((s, l) => s + l.qty * l.ratePaise, 0);
  const taxPaise = Math.round((subtotalPaise * taxPercent) / 100);
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}

export function paymentStatus(totalPaise: number, paidPaise: number, cancelled = false): PaymentStatus {
  if (cancelled) return "CANCELLED";
  if (paidPaise <= 0) return totalPaise === 0 ? "PAID" : "UNPAID";
  return paidPaise >= totalPaise ? "PAID" : "PARTIAL";
}

export function isOverdue(expectedReturnDate: Date | string | null | undefined, status: JobStatus, today = new Date()) {
  if (!expectedReturnDate) return false;
  if (status === "COMPLETED" || status === "CANCELLED" || status === "DRAFT") return false;
  const d = typeof expectedReturnDate === "string" ? new Date(expectedReturnDate) : expectedReturnDate;
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return d.getTime() < t.getTime();
}
