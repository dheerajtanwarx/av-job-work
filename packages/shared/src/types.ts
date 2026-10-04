import type { ItemSummary, JobTotals } from "./calc";
import type { BillingPolicy, DispatchKind, JobStatus, PaymentMethod } from "./enums";

/** API response shapes shared by the web app. Dates are ISO strings. */

export interface Client {
  id: string;
  name: string;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ClientListRow extends Client {
  activeJobs: number;
  pendingPieces: number;
  /** Value of OK pieces returned but not yet paid for. */
  toPayPaise: number;
}

export interface Product {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  description: string | null;
  isActive: boolean;
  jobCount?: number;
}

export interface Design {
  id: string;
  name: string;
  code: string | null;
  defaultRatePaise: number;
  description: string | null;
  isActive: boolean;
  jobCount?: number;
}

export interface JobItemView extends ItemSummary {
  id: string;
  designId: string;
  designName: string;
  sortOrder: number;
}

export interface JobListRow {
  id: string;
  jobNumber: string;
  jobDate: string;
  expectedReturnDate: string | null;
  status: JobStatus;
  overdue: boolean;
  client: { id: string; name: string };
  product: { id: string; name: string; unit: string };
  designs: string[];
  totals: JobTotals;
}

export type TimelineEvent =
  | { type: "created"; at: string; date: string; text: string }
  | {
      type: "dispatch";
      at: string;
      date: string;
      id: string;
      kind: DispatchKind;
      total: number;
      lines: { designName: string; qty: number }[];
      notes: string | null;
      voided: { at: string; reason: string | null } | null;
    }
  | {
      type: "return";
      at: string;
      date: string;
      id: string;
      returnNumber: string;
      total: number;
      okTotal: number;
      exceptionTotal: number;
      lines: { designName: string; okQty: number; damagedQty: number; rejectedQty: number; lostQty: number; exceptionReason: string | null }[];
      notes: string | null;
      voided: { at: string; reason: string | null } | null;
    }
  | {
      type: "sub_bill";
      at: string;
      date: string;
      id: string;
      billNumber: string;
      qty: number;
      amountPaise: number;
      method: PaymentMethod;
      voided: { at: string; reason: string | null } | null;
    }
  | { type: "main_bill"; at: string; date: string; id: string; billNumber: string; totalPaise: number; cancelled: boolean }
  | { type: "completed"; at: string; date: string; text: string }
  | { type: "cancelled"; at: string; date: string; text: string }
  | { type: "audit"; at: string; date: string; text: string };

export interface JobDetail extends Omit<JobListRow, "designs"> {
  notes: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  items: JobItemView[];
  timeline: TimelineEvent[];
  subBills: SubBillRow[];
  mainBill: MainBillRow | null;
}

/** A sub bill: a payment made to a job worker for OK pieces of one job. */
export interface SubBillRow {
  id: string;
  billNumber: string;
  date: string;
  client: { id: string; name: string };
  job: { id: string; jobNumber: string; productName: string };
  qty: number;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface SubBillDetail extends SubBillRow {
  notes: string | null;
  createdAt: string;
  client: Client;
  lines: { id: string; jobItemId: string; designName: string; qty: number; ratePaise: number; amountPaise: number }[];
  mainBill: { id: string; billNumber: string; cancelled: boolean } | null;
  emailedAt: string | null;
  emailedTo: string | null;
  business: Settings;
}

/** What happened when a sub bill was emailed to the job worker. */
export interface BillEmailResult {
  status: "sent" | "skipped" | "failed";
  to: string | null;
  message: string;
}

/** Returned when a sub bill is created or (re)emailed. */
export interface SubBillWithEmail extends SubBillDetail {
  email: BillEmailResult;
}

/** A main bill: the settlement of a whole job once every OK piece is paid. */
export interface MainBillRow {
  id: string;
  billNumber: string;
  date: string;
  client: { id: string; name: string };
  job: { id: string; jobNumber: string; productName: string };
  qty: number;
  totalPaise: number;
  subBillCount: number;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface MainBillDetail extends MainBillRow {
  client: Client;
  job: {
    id: string;
    jobNumber: string;
    productName: string;
    jobDate: string;
    expectedReturnDate: string | null;
    completedAt: string | null;
    notes: string | null;
  };
  product: { id: string; name: string; code: string | null; unit: string; description: string | null };
  designs: {
    jobItemId: string;
    designName: string;
    designCode: string | null;
    ratePaise: number;
    quantity: number;
    sent: number;
    ok: number;
    damaged: number;
    rejected: number;
    lost: number;
    paidQty: number;
    paidValuePaise: number;
  }[];
  subBills: SubBillRow[];
  totals: JobTotals;
  business: Settings;
}

export interface UnpaidLine {
  jobItemId: string;
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  jobStatus: JobStatus;
  productName: string;
  designName: string;
  ratePaise: number;
  ok: number;
  billedQty: number;
  unbilledQty: number;
  unbilledValuePaise: number;
}

export interface Settings {
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** data: URL (PNG or JPEG), or null when no logo is set. */
  logo: string | null;
  emailBills: boolean;
  billingPolicy: BillingPolicy;
}

export interface MoneySummary {
  /** Value of all OK pieces returned. */
  completedValuePaise: number;
  /** Σ non-voided sub bills. */
  paidPaise: number;
  /** OK pieces returned but not yet paid for. */
  toPayPaise: number;
}

export interface Dashboard {
  ops: { activeJobs: number; draftJobs: number; piecesOutside: number; overdueJobs: number; clientsWithPending: number };
  money: MoneySummary;
  overdue: JobListRow[];
  clientsPending: { clientId: string; clientName: string; jobs: number; pending: number; pendingValuePaise: number }[];
  designsPending: { designId: string; designName: string; jobs: number; pending: number }[];
  toPay: { clientId: string; clientName: string; qty: number; valuePaise: number }[];
  recentActivity: { type: string; at: string; text: string; href: string }[];
}

export interface ClientSummary {
  client: Client;
  totals: {
    jobs: number;
    activeJobs: number;
    completedJobs: number;
    sent: number;
    received: number;
    exceptions: number;
    pending: number;
  } & MoneySummary;
  jobs: JobListRow[];
  subBills: SubBillRow[];
  mainBills: MainBillRow[];
  timeline: { at: string; date: string; type: string; text: string; href: string; amountPaise?: number }[];
}

export interface SearchResults {
  clients: { id: string; name: string; sub: string | null }[];
  jobs: { id: string; jobNumber: string; clientName: string; productName: string; status: JobStatus; jobDate: string }[];
  bills: { id: string; kind: "sub" | "main"; billNumber: string; clientName: string; amountPaise: number; date: string }[];
  products: { id: string; name: string; code: string | null }[];
  designs: { id: string; name: string; code: string | null }[];
}

export interface ReturnResult {
  id: string;
  returnNumber: string;
  receivedNow: number;
  okNow: number;
  okValueNowPaise: number;
  job: JobDetail;
  justCompleted: boolean;
  billingPolicy: BillingPolicy;
}
