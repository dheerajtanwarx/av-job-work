import type { ItemSummary, JobTotals } from "./calc";
import type { BillingPolicy, DispatchKind, JobStatus, PaymentMethod, PaymentStatus } from "./enums";

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
  outstandingPaise: number;
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
  | { type: "invoice"; at: string; date: string; id: string; invoiceNumber: string; qty: number; amountPaise: number; cancelled: boolean }
  | { type: "payment"; at: string; date: string; id: string; invoiceNumber: string; amountPaise: number; method: PaymentMethod; voided: boolean }
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
  invoices: { id: string; invoiceNumber: string; date: string; totalPaise: number; paidPaise: number; status: PaymentStatus }[];
}

export interface InvoiceListRow {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  client: { id: string; name: string };
  qty: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  status: PaymentStatus;
  jobNumbers: string[];
}

export interface PaymentRow {
  id: string;
  date: string;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  invoice: { id: string; invoiceNumber: string };
  client: { id: string; name: string };
}

export interface InvoiceDetail extends InvoiceListRow {
  taxPercent: number;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  client: Client;
  lines: { id: string; jobItemId: string; jobId: string; jobNumber: string; designName: string; productName: string; qty: number; ratePaise: number; amountPaise: number }[];
  payments: PaymentRow[];
  business: Settings;
}

export interface UnbilledLine {
  jobItemId: string;
  jobId: string;
  jobNumber: string;
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
  gstin: string | null;
  billingPolicy: BillingPolicy;
  defaultTaxPercent: number;
  invoiceFooter: string | null;
}

export interface MoneySummary {
  completedValuePaise: number;
  billedPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  unbilledPaise: number;
}

export interface Dashboard {
  ops: { activeJobs: number; draftJobs: number; piecesOutside: number; overdueJobs: number; clientsWithPending: number };
  money: MoneySummary;
  overdue: JobListRow[];
  clientsPending: { clientId: string; clientName: string; jobs: number; pending: number; pendingValuePaise: number }[];
  designsPending: { designId: string; designName: string; jobs: number; pending: number }[];
  readyToBill: { clientId: string; clientName: string; qty: number; valuePaise: number }[];
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
  invoices: InvoiceListRow[];
  payments: PaymentRow[];
  timeline: { at: string; date: string; type: string; text: string; href: string; amountPaise?: number }[];
}

export interface SearchResults {
  clients: { id: string; name: string; sub: string | null }[];
  jobs: { id: string; jobNumber: string; clientName: string; productName: string; status: JobStatus; jobDate: string }[];
  invoices: { id: string; invoiceNumber: string; clientName: string; totalPaise: number; date: string }[];
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
