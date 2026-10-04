import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-[0.12em] text-marigold-700 uppercase">{eyebrow}</div>}
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-ink sm:text-[2rem]">{title}</h1>
        {subtitle && <div className="mt-1 text-[0.95rem] text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-dashed border-line-strong bg-paper text-indigo">
        <Icon className="size-6" strokeWidth={1.75} />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-paper-2", className)} />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-madder/30 bg-madder-50 p-4 text-sm text-madder">
      {error instanceof Error ? error.message : "Could not load this."}
      {onRetry && (
        <button className="ml-2 font-semibold underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

const statTones = {
  ink: "text-ink",
  indigo: "text-indigo",
  leaf: "text-leaf",
  madder: "text-madder",
  marigold: "text-marigold-700",
  muted: "text-faint",
} as const;

export function Stat({
  label,
  value,
  sub,
  tone = "ink",
  icon: Icon,
  className,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: keyof typeof statTones;
  icon?: LucideIcon;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-[0.78rem] font-semibold tracking-wide text-muted uppercase">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className={cn("num mt-1 font-display font-semibold tracking-tight", size === "lg" ? "text-3xl sm:text-[2.1rem]" : "text-2xl", statTones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
    </div>
  );
}

/** The Sent → Received → Pending bar: green received, rose exceptions, marigold pending. */
export function FlowBar({ sent, ok, exceptions, pending, className }: { sent: number; ok: number; exceptions: number; pending: number; className?: string }) {
  const total = Math.max(sent, ok + exceptions + pending, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-paper-2", className)} aria-hidden>
      <div className="bg-leaf transition-[width] duration-500" style={{ width: pct(ok) }} />
      <div className="bg-madder/70 transition-[width] duration-500" style={{ width: pct(exceptions) }} />
      <div className="bg-marigold transition-[width] duration-500" style={{ width: pct(pending) }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-card px-1.5 py-0.5 font-sans text-[0.7rem] text-muted">{children}</kbd>;
}
