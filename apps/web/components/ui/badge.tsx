import { JOB_STATUS_LABEL, PAY_STATUS_LABEL, type AgingBucket, type JobStatus, type PayStatus } from "@av/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Dot colour per tone. Text stays neutral so status never relies on colour alone.
 * Semantic palette used across the app (always paired with a text label):
 *  success = Completed / Paid · yellow = Partial / Due soon · orange = Pending / Attention
 *  danger = Overdue / Outstanding · info = In progress · accent = brand · neutral = Draft / Cancelled / Voided
 */
const dots = {
  neutral: "bg-fg-faint",
  accent: "bg-accent",
  warning: "bg-warning-solid",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-blue-500",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
} as const;

/** Tinted background + text for the "soft" (pill) variant. */
const soft = {
  neutral: "bg-surface-2 text-fg-muted",
  accent: "bg-accent-subtle text-accent",
  warning: "bg-warning-subtle text-warning",
  success: "bg-success-subtle text-success",
  danger: "bg-danger-subtle text-danger",
  info: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  yellow: "bg-yellow-400/20 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-200",
  orange: "bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
} as const;

export type Tone = keyof typeof dots;

export function Badge({
  tone = "neutral",
  children,
  className,
  dot = tone !== "neutral",
  variant = "dot",
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
  /** "dot" = neutral text with a coloured dot (default). "soft" = tinted pill. */
  variant?: "dot" | "soft";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-xs leading-none font-medium whitespace-nowrap",
        variant === "soft" ? soft[tone] : tone === "neutral" ? "bg-surface-2 text-fg-muted" : "text-fg-2",
        variant === "dot" && tone === "danger" && "text-danger",
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Tinted pill with a dot – the standard status chip. */
export function StatusBadge({ tone, children, className, title }: { tone: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <Badge tone={tone} variant="soft" dot className={className} title={title}>
      {children}
    </Badge>
  );
}

export const jobStatusTone: Record<JobStatus, Tone> = {
  DRAFT: "neutral",
  IN_PROGRESS: "info",
  PARTIALLY_RECEIVED: "yellow",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export function JobStatusBadge({ status, overdue }: { status: JobStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge tone={jobStatusTone[status]}>{JOB_STATUS_LABEL[status]}</StatusBadge>
      {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
    </span>
  );
}

export const payStatusTone: Record<PayStatus, Tone> = {
  NOT_PAID: "orange",
  PARTIAL: "yellow",
  PAID: "success",
  NOTHING_DUE: "neutral",
};

/** Payment status of a challan or return. Pass overdueDays > 0 to flag it red. */
export function PayStatusBadge({ status, overdueDays, label }: { status: PayStatus; overdueDays?: number; label?: string }) {
  if (overdueDays && overdueDays > 0 && status !== "PAID" && status !== "NOTHING_DUE")
    return (
      <StatusBadge tone="danger" title={`${PAY_STATUS_LABEL[status]} – ${overdueDays} days past due`}>
        {label ?? PAY_STATUS_LABEL[status]} · {overdueDays}d overdue
      </StatusBadge>
    );
  return <StatusBadge tone={payStatusTone[status]}>{label ?? PAY_STATUS_LABEL[status]}</StatusBadge>;
}

const agingTone: Record<AgingBucket, Tone> = { "0-3": "success", "4-7": "yellow", "8-15": "orange", "16-30": "danger", "30+": "danger" };

/** How long material has been outside, e.g. "8–15 days". */
export function AgingBadge({ bucket, days }: { bucket: AgingBucket | null; days?: number }) {
  if (!bucket) return <span className="text-xs text-fg-faint">—</span>;
  return (
    <StatusBadge tone={agingTone[bucket]} title={days !== undefined ? `${days} days outside` : undefined}>
      {bucket === "30+" ? "30+ days" : `${bucket.replace("-", "–")} days`}
    </StatusBadge>
  );
}

export type BillState = "paid" | "voided" | "settled" | "cancelled";

const billBadge: Record<BillState, { tone: Tone; label: string }> = {
  paid: { tone: "success", label: "Paid" },
  voided: { tone: "neutral", label: "Voided" },
  settled: { tone: "success", label: "Settled" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export function BillStatusBadge({ state }: { state: BillState }) {
  const b = billBadge[state];
  return (
    <Badge tone={b.tone} dot className="bg-transparent px-0">
      {b.label}
    </Badge>
  );
}
