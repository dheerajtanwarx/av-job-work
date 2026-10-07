import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A bordered surface. Use only when containment adds meaning (tables, lists, the bill sheet). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2", className)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {description && <p className="truncate text-xs text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Unboxed section: a title row above content. Prefer this over Card for grouping. */
export function Section({ title, description, action, children, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
          {description && <p className="truncate text-xs text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Horizontally scrollable table wrapper. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative overflow-x-auto overscroll-x-contain", className)}>{children}</div>;
}

/**
 * Phone-friendly list of tappable cards. Use instead of a table below `sm` — e.g.
 * `<TableWrap className="max-sm:hidden">…</TableWrap><MobileList className="sm:hidden">…</MobileList>`.
 */
export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border", className)}>{children}</ul>;
}

export function MobileListItem({ children, href, onClick, className }: { children: ReactNode; href?: string; onClick?: () => void; className?: string }) {
  const cls = cn("block min-h-12 px-4 py-3 transition-colors duration-100 active:bg-surface-2", (href || onClick) && "cursor-pointer hover:bg-surface-2", className);
  if (href)
    return (
      <li>
        <Link href={href} className={cls}>
          {children}
        </Link>
      </li>
    );
  if (onClick)
    return (
      <li>
        <button type="button" onClick={onClick} className={cn(cls, "w-full text-left")}>
          {children}
        </button>
      </li>
    );
  return <li className={cls}>{children}</li>;
}
