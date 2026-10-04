"use client";

import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Popover } from "radix-ui";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
  sub?: ReactNode;
  keywords?: string[];
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "Nothing found",
  onCreate,
  createLabel = "Add new",
  invalid,
  className,
  autoFocus,
}: {
  options: ComboOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onCreate?: (typed: string) => void;
  createLabel?: string;
  invalid?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          autoFocus={autoFocus}
          aria-invalid={invalid}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-card px-3 text-left transition-colors focus:border-indigo focus:ring-2 focus:ring-indigo/15 focus:outline-none aria-[invalid=true]:border-madder",
            !selected && "text-faint",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-xl border border-line bg-card shadow-[var(--shadow-pop)]">
          <Command loop>
            <Command.Input value={search} onValueChange={setSearch} placeholder={searchPlaceholder} className="h-11 w-full border-b border-line bg-transparent px-3 outline-none placeholder:text-faint" />
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-4 text-center text-sm text-muted">{emptyText}</Command.Empty>
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  value={`${o.label} ${o.keywords?.join(" ") ?? ""} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[0.95rem] data-[selected=true]:bg-indigo-50"
                >
                  <Check className={cn("size-4 shrink-0 text-indigo", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-muted">{o.sub}</span>}
                  </span>
                </Command.Item>
              ))}
            </Command.List>
            {onCreate && (
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-sm font-semibold text-indigo hover:bg-indigo-50"
                onClick={() => {
                  setOpen(false);
                  onCreate(search);
                  setSearch("");
                }}
              >
                <Plus className="size-4" />
                {search ? `${createLabel} “${search}”` : createLabel}
              </button>
            )}
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
