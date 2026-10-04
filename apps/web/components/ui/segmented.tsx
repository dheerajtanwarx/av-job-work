"use client";

import { cn } from "@/lib/utils";

/** Compact segmented control for switching between two or three modes. */
export function Segmented<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-8 rounded-md bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] px-2.5 text-[13px] font-medium transition-colors duration-100",
            value === o.value ? "bg-surface text-fg shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.06)]" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
