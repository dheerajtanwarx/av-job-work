"use client";

import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod } from "@av/shared";
import { cn } from "@/lib/utils";

/** Cash / UPI / Bank transfer / NEFT / RTGS / Cheque / Other as large tap targets. */
export function MethodChips({ value, onChange, id = "paid-by" }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void; id?: string }) {
  return (
    <div>
      <span id={id} className="mb-1.5 block text-[13px] leading-4 font-medium text-fg-2">
        Paid by
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {PAYMENT_METHODS.map((pm) => (
          <button
            key={pm}
            type="button"
            role="radio"
            aria-checked={value === pm}
            onClick={() => onChange(pm)}
            className={cn(
              "h-9 rounded-md border px-3 text-[13px] font-medium transition-colors duration-100 pointer-coarse:h-11",
              value === pm ? "border-accent bg-accent-subtle text-fg" : "border-border-strong text-fg-2 hover:bg-surface-2",
            )}
          >
            {PAYMENT_METHOD_LABEL[pm]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A big three-way choice (Pay full / Partial / No payment now). */
export function ChoiceCards<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; sub?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 py-2 text-center transition-colors duration-100",
            value === o.value ? "border-accent bg-accent-subtle text-fg ring-1 ring-accent" : "border-border-strong bg-surface text-fg-2 hover:bg-surface-2",
          )}
        >
          <span className="text-[13px] leading-tight font-semibold">{o.label}</span>
          {o.sub && <span className="num mt-0.5 text-xs text-fg-muted">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
