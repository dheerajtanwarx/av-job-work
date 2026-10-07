export const JOB_STATUSES = ["DRAFT", "IN_PROGRESS", "PARTIALLY_RECEIVED", "COMPLETED", "CANCELLED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  PARTIALLY_RECEIVED: "Partially Received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Challans whose material may still be outside. */
export const OPEN_JOB_STATUSES: JobStatus[] = ["DRAFT", "IN_PROGRESS", "PARTIALLY_RECEIVED"];

export const PAYMENT_POLICIES = ["IMMEDIATE", "AFTER_EACH_RETURN", "DAYS_AFTER_RETURN", "AFTER_COMPLETION", "MANUAL"] as const;
export type PaymentPolicy = (typeof PAYMENT_POLICIES)[number];

export const PAYMENT_POLICY_LABEL: Record<PaymentPolicy, string> = {
  IMMEDIATE: "Immediate",
  AFTER_EACH_RETURN: "After each return",
  DAYS_AFTER_RETURN: "Days after return",
  AFTER_COMPLETION: "After complete challan",
  MANUAL: "Manual",
};

/** @deprecated kept so older clients compile; use PaymentPolicy. */
export type BillingPolicy = PaymentPolicy;

export const DISPATCH_KINDS = ["INITIAL", "ADDITIONAL", "REWORK"] as const;
export type DispatchKind = (typeof DISPATCH_KINDS)[number];

export const DISPATCH_KIND_LABEL: Record<DispatchKind, string> = {
  INITIAL: "Initial issue",
  ADDITIONAL: "Additional issue",
  REWORK: "Rework issue",
};

export const PAYMENT_METHODS = ["CASH", "UPI", "BANK", "NEFT", "RTGS", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK: "Bank transfer",
  NEFT: "NEFT",
  RTGS: "RTGS",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export const UNITS = ["PCS", "MTR", "KG", "ROLL", "DOZEN", "SET"] as const;
export type Unit = (typeof UNITS)[number];

/** How many decimals a quantity may have in each unit. */
export const UNIT_DECIMALS: Record<Unit, number> = { PCS: 0, MTR: 2, KG: 3, ROLL: 0, DOZEN: 0, SET: 0 };

export const UNIT_LABEL: Record<Unit, string> = { PCS: "PCS", MTR: "MTR", KG: "KG", ROLL: "ROLL", DOZEN: "DOZEN", SET: "SET" };

export const USER_ROLES = ["OWNER", "SUB_OWNER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABEL: Record<UserRole, string> = { OWNER: "Owner", SUB_OWNER: "Sub-owner" };
export const USER_ROLE_HELP: Record<UserRole, string> = {
  OWNER: "Everything, including users, settings and changing or voiding payments.",
  SUB_OWNER: "All daily work: challans, returns, new payments, job workers and masters. Can't change or void payments, users or settings.",
};

export const STOCK_MOVEMENT_TYPES = ["RECEIPT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** Every kind of line in the material movement ledger (warehouse-only types plus those derived from challans). */
export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "Stock received",
  ADJUSTMENT_IN: "Adjustment (in)",
  ADJUSTMENT_OUT: "Adjustment (out)",
  INITIAL: "Initial issue",
  ADDITIONAL: "Additional issue",
  REWORK: "Rework issue",
  RETURN: "Return",
  DAMAGED: "Damaged",
  REJECTED: "Rejected",
  LOST: "Lost",
};

export const PAY_STATUSES = ["NOT_PAID", "PARTIAL", "PAID", "NOTHING_DUE"] as const;
export type PayStatus = (typeof PAY_STATUSES)[number];

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  NOT_PAID: "Not paid",
  PARTIAL: "Partly paid",
  PAID: "Paid",
  NOTHING_DUE: "Nothing payable",
};

export const AGING_BUCKETS = ["0-3", "4-7", "8-15", "16-30", "30+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** @deprecated use PAYMENT_POLICIES / PAYMENT_POLICY_LABEL */
export const BILLING_POLICIES = PAYMENT_POLICIES;
/** @deprecated use PAYMENT_POLICY_LABEL */
export const BILLING_POLICY_LABEL = PAYMENT_POLICY_LABEL;
