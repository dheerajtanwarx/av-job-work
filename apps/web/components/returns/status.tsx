import { formatDate, formatINR, PAY_STATUS_LABEL, type ReturnPayment } from "@av/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Semantic status pill. Colour is always paired with text:
 * green = Paid / Completed, yellow = Partly paid / Due soon, orange = Not paid / Attention,
 * red = Overdue, blue = In progress, grey = neutral / void.
 */
const tones = {
  green: "bg-success-subtle text-success",
  yellow: "bg-warning-subtle text-warning",
  orange: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  red: "bg-danger-subtle text-danger",
  blue: "bg-accent-subtle text-accent",
  grey: "bg-surface-2 text-fg-muted",
} as const;
const dots = {
  green: "bg-success",
  yellow: "bg-warning-solid",
  orange: "bg-orange-500",
  red: "bg-danger",
  blue: "bg-accent",
  grey: "bg-fg-faint",
} as const;

export type PillTone = keyof typeof tones;

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap", tones[tone], className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} aria-hidden />
      {children}
    </span>
  );
}

/** Paid / Partly paid / Not paid / Overdue for one return's payment state. */
export function PayStatusPill({ payment, voided, className }: { payment: ReturnPayment | null; voided?: boolean; className?: string }) {
  if (voided) return <Pill tone="grey" className={className}>VOID</Pill>;
  if (!payment) return null;
  if (payment.status !== "PAID" && payment.status !== "NOTHING_DUE" && payment.overdueDays > 0)
    return (
      <Pill tone="red" className={className}>
        Overdue {payment.overdueDays}d
      </Pill>
    );
  const tone: PillTone = payment.status === "PAID" ? "green" : payment.status === "PARTIAL" ? "yellow" : payment.status === "NOT_PAID" ? "orange" : "grey";
  return (
    <Pill tone={tone} className={className}>
      {PAY_STATUS_LABEL[payment.status]}
    </Pill>
  );
}

/** One line: "₹500 of ₹1,200 paid · due 10 Oct 2026" (or "overdue by 3 days"). */
export function paymentSummary(p: ReturnPayment) {
  const parts: string[] = [];
  if (p.status === "PAID") parts.push(`${formatINR(p.paidPaise)} paid`);
  else if (p.status === "NOTHING_DUE") parts.push("Nothing payable");
  else parts.push(`${formatINR(p.outstandingPaise)} to pay${p.paidPaise > 0 ? ` (${formatINR(p.paidPaise)} paid)` : ""}`);
  if (p.outstandingPaise > 0) {
    if (p.overdueDays > 0) parts.push(`overdue by ${p.overdueDays} day${p.overdueDays === 1 ? "" : "s"}`);
    else if (p.dueDate) parts.push(`due ${formatDate(p.dueDate)}`);
    else parts.push("no due date");
  }
  return parts.join(" · ");
}
