import { exceedsPending, lineAmount, payableQty, qtyFitsUnit, returnLineTotal, roundQty, type JobItemView, type PayableFlags, type Unit } from "@av/shared";
import * as Crypto from "expo-crypto";

/** Ported from apps/web/lib/returns.ts + return-line-card.tsx so both apps validate a return the same way. */

export const newIdempotencyKey = () => Crypto.randomUUID();

/** Parses a typed quantity: NaN when blank-but-invalid, 0 when blank. */
export function parseQty(v: string) {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function qtyError(v: string, unit: Unit) {
  const n = parseQty(v);
  if (Number.isNaN(n)) return "Not a number";
  if (n < 0) return "Cannot be negative";
  if (!qtyFitsUnit(n, unit)) return unit === "PCS" || unit === "SET" || unit === "DOZEN" || unit === "ROLL" ? `Whole ${unit} only` : `Too many decimals for ${unit}`;
  return null;
}

/** Rupees as typed → paise; NaN when invalid. */
export function rupeesInput(v: string) {
  if (v.trim() === "") return Number.NaN;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
}

export const paiseToInput = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

export interface LineState {
  ok: string;
  damaged: string;
  rejected: string;
  lost: string;
  rate: string;
  reason: string;
  showIssues: boolean;
  payDamaged: boolean | null;
  payRejected: boolean | null;
  payLost: boolean | null;
  payReason: string;
}

export const initLine = (it: JobItemView): LineState => ({
  ok: "",
  damaged: "",
  rejected: "",
  lost: "",
  rate: paiseToInput(it.ratePaise),
  reason: "",
  showIssues: false,
  payDamaged: null,
  payRejected: null,
  payLost: null,
  payReason: "",
});

export const QTY_FIELDS = [
  ["damaged", "Damaged"],
  ["rejected", "Rejected"],
  ["lost", "Lost"],
] as const;

/** Everything derived from one design line as typed. */
export function lineCalc(it: JobItemView, l: LineState, defaults: PayableFlags, isManager: boolean) {
  const errors: Partial<Record<"ok" | "damaged" | "rejected" | "lost" | "rate", string>> = {};
  for (const k of ["ok", "damaged", "rejected", "lost"] as const) {
    const e = qtyError(l[k], it.unit);
    if (e) errors[k] = e;
  }
  const q = (v: string) => {
    const n = parseQty(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const line = { okQty: q(l.ok), damagedQty: q(l.damaged), rejectedQty: q(l.rejected), lostQty: q(l.lost) };
  const ratePaise = rupeesInput(l.rate);
  if (Number.isNaN(ratePaise)) errors.rate = "Enter a valid rate";
  const flags: PayableFlags = {
    payDamaged: isManager ? (l.payDamaged ?? defaults.payDamaged) : defaults.payDamaged,
    payRejected: isManager ? (l.payRejected ?? defaults.payRejected) : defaults.payRejected,
    payLost: isManager ? (l.payLost ?? defaults.payLost) : defaults.payLost,
  };
  const total = returnLineTotal(line);
  const payable = payableQty(line, flags);
  const overridden = payable !== payableQty(line, defaults);
  const amountPaise = Number.isNaN(ratePaise) ? 0 : lineAmount(payable, ratePaise);
  const over = total > 0 && exceedsPending(it.pending, line);
  const after = Math.max(0, roundQty(it.pending - total));
  const rateChanged = !Number.isNaN(ratePaise) && ratePaise !== it.ratePaise;
  return {
    line,
    ratePaise,
    flags,
    total,
    payable,
    overridden,
    amountPaise,
    over,
    after,
    rateChanged,
    errors,
    needsReason: over && !l.reason.trim(),
    needsPayReason: overridden && !l.payReason.trim(),
    hasError: Object.keys(errors).length > 0,
  };
}

export type LineCalc = ReturnType<typeof lineCalc>;
