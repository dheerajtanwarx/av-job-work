"use client";

import { exceedsPending, formatINR, formatQty, lineAmount, payableQty, returnLineTotal, roundQty, UNIT_DECIMALS, type JobItemView, type PayableFlags } from "@av/shared";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Input, MoneyInput } from "@/components/ui/input";
import { paiseToInput, parseQty, qtyError, rupeesInput } from "@/lib/returns";
import { cn } from "@/lib/utils";

export interface LineState {
  ok: string;
  damaged: string;
  rejected: string;
  lost: string;
  /** Rupees as typed (starts at the challan rate). */
  rate: string;
  reason: string;
  showIssues: boolean;
  /** null = business default. */
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

const QTY_KEYS = [
  ["ok", "okQty", "Good"],
  ["damaged", "damagedQty", "Damaged"],
  ["rejected", "rejectedQty", "Rejected"],
  ["lost", "lostQty", "Lost"],
] as const;

/** Everything derived from one design line as typed. */
export function lineCalc(it: JobItemView, l: LineState, defaults: PayableFlags, isManager: boolean) {
  const errors: Partial<Record<"ok" | "damaged" | "rejected" | "lost" | "rate", string>> = {};
  for (const [k] of QTY_KEYS) {
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
  const needsReason = over && !l.reason.trim();
  const needsPayReason = overridden && !l.payReason.trim();
  return { line, ratePaise, flags, total, payable, overridden, amountPaise, over, after, rateChanged, errors, needsReason, needsPayReason, hasError: Object.keys(errors).length > 0 };
}

export type LineCalc = ReturnType<typeof lineCalc>;

export function ReturnLineCard({
  item: it,
  state: l,
  calc: c,
  onChange,
  isManager,
  defaults,
  showErrors,
}: {
  item: JobItemView;
  state: LineState;
  calc: LineCalc;
  onChange: (patch: Partial<LineState>) => void;
  isManager: boolean;
  defaults: PayableFlags;
  showErrors: boolean;
}) {
  const decimals = UNIT_DECIMALS[it.unit] ?? 0;
  const inputMode = decimals > 0 ? "decimal" : "numeric";
  const issues = roundQty(c.line.damagedQty + c.line.rejectedQty + c.line.lostQty);
  const paidKinds = [defaults.payDamaged && "damaged", defaults.payRejected && "rejected", defaults.payLost && "lost"].filter(Boolean) as string[];

  return (
    <li className={cn("px-4 py-4", it.pending === 0 && c.total === 0 && "bg-surface-2/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] leading-5 font-semibold">{it.designName}</div>
          <div className="num mt-0.5 text-xs text-fg-muted">
            {it.material ? `${it.material.name} · ` : ""}sent {formatQty(it.sent)} · back {formatQty(it.ok + it.exceptions)}
          </div>
        </div>
        <div className="num shrink-0 text-right">
          <div className="text-xs text-fg-muted">Pending</div>
          <div className={cn("text-[15px] font-semibold", it.pending > 0 ? "text-warning" : "text-fg-muted")}>
            {formatQty(it.pending)} <span className="text-xs font-normal">{it.unit}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,9rem)_minmax(0,1fr)]">
        <div>
          <label htmlFor={`ok-${it.id}`} className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-fg-2">
            <span>
              Good qty <span className="text-xs font-normal text-fg-muted">({it.unit})</span>
            </span>
            {it.pending > 0 && (
              <button type="button" onClick={() => onChange({ ok: String(it.pending) })} className="-my-1 h-7 rounded px-2 text-xs font-semibold text-accent hover:bg-accent-subtle">
                All {formatQty(it.pending)}
              </button>
            )}
          </label>
          <Input
            id={`ok-${it.id}`}
            type="text"
            inputMode={inputMode}
            enterKeyHint="next"
            autoComplete="off"
            value={l.ok}
            onChange={(e) => onChange({ ok: e.target.value.replace(",", ".") })}
            aria-invalid={!!c.errors.ok || c.over || undefined}
            placeholder="0"
            className="num h-12 text-right text-xl font-semibold pointer-coarse:h-12"
          />
          {c.errors.ok && <p className="mt-1 text-xs text-danger">{c.errors.ok}</p>}
        </div>
        <div>
          <label htmlFor={`rate-${it.id}`} className="mb-1.5 block text-[13px] font-medium text-fg-2">
            Rate <span className="text-xs font-normal text-fg-muted">/ {it.unit}</span>
          </label>
          <MoneyInput
            id={`rate-${it.id}`}
            value={l.rate}
            onChange={(e) => onChange({ rate: e.target.value })}
            aria-invalid={!!c.errors.rate || undefined}
            className="h-12 text-right text-base pointer-coarse:h-12"
          />
          {c.errors.rate ? (
            <p className="mt-1 text-xs text-danger">{c.errors.rate}</p>
          ) : c.rateChanged ? (
            <p className="num mt-1 text-xs text-warning">
              Challan rate {formatINR(it.ratePaise)}{" "}
              <button type="button" className="font-medium text-accent underline-offset-2 hover:underline" onClick={() => onChange({ rate: paiseToInput(it.ratePaise) })}>
                reset
              </button>
            </p>
          ) : null}
        </div>
        <div className="num col-span-2 flex items-end justify-between gap-3 rounded-md bg-surface-2 px-3 py-2 text-[13px] sm:col-span-1 sm:flex-col sm:items-end sm:justify-end sm:bg-transparent sm:p-0">
          <span className="text-fg-muted">
            {formatQty(c.payable)} × {Number.isNaN(c.ratePaise) ? "—" : formatINR(c.ratePaise)}
          </span>
          <span className="text-lg leading-6 font-semibold">{formatINR(c.amountPaise)}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={l.showIssues}
          onClick={() => onChange({ showIssues: !l.showIssues })}
          className="-ml-1 inline-flex h-10 items-center gap-1 rounded px-1 text-[13px] text-fg-muted transition-colors hover:text-fg"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-150", l.showIssues && "rotate-180")} />
          Damaged / Rejected / Lost
          {issues > 0 && <span className="num font-medium text-danger">({formatQty(issues)})</span>}
        </button>
        {c.total > 0 && (
          <span className="num text-xs text-fg-muted">
            Pending {formatQty(it.pending)} → <span className={cn("font-semibold", c.after ? "text-warning" : "text-success")}>{formatQty(c.after)} {it.unit}</span>
          </span>
        )}
      </div>

      {l.showIssues && (
        <div className="mt-1 space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {QTY_KEYS.slice(1).map(([k, , label]) => (
              <div key={k}>
                <label htmlFor={`${k}-${it.id}`} className="mb-1 block text-xs font-medium text-fg-2">
                  {label}
                </label>
                <Input
                  id={`${k}-${it.id}`}
                  type="text"
                  inputMode={inputMode}
                  autoComplete="off"
                  value={l[k]}
                  onChange={(e) => onChange({ [k]: e.target.value.replace(",", ".") })}
                  aria-invalid={!!c.errors[k] || undefined}
                  className="num h-11 text-right pointer-coarse:h-11"
                  placeholder="0"
                />
                {c.errors[k] && <p className="mt-1 text-xs text-danger">{c.errors[k]}</p>}
              </div>
            ))}
          </div>
          {isManager ? (
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 text-xs font-medium text-fg-2">Pay the worker for (owner / manager)</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(
                  [
                    ["payDamaged", "Damaged"],
                    ["payRejected", "Rejected"],
                    ["payLost", "Lost"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
                    <input type="checkbox" className="size-5 accent-[var(--accent-solid)]" checked={c.flags[k]} onChange={(e) => onChange({ [k]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              {c.overridden && (
                <div className="mt-2">
                  <Input
                    value={l.payReason}
                    onChange={(e) => onChange({ payReason: e.target.value })}
                    aria-invalid={(showErrors && c.needsPayReason) || undefined}
                    placeholder="Reason for changing what is paid (required)"
                    aria-label={`Reason for payable change on ${it.designName}`}
                  />
                  {showErrors && c.needsPayReason && <p className="mt-1 text-xs text-danger">Give a reason for this change</p>}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-fg-muted">{paidKinds.length ? `Good and ${paidKinds.join(", ")} quantities are paid.` : "Kept separate from good work and not paid for."}</p>
          )}
        </div>
      )}

      {c.over && (
        <div className="mt-2 rounded-md border border-warning/30 bg-warning-subtle p-3">
          <div className="num flex items-center gap-1.5 text-[13px] font-medium text-fg">
            <AlertTriangle className="size-4 shrink-0 text-warning" /> Only {formatQty(it.pending)} {it.unit} pending, but {formatQty(c.total)} entered.
          </div>
          <Input
            className="mt-2"
            value={l.reason}
            onChange={(e) => onChange({ reason: e.target.value })}
            aria-invalid={(showErrors && c.needsReason) || undefined}
            placeholder="Reason to record it anyway (required)"
            aria-label={`Reason for ${it.designName}`}
          />
          {showErrors && c.needsReason && <p className="mt-1 text-xs text-danger">Add a reason or correct the quantity</p>}
        </div>
      )}
    </li>
  );
}
