import { JOB_STATUS_LABEL, PAYMENT_STATUS_LABEL, type JobStatus, type PaymentStatus } from "@av/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Dot colour per tone. Text stays neutral so status never relies on colour alone. */
const dots = {
  neutral: "bg-fg-faint",
  accent: "bg-accent",
  warning: "bg-warning-solid",
  success: "bg-success",
  danger: "bg-danger",
} as const;

export type Tone = keyof typeof dots;

export function Badge({ tone = "neutral", children, className, dot = tone !== "neutral" }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-xs leading-none font-medium whitespace-nowrap",
        tone === "neutral" ? "bg-surface-2 text-fg-muted" : "text-fg-2",
        tone === "danger" && "text-danger",
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} aria-hidden />}
      {children}
    </span>
  );
}

const jobTone: Record<JobStatus, Tone> = {
  DRAFT: "neutral",
  IN_PROGRESS: "accent",
  PARTIALLY_RECEIVED: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export function JobStatusBadge({ status, overdue }: { status: JobStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={jobTone[status]} dot className="bg-transparent px-0">
        {JOB_STATUS_LABEL[status]}
      </Badge>
      {overdue && <span className="text-xs font-medium text-danger">Overdue</span>}
    </span>
  );
}

const payTone: Record<PaymentStatus, Tone> = { UNPAID: "danger", PARTIAL: "warning", PAID: "success", CANCELLED: "neutral" };

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={payTone[status]} dot className="bg-transparent px-0">
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
