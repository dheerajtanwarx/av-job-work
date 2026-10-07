import type { DispatchKind, JobStatus, PaymentMethod, PaymentPolicy, Unit, UserRole } from "./models.js";

/**
 * Plain rows as every read through this package returns them: `id` instead of `_id`, Decimal128 quantities as
 * numbers, unset optional fields as null.
 */

type Edit = { editedAt: Date | null; editedById: string | null };

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  disabledAt: Date | null;
  createdAt: Date;
}

export interface Settings {
  id: number;
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  emailBills: boolean;
  defaultPaymentPolicy: PaymentPolicy;
  defaultPaymentDays: number;
  payDamagedDefault: boolean;
  payRejectedDefault: boolean;
  payLostDefault: boolean;
  updatedById: string | null;
  updatedAt: Date;
}

export interface Counter {
  id: string;
  seq: number;
}

export interface Client extends Edit {
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
  workItems: string | null;
  photoId: string | null;
  aadhaarFrontId: string | null;
  aadhaarBackId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product extends Edit {
  id: string;
  name: string;
  code: string | null;
  unit: Unit;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobWorkType extends Edit {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Design extends Edit {
  id: string;
  name: string;
  code: string | null;
  defaultRatePaise: number;
  description: string | null;
  jobWorkTypeId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Material extends Edit {
  id: string;
  code: string;
  name: string;
  productId: string | null;
  fabricType: string | null;
  color: string | null;
  designId: string | null;
  unit: Unit;
  lotNumber: string | null;
  rollNumber: string | null;
  supplier: string | null;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovement {
  id: string;
  materialId: string;
  type: "RECEIPT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
  qty: number;
  date: Date;
  reason: string | null;
  enteredById: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
}

export interface JobItem {
  id: string;
  designId: string;
  designName: string;
  materialId: string | null;
  jobWorkTypeId: string | null;
  unit: Unit;
  quantity: number;
  ratePaise: number;
  notes: string | null;
  sortOrder: number;
}

export interface Job extends Edit {
  id: string;
  jobNumber: string;
  clientId: string;
  productId: string;
  jobWorkTypeId: string | null;
  jobDate: Date;
  expectedReturnDate: Date | null;
  paymentPolicy: PaymentPolicy | null;
  paymentDays: number | null;
  status: JobStatus;
  notes: string | null;
  publicToken: string;
  createdById: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: JobItem[];
}

export interface WorkerDocument {
  id: string;
  clientId: string;
  kind: "PHOTO" | "AADHAAR_FRONT" | "AADHAAR_BACK";
  storageKey: string;
  displayKey: string;
  thumbKey: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string | null;
  createdAt: Date;
}

export interface JobItemPhoto {
  id: string;
  jobItemId: string;
  jobId: string;
  kind: "ITEM" | "DESIGN";
  storageKey: string;
  displayKey: string;
  thumbKey: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedById: string | null;
  removedAt: Date | null;
  createdAt: Date;
}

export interface DispatchLine {
  id: string;
  jobItemId: string;
  qty: number;
}

export interface Dispatch {
  id: string;
  jobId: string;
  date: Date;
  kind: DispatchKind;
  notes: string | null;
  enteredById: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  lines: DispatchLine[];
}

export interface ReturnLine {
  id: string;
  jobItemId: string;
  okQty: number;
  damagedQty: number;
  rejectedQty: number;
  lostQty: number;
  ratePaise: number;
  payDamaged: boolean;
  payRejected: boolean;
  payLost: boolean;
  payOverrideReason: string | null;
  exceptionReason: string | null;
}

export interface Return {
  id: string;
  returnNumber: string;
  jobId: string;
  date: Date;
  receivedAt: Date;
  idempotencyKey: string | null;
  notes: string | null;
  enteredById: string | null;
  editedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  editedById: string | null;
  createdAt: Date;
  lines: ReturnLine[];
}

export interface ReturnPhoto {
  id: string;
  returnId: string;
  returnLineId: string | null;
  jobId: string;
  clientId: string;
  designId: string | null;
  storageKey: string;
  displayKey: string;
  thumbKey: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  meta: unknown;
  uploadedById: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  voidedById: string | null;
  createdAt: Date;
}

export interface SubBillLine {
  id: string;
  jobItemId: string;
  designName: string;
  qty: number;
  ratePaise: number;
  amountPaise: number;
}

export interface SubBill {
  id: string;
  billNumber: string;
  clientId: string;
  jobId: string;
  returnId: string | null;
  date: Date;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  advanceReason: string | null;
  idempotencyKey: string | null;
  proofKey: string | null;
  enteredById: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  emailedAt: Date | null;
  emailedTo: string | null;
  voidedById: string | null;
  editedAt: Date | null;
  editedById: string | null;
  createdAt: Date;
  lines: SubBillLine[];
}

export interface MainBill {
  id: string;
  billNumber: string;
  jobId: string;
  clientId: string;
  date: Date;
  qty: number;
  totalPaise: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationLog {
  id: string;
  channel: string;
  kind: string;
  entity: string;
  entityId: string;
  recipient: string | null;
  status: string;
  error: string | null;
  auto: boolean;
  userId: string | null;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  userId: string | null;
  createdAt: Date;
}
