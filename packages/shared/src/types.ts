import type { ItemSummary, JobTotals, MoneyPosition, PaymentTerms, ReturnPayment, WorkerMetrics } from "./calc";
import type { AgingBucket, DispatchKind, JobStatus, PaymentMethod, PaymentPolicy, PayStatus, StockMovementType, Unit, UserRole } from "./enums";

/** API response shapes shared by the web app. Dates are ISO strings. */

/** A job worker. */
export interface Client {
  id: string;
  workerCode: string;
  name: string;
  businessName: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  notes: string | null;
  paymentPolicy: PaymentPolicy | null;
  paymentDays: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface ClientListRow extends Client {
  activeJobs: number;
  pendingPieces: number;
  /** Job work value not yet paid (net of advances). */
  toPayPaise: number;
}

export interface Product {
  id: string;
  name: string;
  code: string | null;
  unit: Unit;
  description: string | null;
  isActive: boolean;
  jobCount?: number;
}

export interface JobWorkType {
  id: string;
  name: string;
  code: string | null;
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
  jobWorkTypeId: string | null;
  jobWorkType?: { id: string; name: string } | null;
  isActive: boolean;
  jobCount?: number;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  productId: string | null;
  product?: { id: string; name: string } | null;
  fabricType: string | null;
  color: string | null;
  designId: string | null;
  design?: { id: string; name: string } | null;
  unit: Unit;
  lotNumber: string | null;
  rollNumber: string | null;
  supplier: string | null;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface StockPosition {
  available: number;
  damagedHeld: number;
  withWorkers: number;
  lost: number;
}

export interface MaterialRow extends Material {
  stock: StockPosition;
  /** Estimated value of the quantity outside, at challan rates. */
  outsideValuePaise: number;
  workers: number;
}

export interface MaterialMovementRow {
  id: string;
  type: StockMovementType | DispatchKind | "RETURN" | "DAMAGED" | "REJECTED" | "LOST";
  date: string;
  at: string;
  qty: number;
  /** +qty into the warehouse, −qty out of it (0 when the movement doesn't touch good warehouse stock). */
  warehouseEffect: number;
  unit: Unit;
  materialId: string;
  materialName: string;
  job: { id: string; jobNumber: string } | null;
  client: { id: string; name: string } | null;
  designName: string | null;
  ref: string | null;
  /** Set on return movements, for linking to /returns/:id. */
  returnId: string | null;
  notes: string | null;
  enteredBy: string | null;
  voided: boolean;
}

export interface JobItemView extends ItemSummary {
  id: string;
  designId: string;
  designName: string;
  designCode?: string | null;
  unit: Unit;
  material: { id: string; code: string; name: string } | null;
  jobWorkType: { id: string; name: string } | null;
  notes: string | null;
  sortOrder: number;
}

export interface JobListRow {
  id: string;
  jobNumber: string;
  jobDate: string;
  expectedReturnDate: string | null;
  status: JobStatus;
  overdue: boolean;
  /** Days since the challan date while material is still out (0 once nothing is pending). */
  daysOut: number;
  aging: AgingBucket | null;
  client: { id: string; name: string };
  product: { id: string; name: string; unit: Unit };
  jobWorkType: { id: string; name: string } | null;
  unit: Unit;
  designs: string[];
  totals: JobTotals;
  money: MoneyPosition;
  payStatus: PayStatus;
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
      enteredBy: string | null;
      voided: { at: string; reason: string | null } | null;
    }
  | {
      type: "return";
      at: string;
      date: string;
      id: string;
      returnNumber: string;
      receivedAt: string;
      total: number;
      okTotal: number;
      exceptionTotal: number;
      valuePaise: number;
      lines: { designName: string; okQty: number; damagedQty: number; rejectedQty: number; lostQty: number; ratePaise: number; valuePaise: number; exceptionReason: string | null }[];
      notes: string | null;
      photoCount: number;
      payment: ReturnPayment | null;
      enteredBy: string | null;
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
      returnNumber: string | null;
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
  publicToken: string;
  paymentPolicy: PaymentPolicy | null;
  paymentDays: number | null;
  /** The terms that apply (challan override → worker → business default). */
  terms: PaymentTerms;
  items: JobItemView[];
  returns: ReturnRow[];
  timeline: TimelineEvent[];
  subBills: SubBillRow[];
  mainBill: MainBillRow | null;
}

/** One job work return in a list. Voided returns have payment = null. */
export interface ReturnRow {
  id: string;
  returnNumber: string;
  date: string;
  receivedAt: string;
  job: { id: string; jobNumber: string };
  client: { id: string; name: string };
  productName: string;
  unit: Unit;
  designs: string[];
  okQty: number;
  damagedQty: number;
  rejectedQty: number;
  lostQty: number;
  total: number;
  /** Rate shown on lists: the single rate when all lines share one, otherwise null (mixed). */
  ratePaise: number | null;
  valuePaise: number;
  payment: ReturnPayment | null;
  photoCount: number;
  coverPhotoId: string | null;
  enteredBy: string | null;
  editedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ReturnLineView {
  id: string;
  jobItemId: string;
  designId: string;
  designName: string;
  unit: Unit;
  okQty: number;
  damagedQty: number;
  rejectedQty: number;
  lostQty: number;
  ratePaise: number;
  challanRatePaise: number;
  payDamaged: boolean;
  payRejected: boolean;
  payLost: boolean;
  payOverrideReason: string | null;
  payableQty: number;
  valuePaise: number;
  exceptionReason: string | null;
  /** Pending on this design line before this return (for edit validation). */
  pendingBefore: number;
}

export interface PhotoView {
  id: string;
  returnId: string;
  returnNumber: string;
  returnLineId: string | null;
  job: { id: string; jobNumber: string };
  client: { id: string; name: string };
  design: { id: string; name: string } | null;
  productName: string;
  jobWorkType: string | null;
  unit: Unit;
  /** Live values from the return line (or whole return when not linked to a line). */
  qty: number;
  ratePaise: number | null;
  valuePaise: number;
  receivedDate: string;
  receivedAt: string;
  uploadedAt: string;
  uploadedBy: string | null;
  enteredBy: string | null;
  originalName: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  returnVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface ReturnDetail extends ReturnRow {
  notes: string | null;
  createdAt: string;
  lines: ReturnLineView[];
  photos: PhotoView[];
  vouchers: SubBillRow[];
  history: { at: string; action: string; summary: string | null; reason: string | null; user: string | null }[];
  business: Settings;
}

export interface LedgerRow {
  date: string;
  at: string;
  type: "work" | "payment" | "void";
  ref: string;
  href: string;
  job: { id: string; jobNumber: string } | null;
  particular: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
}

export interface Ledger {
  openingPaise: number;
  rows: LedgerRow[];
  totals: { debitPaise: number; creditPaise: number; closingPaise: number };
}

export interface WorkerMaterialRow {
  materialId: string | null;
  materialName: string;
  unit: Unit;
  issued: number;
  returned: number;
  damaged: number;
  rejected: number;
  lost: number;
  pending: number;
  challans: number;
  oldestIssueDate: string | null;
  daysOutside: number;
  valuePaise: number;
}

export interface WorkerPerformance extends WorkerMetrics {
  totalWorkPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
}

/** A sub bill: a payment made to a job worker for OK pieces of one job. */
export interface SubBillRow {
  id: string;
  billNumber: string;
  date: string;
  client: { id: string; name: string };
  job: { id: string; jobNumber: string; productName: string };
  returnId: string | null;
  returnNumber: string | null;
  qty: number;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  enteredBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface SubBillDetail extends SubBillRow {
  notes: string | null;
  createdAt: string;
  client: Client;
  lines: { id: string; jobItemId: string; designName: string; qty: number; ratePaise: number; amountPaise: number }[];
  mainBill: { id: string; billNumber: string; cancelled: boolean } | null;
  advanceReason: string | null;
  /** Challan money right now (after this voucher, if it is active). */
  challanMoney: MoneyPosition;
  emailedAt: string | null;
  emailedTo: string | null;
  notifications: NotificationRow[];
  business: Settings;
}

export interface NotificationRow {
  id: string;
  channel: string;
  kind: string;
  recipient: string | null;
  /** "pending" while an automatic send is in flight (or if it crashed mid-send). */
  status: "sent" | "skipped" | "failed" | "pending";
  error: string | null;
  auto: boolean;
  createdAt: string;
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
  product: { id: string; name: string; code: string | null; unit: Unit; description: string | null };
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
  defaultPaymentPolicy: PaymentPolicy;
  defaultPaymentDays: number;
  payDamagedDefault: boolean;
  payRejectedDefault: boolean;
  payLostDefault: boolean;
  /** @deprecated alias of defaultPaymentPolicy */
  billingPolicy: PaymentPolicy;
}

export interface MoneySummary {
  /** Job work value of everything returned (return rates). */
  completedValuePaise: number;
  /** Σ non-voided payment vouchers. */
  paidPaise: number;
  /** Still payable (per worker, net of advances). */
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
  receivedAt: string;
  /** The saved lines (to tag photos to a design line). */
  lines: { id: string; jobItemId: string }[];
  /** True when this was a retried submit and the existing return is returned. */
  duplicate: boolean;
  receivedNow: number;
  okNow: number;
  okValueNowPaise: number;
  job: JobDetail;
  justCompleted: boolean;
  terms: PaymentTerms;
  /** @deprecated alias of terms.policy */
  billingPolicy: PaymentPolicy;
  payment: ReturnPayment | null;
  voucher: SubBillWithEmail | null;
  warnings: string[];
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}
