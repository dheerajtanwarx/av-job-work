"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

/** Filter row that sits directly above a table. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("no-print mb-3 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-muted" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className="pl-8 [&::-webkit-search-cancel-button]:hidden" />
    </div>
  );
}

/** Two date inputs joined into one control. */
export function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="flex h-8 w-full items-center rounded-md border border-border-strong bg-surface shadow-xs focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/15 sm:w-auto pointer-coarse:h-10 [&_input]:h-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none [&_input]:focus:ring-0">
      <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="w-full sm:w-[128px]" aria-label="From date" title="From" />
      <span className="text-xs text-fg-faint" aria-hidden>
        –
      </span>
      <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="w-full sm:w-[128px]" aria-label="To date" title="To" />
    </div>
  );
}
