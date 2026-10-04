export const JOB_STATUSES = ["DRAFT", "IN_PROGRESS", "PARTIALLY_RECEIVED", "COMPLETED", "CANCELLED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  PARTIALLY_RECEIVED: "Partially Received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Jobs whose material may still be outside. */
export const OPEN_JOB_STATUSES: JobStatus[] = ["DRAFT", "IN_PROGRESS", "PARTIALLY_RECEIVED"];

export const BILLING_POLICIES = ["AFTER_EACH_RETURN", "ON_COMPLETION", "MANUAL"] as const;
export type BillingPolicy = (typeof BILLING_POLICIES)[number];

export const BILLING_POLICY_LABEL: Record<BillingPolicy, string> = {
  AFTER_EACH_RETURN: "Bill after each return",
  ON_COMPLETION: "Bill when the whole job is complete",
  MANUAL: "I'll decide when to bill",
};

export const DISPATCH_KINDS = ["INITIAL", "REWORK"] as const;
export type DispatchKind = (typeof DISPATCH_KINDS)[number];

export const PAYMENT_METHODS = ["CASH", "UPI", "BANK", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK: "Bank transfer",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export const PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID", "CANCELLED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partially paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};
