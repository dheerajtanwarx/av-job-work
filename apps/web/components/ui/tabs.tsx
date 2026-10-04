"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Underline tabs with arrow-key navigation. */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: ReactNode }[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = items.findIndex((x) => x.value === value);
    const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    onChange(next.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div ref={ref} role="tablist" onKeyDown={onKey} className={cn("no-print -mx-4 flex gap-5 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0", className)}>
      {items.map((x) => {
        const active = x.value === value;
        return (
          <button
            key={x.value}
            data-value={x.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(x.value)}
            className={cn(
              "relative -mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 text-[13px] font-medium whitespace-nowrap transition-colors duration-100 focus-visible:outline-offset-0",
              active ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {x.label}
            {x.count !== undefined && x.count !== "" && <span className="num text-xs font-normal text-fg-faint">{x.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
