import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A bordered surface. Use only when containment adds meaning (tables, lists, the invoice sheet). */
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
