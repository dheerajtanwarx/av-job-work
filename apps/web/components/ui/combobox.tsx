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
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-2.5 text-left text-[13px] shadow-xs transition-[border-color,box-shadow] duration-100 hover:border-fg-faint/60 focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-danger data-[state=open]:border-accent data-[state=open]:ring-[3px] data-[state=open]:ring-accent/15 pointer-coarse:h-10",
            !selected && "text-fg-faint",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-fg-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-lg bg-surface shadow-overlay data-[state=open]:animate-[pop-in_120ms_ease-out]"
        >
          <Command loop>
            <Command.Input value={search} onValueChange={setSearch} placeholder={searchPlaceholder} className="h-9 w-full border-b border-border bg-transparent px-3 text-[13px] outline-none placeholder:text-fg-faint" />
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-fg-muted">{emptyText}</Command.Empty>
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  value={`${o.label} ${o.keywords?.join(" ") ?? ""} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-fg-muted">{o.sub}</span>}
                  </span>
                  <Check className={cn("size-3.5 shrink-0 text-accent", o.value === value ? "opacity-100" : "opacity-0")} />
                </Command.Item>
              ))}
            </Command.List>
            {onCreate && (
              <button
                type="button"
                className="flex h-9 w-full items-center gap-2 border-t border-border px-3 text-left text-[13px] font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
                onClick={() => {
                  setOpen(false);
                  onCreate(search);
                  setSearch("");
                }}
              >
                <Plus className="size-3.5 text-fg-muted" />
                {search ? `${createLabel} “${search}”` : createLabel}
              </button>
            )}
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
