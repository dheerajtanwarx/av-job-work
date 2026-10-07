/** API types for the dashboard, analytics, reports and search work stream. */
import type { HoldingStatus } from "./calc-reports";
import type { AgingBucket, Unit } from "./enums";
import type { Dashboard, PhotoView, SearchResults } from "./types";

export * from "./calc-reports";

// ───────────────────────── Dashboard ─────────────────────────

export interface QtyByUnit {
  unit: Unit;
  qty: number;
}

export interface DashboardKpis {
  /** Workers with an active challan or material outside. */
  activeWorkers: number;
  /** Challans issued and not yet complete (In progress + Partially received). */
  activeChallans: number;
  /** Quantity with workers, per unit (MTR and PCS are never added together). */
  materialOutside: QtyByUnit[];
  /** Pending quantity × challan rate. */
  materialValueOutsidePaise: number;
  /** Job work value earned (in the date range when one is given, otherwise all time). */
  workValuePaise: number;
  /** Paid by vouchers (in the date range when one is given, otherwise all time). */
  paidPaise: number;
  /** Still payable to workers right now (per challan, advances not netted). */
  outstandingPaise: number;
  /** Paid beyond the work value, right now. */
  advancePaise: number;
  overduePayments: { amountPaise: number; count: number };
  overdueChallans: number;
}

export type AttentionKind =
  | "overdue-challans"
  | "overdue-payments"
  | "long-held-material"
  | "payments-due-today"
  | "expected-today"
  | "quantity-mismatch"
  | "advances";

export interface AttentionRecord {
  label: string;
  sub?: string;
  href: string;
  amountPaise?: number;
}

export interface AttentionItem {
  kind: AttentionKind;
  label: string;
  /** Short explanation of the rule behind the item. */
  hint: string;
  count: number;
  amountPaise?: number;
  tone: "danger" | "attention" | "warning";
  /** The record itself when there is one, otherwise a filtered list or report. */
  href: string;
  /** Up to five of the records behind the count. */
  records: AttentionRecord[];
}

/** "Who has my material?" — one row per worker × material (lines without a material grouped by unit). */
export interface MaterialHolderRow {
  clientId: string;
  clientName: string;
  materialId: string | null;
  materialName: string;
  unit: Unit;
  qty: number;
  challans: number;
  overdueChallans: number;
  oldestIssueDate: string | null;
  daysOutside: number;
  valuePaise: number;
  status: HoldingStatus;
}

/** One design line of one return (today's returns / arrivals). */
export interface ArrivalRow {
  returnLineId: string;
  returnId: string;
  returnNumber: string;
  date: string;
  receivedAt: string;
  client: { id: string; name: string };
  job: { id: string; jobNumber: string };
  designId: string;
  designName: string;
  unit: Unit;
  okQty: number;
  /** good + damaged + rejected + lost */
  qty: number;
  payableQty: number;
  ratePaise: number;
  valuePaise: number;
  photoId: string | null;
  photoCount: number;
}

export interface DashboardV2 extends Dashboard {
  today: string;
  range: { from: string | null; to: string | null };
  kpis: DashboardKpis;
  attention: AttentionItem[];
  materialHolders: MaterialHolderRow[];
  todayReturns: ArrivalRow[];
  recentPhotos: PhotoView[];
}

// ───────────────────────── Charts ─────────────────────────

export interface DashboardCharts {
  range: { from: string; to: string };
  /** Issued and returned in the range, pending right now — per unit. */
  materialFlow: { unit: Unit; issued: number; returned: number; exceptions: number; pending: number }[];
  monthlyWork: { month: string; valuePaise: number }[];
  monthlyPayments: { month: string; paidPaise: number }[];
  workerOutstanding: { clientId: string; clientName: string; outstandingPaise: number }[];
  workerPending: { clientId: string; clientName: string; unit: Unit; pending: number }[];
  challanAging: { bucket: AgingBucket; challans: number; pending: QtyByUnit[]; valuePaise: number }[];
  completionDays: { clientId: string; clientName: string; avgDays: number; challans: number }[];
  defects: { clientId: string; clientName: string; defectPct: number; rejectionPct: number; accounted: number }[];
  byDesign: { designId: string | null; designName: string; valuePaise: number }[];
  byJobWorkType: { jobWorkTypeId: string | null; name: string; valuePaise: number }[];
}

// ───────────────────────── Reports ─────────────────────────

export type ReportColType = "text" | "qty" | "money" | "rate" | "int" | "pct" | "days" | "date" | "datetime" | "status";

export interface ReportColumn {
  key: string;
  header: string;
  type: ReportColType;
  /** How the totals row treats this column. */
  total?: "sum" | "avg";
  /** row.links[link] makes the cell a link. */
  link?: string;
  /** Hidden in the mobile card view. */
  minor?: boolean;
}

export type ReportCell = string | number | boolean | null;
export type ReportRow = Record<string, ReportCell | Record<string, string> | undefined> & { links?: Record<string, string>; unit?: string };

export type ReportFilterKey = "range" | "date" | "clientId" | "designId" | "productId" | "jobWorkTypeId" | "materialId" | "jobId" | "status";

export interface ReportSummaryItem {
  label: string;
  value: number;
  type: ReportColType;
  tone?: "danger" | "warning" | "success" | "attention";
  sub?: string;
}

