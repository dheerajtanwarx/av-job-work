import { JOB_STATUS_LABEL, PAYMENT_STATUS_LABEL, type JobStatus, type PaymentStatus } from "@av/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-paper-2 text-ink-2 ring-line-strong",
  indigo: "bg-indigo-50 text-indigo ring-indigo/20",
  marigold: "bg-marigold-50 text-marigold-700 ring-marigold/30",
  leaf: "bg-leaf-50 text-leaf ring-leaf/25",
  madder: "bg-madder-50 text-madder ring-madder/25",
  plum: "bg-plum-50 text-plum ring-plum/20",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const jobTone: Record<JobStatus, Tone> = {
  DRAFT: "neutral",
  IN_PROGRESS: "indigo",
  PARTIALLY_RECEIVED: "marigold",
  COMPLETED: "leaf",
  CANCELLED: "madder",
};

export function JobStatusBadge({ status, overdue }: { status: JobStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={jobTone[status]} dot>
        {JOB_STATUS_LABEL[status]}
      </Badge>
      {overdue && <Badge tone="madder">Overdue</Badge>}
    </span>
  );
}

const payTone: Record<PaymentStatus, Tone> = { UNPAID: "madder", PARTIAL: "marigold", PAID: "leaf", CANCELLED: "neutral" };

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={payTone[status]} dot>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
