"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * A "Filters" button that opens a side drawer (bottom sheet on phones) holding filter fields.
 * `count` shows how many filters are active. Children render inside the drawer.
 */
export function FilterDrawer({
  children,
  count = 0,
  onClear,
  title = "Filters",
  label = "Filters",
  className,
}: {
  children: ReactNode;
  count?: number;
  onClear?: () => void;
  title?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <Button variant="secondary" className={className}>
          <SlidersHorizontal /> {label}
          {count > 0 && <span className="num ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-solid px-1 text-[10px] text-on-accent">{count}</span>}
        </Button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[overlay-in_150ms_ease-out] dark:bg-black/60" />
        <D.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-xl bg-surface shadow-overlay focus:outline-none data-[state=open]:animate-[sheet-in_180ms_cubic-bezier(0.2,0.8,0.2,1)]",
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[360px] sm:rounded-none sm:rounded-l-xl",
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <D.Title className="text-[15px] font-semibold">{title}</D.Title>
            <D.Description className="sr-only">Narrow down the list</D.Description>
            <D.Close className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {onClear && (
              <Button variant="ghost" onClick={onClear} disabled={count === 0}>
                Clear all
              </Button>
            )}
            <Button onClick={() => setOpen(false)}>Show results</Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