export interface ReportResult {
  id: string;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Rows in the full filtered set (rows holds one page of it). */
  total: number;
  skip: number;
  take: number;
  /** Totals over the full filtered set. Quantity totals are null when rows mix units. */
  totals: Record<string, number | null>;
  totalsByUnit: { unit: string; values: Record<string, number> }[];
  summary: ReportSummaryItem[];
  /** e.g. "Opening balance ₹1,200" for ledgers. */
  note?: string;
}

export type ReportGroup = "Material" | "Money" | "Work" | "Ledgers" | "Photos";

export interface ReportMeta {
  id: string;
  title: string;
  description: string;
  group: ReportGroup;
  filters: ReportFilterKey[];
  /** Required filter (ledgers need a worker or a challan). */
  requires?: "clientId" | "jobId";
  statusOptions?: { value: string; label: string }[];
  /** Pre-existing reports keep their own JSON shape and page. */
  legacy?: boolean;
}

const OPEN_STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "PARTIALLY_RECEIVED", label: "Partially received" },
  { value: "COMPLETED", label: "Completed" },
];

/** Every report, in picker order. Route: GET /reports/<id> (?format=csv|xlsx to export). */
export const REPORTS: ReportMeta[] = [
  { id: "pending-material", title: "Pending material", description: "Every challan with material outside, design by design.", group: "Material", filters: ["clientId", "designId"], legacy: true },
  { id: "material-outside", title: "Material outside", description: "Who holds which material, how long and what it is worth.", group: "Material", filters: ["clientId", "productId", "materialId"] },
  { id: "worker-material", title: "Worker material position", description: "Issued, returned, damaged, rejected, lost and pending per worker and material.", group: "Material", filters: ["range", "clientId", "productId", "materialId"] },
  { id: "material-stock", title: "Material stock", description: "Warehouse stock, damaged held and quantity with workers per material.", group: "Material", filters: ["productId", "materialId"] },
  { id: "challan-aging", title: "Challan aging", description: "Open challans with material outside, by days since issue.", group: "Material", filters: ["clientId", "designId", "productId", "jobWorkTypeId", "status"], statusOptions: OPEN_STATUS_OPTIONS.slice(0, 4) },
  { id: "client-summary", title: "Worker summary", description: "Challans, quantities and money per job worker.", group: "Money", filters: [], legacy: true },
  { id: "payment-outstanding", title: "Payment outstanding", description: "Work value, paid, outstanding and advances per challan.", group: "Money", filters: ["clientId", "productId", "jobWorkTypeId", "status"], statusOptions: OPEN_STATUS_OPTIONS },
  { id: "payment-aging", title: "Payment aging", description: "Unpaid returns by due date: not due, due today and days overdue.", group: "Money", filters: ["clientId", "productId", "jobWorkTypeId"] },
  { id: "payments", title: "Payments", description: "Every payment voucher in the period.", group: "Money", filters: ["range", "clientId"], legacy: true },
  { id: "to-pay", title: "To pay (pieces)", description: "Good pieces not yet covered by quantity-based vouchers.", group: "Money", filters: ["clientId"], legacy: true },
  { id: "rate-history", title: "Rate history", description: "Every return line with the rate it was received at.", group: "Money", filters: ["range", "clientId", "designId", "productId", "jobWorkTypeId"] },
  { id: "arrivals", title: "Today's returns", description: "Material received on a day, latest first.", group: "Work", filters: ["date", "clientId", "designId", "productId", "jobWorkTypeId"] },
  { id: "job-work-by-design", title: "Job work by design", description: "Issued, returned, pending and value per design (challans dated in the range).", group: "Work", filters: ["range", "clientId", "productId", "jobWorkTypeId"] },
  { id: "job-work-by-worker", title: "Job work by worker", description: "Issued, returned, pending and value per worker (challans dated in the range).", group: "Work", filters: ["range", "designId", "productId", "jobWorkTypeId"] },
  { id: "completion-time", title: "Completion time", description: "Days from challan to first and final return.", group: "Work", filters: ["range", "clientId", "productId", "jobWorkTypeId", "status"], statusOptions: OPEN_STATUS_OPTIONS.slice(2) },
  { id: "defect-rejection", title: "Defect & rejection", description: "Damaged, rejected and lost as a share of everything returned.", group: "Work", filters: ["range", "clientId", "designId", "productId", "jobWorkTypeId"] },
  { id: "design-photos", title: "Design photos", description: "Return photos with worker, design, quantity and rate.", group: "Photos", filters: ["range", "clientId", "designId", "productId", "jobWorkTypeId"] },
  { id: "worker-ledger", title: "Worker ledger", description: "Running account of work received and payments for one worker.", group: "Ledgers", filters: ["range", "clientId"], requires: "clientId" },
  { id: "challan-ledger", title: "Challan ledger", description: "Running account of one challan.", group: "Ledgers", filters: ["jobId"], requires: "jobId" },
];

// ───────────────────────── Search ─────────────────────────

export interface SearchResultsV2 extends SearchResults {
  returns: { id: string; returnNumber: string; clientName: string; jobNumber: string; date: string; receivedAt: string; valuePaise: number; voided: boolean }[];
  materials: { id: string; name: string; code: string; unit: Unit; lotNumber: string | null; rollNumber: string | null }[];
  /** Set when the query was read as an amount (paise) or a date (YYYY-MM-DD). */
  matchedAmountPaise: number | null;
  matchedDate: string | null;
}
