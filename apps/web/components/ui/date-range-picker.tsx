"use client";

import { addDays, todayISO } from "@av/shared";
import { cn } from "@/lib/utils";
import { DateRange } from "./toolbar";

export interface RangePreset {
  label: string;
  range: () => { from: string; to: string };
}

const monthStart = (d: string) => `${d.slice(0, 8)}01`;
/** Indian financial year starts 1 April. */
const fyStart = (d: string) => {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
};

export const DEFAULT_RANGE_PRESETS: RangePreset[] = [
  { label: "Today", range: () => ({ from: todayISO(), to: todayISO() }) },
  { label: "7 days", range: () => ({ from: addDays(todayISO(), -6), to: todayISO() }) },
  { label: "30 days", range: () => ({ from: addDays(todayISO(), -29), to: todayISO() }) },
  { label: "This month", range: () => ({ from: monthStart(todayISO()), to: todayISO() }) },
  { label: "This FY", range: () => ({ from: fyStart(todayISO()), to: todayISO() }) },
  { label: "All", range: () => ({ from: "", to: "" }) },
];

/** From/to dates with quick presets underneath. */
export function DateRangePicker({
  from,
  to,
  onChange,
  presets = DEFAULT_RANGE_PRESETS,
  className,
}: {
  from: string;
  to: string;
  onChange: (r: { from: string; to: string }) => void;
  presets?: RangePreset[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <DateRange from={from} to={to} onFrom={(v) => onChange({ from: v, to })} onTo={(v) => onChange({ from, to: v })} />
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => {
          const r = p.range();
          const active = r.from === from && r.to === to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(r)}
              className={cn(
                "h-7 rounded-md px-2 text-xs font-medium transition-colors pointer-coarse:h-9",
                active ? "bg-accent-subtle text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
