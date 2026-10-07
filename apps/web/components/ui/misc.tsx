import { CircleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-fg-muted">{eyebrow}</div>}
        <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em] text-fg">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[13px] text-fg-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <Icon className="mb-3 size-5 text-fg-faint" strokeWidth={1.75} />
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      {children && <p className="mt-1 max-w-xs text-[13px] text-fg-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-[shimmer_1.6s_ease-in-out_infinite] rounded bg-surface-2", className)} />;
}

/** Table-shaped placeholder: a header strip and evenly spaced rows. */
export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy aria-label="Loading" className="w-full">
      <div className="flex h-[34px] items-center gap-6 border-b border-border px-4">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="ml-auto h-2.5 w-12" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-6 border-b border-border px-4 last:border-0">
          <Skeleton className="h-3 w-20" />
          <Skeleton className={cn("h-3", ["w-40", "w-28", "w-36", "w-24"][i % 4])} />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2.5 rounded-lg border border-danger/25 bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger">
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{error instanceof Error ? error.message : "Could not load this."}</span>
      {onRetry && (
        <button className="shrink-0 rounded px-1.5 py-0.5 font-medium text-fg-2 transition-colors hover:bg-surface hover:text-fg" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

const statTones = {
  fg: "text-fg",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-fg-faint",
} as const;

export type StatTone = keyof typeof statTones;

export function Stat({
  label,
  value,
  sub,
  tone = "fg",
  icon: Icon,
  className,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className={cn("num mt-1 leading-tight font-semibold tracking-[-0.01em]", size === "lg" ? "text-2xl" : "text-lg", statTones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-muted">{sub}</div>}
    </div>
  );
}

/** A row of figures separated by hairlines. Children are <Metric>s; pass grid-cols-* via className. */
export function MetricStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-lg border border-border bg-border", className)}>{children}</div>;
}

export function Metric({ label, value, sub, tone = "fg", href, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: StatTone; href?: string; className?: string }) {
  const body = (
    <>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className={cn("num mt-1.5 text-xl leading-6 font-semibold tracking-[-0.01em]", statTones[tone])}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-fg-muted">{sub}</div>}
    </>
  );
  const cls = cn("block min-w-0 bg-surface px-4 py-3.5", className);
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors duration-100 hover:bg-surface-2 focus-visible:-outline-offset-2")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The Sent → Received → Pending bar: received, exceptions, pending. */
export function FlowBar({ sent, ok, exceptions, pending, className }: { sent: number; ok: number; exceptions: number; pending: number; className?: string }) {
  const total = Math.max(sent, ok + exceptions + pending, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={cn("flex h-1 w-full gap-px overflow-hidden rounded-full bg-surface-3", className)} aria-hidden>
      {ok > 0 && <div className="bg-success transition-[width] duration-300" style={{ width: pct(ok) }} />}
      {exceptions > 0 && <div className="bg-danger/70 transition-[width] duration-300" style={{ width: pct(exceptions) }} />}
      {pending > 0 && <div className="bg-warning-solid transition-[width] duration-300" style={{ width: pct(pending) }} />}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-surface px-1 font-sans text-[11px] leading-none text-fg-muted", className)}>{children}</kbd>;
}

/** Slim inline notice for page-level states (cancelled, draft, warnings). */
export function Notice({ tone = "neutral", icon: Icon, children, action, className }: { tone?: "neutral" | "warning" | "danger" | "accent"; icon?: LucideIcon; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-2.5 text-[13px]",
        {
          neutral: "border-border bg-surface-2 text-fg-2",
          warning: "border-warning/25 bg-warning-subtle text-fg-2",
          danger: "border-danger/25 bg-danger-subtle text-fg-2",
          accent: "border-accent/20 bg-accent-subtle text-fg-2",
        }[tone],
        className,
      )}
    >
      {Icon && <Icon className={cn("size-4 shrink-0", { neutral: "text-fg-muted", warning: "text-warning", danger: "text-danger", accent: "text-accent" }[tone])} />}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** Card-list placeholder for phone layouts (and anywhere a list of cards is loading). */
export function CardListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <ul aria-busy aria-label="Loading" className={cn("divide-y divide-border", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="space-y-2 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className={cn("h-3", ["w-48", "w-36", "w-40", "w-32"][i % 4])} />
          <div className="flex gap-6">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-14" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Figures grid placeholder (stat strips). */
export function StatsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div aria-busy aria-label="Loading" className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 bg-surface px-4 py-3.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Whole-page placeholder: header, stat strip and a table. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy aria-label="Loading" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <StatsSkeleton />
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="max-sm:hidden">
          <LoadingBlock rows={rows} />
        </div>
        <div className="sm:hidden">
          <CardListSkeleton rows={Math.min(rows, 4)} />
        </div>
      </div>
    </div>
  );
}

/** Label/value pairs in a compact grid (used on mobile cards and detail panels). */
export function KeyValues({ items, className, cols = 3 }: { items: { label: ReactNode; value: ReactNode; tone?: StatTone }[]; className?: string; cols?: 2 | 3 | 4 }) {
  return (
    <dl className={cn("grid gap-x-3 gap-y-2", { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[cols], className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="truncate text-[11px] text-fg-muted">{it.label}</dt>
          <dd className={cn("num truncate text-[13px] font-medium", statTones[it.tone ?? "fg"])}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
