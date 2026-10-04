"use client";

import { MoreHorizontal } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Overflow menu for secondary or destructive actions. */
export function Menu({ children, label = "More actions", trigger }: { children: ReactNode; label?: string; trigger?: ReactNode }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>
        {trigger ?? (
          <button
            aria-label={label}
            className="grid size-8 place-items-center rounded-md border border-border-strong bg-surface text-fg-2 shadow-xs transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2 pointer-coarse:size-10"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-lg bg-surface p-1 shadow-overlay data-[state=open]:animate-[pop-in_120ms_ease-out]">
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({ children, onSelect, danger, icon }: { children: ReactNode; onSelect: () => void; danger?: boolean; icon?: ReactNode }) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-3.5 [&_svg]:text-fg-muted",
        danger && "text-danger [&_svg]:text-danger",
      )}
    >
      {icon}
      {children}
    </M.Item>
  );
}
