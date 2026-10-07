import mongoose, { Schema, Types, type Model } from "mongoose";
import { Collection } from "./collection.js";
import type * as R from "./rows.js";

// Money is always stored as integer paise (₹1 = 100 paise).
// Quantities are Decimal128 (exact, like the old Decimal(14,3)); reads through this package return them as numbers.
// Business dates (jobDate, return date, …) are stored as UTC midnight.
// User-facing names: Client = Job Worker, Job = Job Work Challan, SubBill = Payment Voucher, MainBill = Final Settlement.
// Lines (challan items, dispatch / return / voucher lines) are embedded in their parent document.

export const PAYMENT_POLICIES = ["IMMEDIATE", "AFTER_EACH_RETURN", "DAYS_AFTER_RETURN", "AFTER_COMPLETION", "MANUAL"] as const;
export const JOB_STATUSES = ["DRAFT", "IN_PROGRESS", "PARTIALLY_RECEIVED", "COMPLETED", "CANCELLED"] as const;
export const DISPATCH_KINDS = ["INITIAL", "ADDITIONAL", "REWORK"] as const;
export const PAYMENT_METHODS = ["CASH", "UPI", "BANK", "NEFT", "RTGS", "CHEQUE", "OTHER"] as const;
export const UNITS = ["PCS", "MTR", "KG", "ROLL", "DOZEN", "SET"] as const;
/** OWNER: everything, including users, settings and changing or voiding payments. SUB_OWNER: all daily work. */
export const USER_ROLES = ["OWNER", "SUB_OWNER"] as const;
/** Warehouse-only stock events. Issues/returns to workers are derived from dispatch and return lines. */
export const STOCK_MOVEMENT_TYPES = ["RECEIPT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"] as const;
export const WORKER_DOCUMENT_KINDS = ["PHOTO", "AADHAAR_FRONT", "AADHAAR_BACK"] as const;
export const JOB_ITEM_PHOTO_KINDS = ["ITEM", "DESIGN"] as const;

export type PaymentPolicy = (typeof PAYMENT_POLICIES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type DispatchKind = (typeof DISPATCH_KINDS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type Unit = (typeof UNITS)[number];
export type UserRole = (typeof USER_ROLES)[number];

/** New document / line id: an ObjectId as a 24-char hex string. */
export const newId = () => new Types.ObjectId().toHexString();

const id = { type: String, default: newId };
const str = { type: String, default: null };
const date = { type: Date, default: null };
const int = { type: Number, default: null };
const qty = { type: Schema.Types.Decimal128, required: true };
const qty0 = { type: Schema.Types.Decimal128, default: 0 };
const now = { type: Date, default: () => new Date() };
const flag = (d: boolean) => ({ type: Boolean, default: d });
const oneOf = <T extends readonly string[]>(values: T, def?: T[number] | null) =>
  def === undefined ? { type: String, enum: values, required: true } : { type: String, enum: [...values, null], default: def };

const opts = { versionKey: false, id: false } as const;
const withUpdatedAt = { ...opts, timestamps: { createdAt: true, updatedAt: true } } as const;
const createdOnly = { ...opts, timestamps: { createdAt: true, updatedAt: false } } as const;
const editMarks = { editedAt: date, editedById: str };

// ───────── Users & settings ─────────

const userSchema = new Schema(
  {
    _id: id,
    email: { type: String, required: true },
    name: { type: String, required: true },
    role: oneOf(USER_ROLES, "SUB_OWNER"),
    passwordHash: { type: String, required: true },
    disabledAt: date, // can no longer log in; kept so history still shows their name
  },
  createdOnly,
);
userSchema.index({ email: 1 }, { unique: true });

const settingsSchema = new Schema(
  {
    _id: { type: Number, default: 1 },
    businessName: { type: String, default: "My Business" },
    address: str,
    phone: str,
    email: str,
    logo: str, // data:image/png|jpeg;base64,… – printed on bills and embedded in bill emails
    emailBills: flag(true), // email each new payment voucher to the job worker
    defaultPaymentPolicy: oneOf(PAYMENT_POLICIES, "MANUAL"),
    defaultPaymentDays: { type: Number, default: 0 },
    payDamagedDefault: flag(false),
    payRejectedDefault: flag(false),
    payLostDefault: flag(false),
    updatedById: str,
  },
  { ...opts, timestamps: { createdAt: false, updatedAt: true } },
);

/** Document-number sequences: `seq` is the last number handed out. */
const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number } }, opts);

// ───────── Masters ─────────

/** A job worker. */
const clientSchema = new Schema(
  {
    _id: id,
    workerCode: { type: String, required: true },
    name: { type: String, required: true },
    businessName: str,
    phone: str,
    alternatePhone: str,
    email: str,
    address: str,
    gstin: str,
    pan: str,
    notes: str,
    paymentPolicy: oneOf(PAYMENT_POLICIES, null), // null = Settings default
    paymentDays: int,
    workItems: str, // the kind of work this worker does, e.g. "hand work, jardoji"
    /** Current WorkerDocument ids (older uploads stay in workerDocuments for history). */
    photoId: str,
    aadhaarFrontId: str,
    aadhaarBackId: str,
    isActive: flag(true),
    ...editMarks, // last change by a person (not automatic status updates)
  },
  withUpdatedAt,
);
clientSchema.index({ workerCode: 1 }, { unique: true });
clientSchema.index({ name: 1 });
clientSchema.index({ phone: 1 });

const productSchema = new Schema(
  { _id: id, name: { type: String, required: true }, code: str, unit: oneOf(UNITS, "PCS"), description: str, isActive: flag(true), ...editMarks },
  withUpdatedAt,
);
productSchema.index({ name: 1 });

const jobWorkTypeSchema = new Schema(
  { _id: id, name: { type: String, required: true }, code: str, description: str, isActive: flag(true), ...editMarks },
  withUpdatedAt,
);
jobWorkTypeSchema.index({ name: 1 });

const designSchema = new Schema(
  {
    _id: id,
    name: { type: String, required: true },
    code: str,
    defaultRatePaise: { type: Number, default: 0 }, // a starting value only – never changes historical rates
    description: str,
    jobWorkTypeId: str,
    isActive: flag(true),
    ...editMarks,
  },
  withUpdatedAt,
);
designSchema.index({ name: 1 });
designSchema.index({ jobWorkTypeId: 1 });

/** Raw material / stock item (a fabric lot, a roll, a batch of blouses…). */
const materialSchema = new Schema(
  {
    _id: id,
    code: { type: String, required: true },
    name: { type: String, required: true },
    productId: str,
    fabricType: str,
    color: str,
    designId: str,
    unit: oneOf(UNITS, "PCS"),
    lotNumber: str,
    rollNumber: str,
    supplier: str,
    location: str,
    notes: str,
    isActive: flag(true),
    ...editMarks,
  },
  withUpdatedAt,
);
materialSchema.index({ code: 1 }, { unique: true });
materialSchema.index({ name: 1 });
materialSchema.index({ lotNumber: 1 });
materialSchema.index({ rollNumber: 1 });

const stockMovementSchema = new Schema(
  {
    _id: id,
    materialId: { type: String, required: true },
    type: oneOf(STOCK_MOVEMENT_TYPES),
    qty,
    date: { type: Date, required: true },
    reason: str,
    enteredById: str,
    voidedAt: date,
    voidReason: str,
  },
  createdOnly,
);
stockMovementSchema.index({ materialId: 1, voidedAt: 1, date: -1 });

// ───────── Challans ─────────

/** One design line on a challan (embedded in the job). */
const jobItemSchema = new Schema(
  {
    _id: id,
    designId: { type: String, required: true },
    designName: { type: String, required: true }, // snapshot at challan creation
    materialId: str, // required for new challans
    jobWorkTypeId: str,
    unit: oneOf(UNITS, "PCS"),
    quantity: qty,
    ratePaise: { type: Number, required: true }, // challan rate snapshot; never follows the design's default rate
    notes: str,
    sortOrder: { type: Number, default: 0 },
  },
  opts,
);

// Declared before the job schema copies this schema in.
rel(jobItemSchema, "design", "Design", "designId");
rel(jobItemSchema, "material", "Material", "materialId");
rel(jobItemSchema, "jobWorkType", "JobWorkType", "jobWorkTypeId");
rel(jobItemSchema, "photos", "JobItemPhoto", "_id", "jobItemId", false);

/** A job work challan. */
const jobSchema = new Schema(
  {
    _id: id,
    jobNumber: { type: String, required: true },
    clientId: { type: String, required: true },
    productId: { type: String, required: true },
    jobWorkTypeId: str,
    jobDate: { type: Date, required: true },
    expectedReturnDate: date,
    paymentPolicy: oneOf(PAYMENT_POLICIES, null), // null = the worker's terms
    paymentDays: int,
    status: oneOf(JOB_STATUSES, "DRAFT"),
    notes: str,
    publicToken: { type: String, required: true },
    createdById: str,
    completedAt: date,
    cancelledAt: date,
    cancelReason: str,
    ...editMarks,
    items: { type: [jobItemSchema], default: [] },
  },
  withUpdatedAt,
);
jobSchema.index({ jobNumber: 1 }, { unique: true });
jobSchema.index({ publicToken: 1 }, { unique: true });
jobSchema.index({ clientId: 1, jobDate: -1 });
jobSchema.index({ status: 1 });
jobSchema.index({ jobDate: -1, createdAt: -1 });
jobSchema.index({ "items._id": 1 });
jobSchema.index({ "items.designId": 1 });
jobSchema.index({ "items.materialId": 1 });

/** A worker's profile photo or ID document image. Aadhaar images are visible to the owner and managers only. */
const workerDocumentSchema = new Schema(
  {
    _id: id,
    clientId: { type: String, required: true },
    kind: oneOf(WORKER_DOCUMENT_KINDS),
    storageKey: { type: String, required: true },
    displayKey: { type: String, required: true },
    thumbKey: { type: String, required: true },
    originalName: str,
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedById: str,
  },
  createdOnly,
);
workerDocumentSchema.index({ clientId: 1 });

/** Reference photos attached to a challan line when it is created: what is being sent and what to make. */
const jobItemPhotoSchema = new Schema(
  {
    _id: id,
    jobItemId: { type: String, required: true },
    jobId: { type: String, required: true },
    kind: oneOf(JOB_ITEM_PHOTO_KINDS),
    storageKey: { type: String, required: true }, // original, never modified
    displayKey: { type: String, required: true },
    thumbKey: { type: String, required: true },
    originalName: str,
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    width: int,
    height: int,
    uploadedById: str,
    removedAt: date,
  },
  createdOnly,
);
jobItemPhotoSchema.index({ jobItemId: 1 });
jobItemPhotoSchema.index({ jobId: 1, removedAt: 1 });

const dispatchLineSchema = new Schema({ _id: id, jobItemId: { type: String, required: true }, qty }, opts);

const dispatchSchema = new Schema(
  {
    _id: id,
    jobId: { type: String, required: true },
    date: { type: Date, required: true },
    kind: oneOf(DISPATCH_KINDS, "INITIAL"),
    notes: str,
    enteredById: str,
    voidedAt: date,
    voidReason: str,
    lines: { type: [dispatchLineSchema], default: [] },
  },
  createdOnly,
);
dispatchSchema.index({ jobId: 1, voidedAt: 1, createdAt: 1 });
dispatchSchema.index({ "lines.jobItemId": 1 });
dispatchSchema.index({ date: -1 });

const returnLineSchema = new Schema(
  {
    _id: id,
    jobItemId: { type: String, required: true },
    okQty: qty0,
    damagedQty: qty0,
    rejectedQty: qty0,
    lostQty: qty0,
    ratePaise: { type: Number, required: true }, // the rate for this returned work – historical, never follows challan/design changes
    payDamaged: flag(false),
    payRejected: flag(false),
    payLost: flag(false),
    payOverrideReason: str,
    exceptionReason: str,
  },
  opts,
);

/** A job work return. `date` is the business date (editable for back entry); `receivedAt` is the exact server time it was recorded. */
const returnSchema = new Schema(
  {
    _id: id,
    returnNumber: { type: String, required: true },
    jobId: { type: String, required: true },
    date: { type: Date, required: true },
    receivedAt: now,
    idempotencyKey: str, // one per Record Return form – a retried submit returns the same return
    notes: str,
    enteredById: str,
    editedAt: date,
    voidedAt: date,
    voidReason: str,
    editedById: str,
    lines: { type: [returnLineSchema], default: [] },
  },
  createdOnly,
);
returnSchema.index({ returnNumber: 1 }, { unique: true });
returnSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
returnSchema.index({ jobId: 1, voidedAt: 1, date: 1, receivedAt: 1 });
returnSchema.index({ date: -1, receivedAt: -1 });
returnSchema.index({ receivedAt: -1 });
returnSchema.index({ "lines.jobItemId": 1 });

/** A design / job work photo attached to a specific return. Files live in storage; only keys are stored here. */
const returnPhotoSchema = new Schema(
  {
    _id: id,
    returnId: { type: String, required: true },
    returnLineId: str,
    jobId: { type: String, required: true },
    clientId: { type: String, required: true },
    designId: str,
    storageKey: { type: String, required: true }, // original, never modified
    displayKey: { type: String, required: true }, // compressed copy for viewing
    thumbKey: { type: String, required: true },
    originalName: str,
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    width: int,
    height: int,
    meta: { type: Schema.Types.Mixed, default: null }, // snapshot of qty/rate/time at upload (audit only; views read live values)
    uploadedById: str,
    voidedAt: date,
    voidReason: str,
    voidedById: str,
  },
  createdOnly,
);
returnPhotoSchema.index({ returnId: 1, voidedAt: 1, createdAt: 1 });
returnPhotoSchema.index({ jobId: 1 });
returnPhotoSchema.index({ clientId: 1, createdAt: -1 });
returnPhotoSchema.index({ designId: 1 });
returnPhotoSchema.index({ createdAt: -1, _id: -1 });

// ───────── Payments ─────────

/** Design-wise breakdown of a qty-based (legacy) payment voucher. */
const subBillLineSchema = new Schema(
  { _id: id, jobItemId: { type: String, required: true }, designName: { type: String, required: true }, qty, ratePaise: { type: Number, required: true }, amountPaise: { type: Number, required: true } },
  opts,
);

/** A payment voucher: money paid to the job worker against one challan (optionally one return). */
const subBillSchema = new Schema(
  {
    _id: id,
    billNumber: { type: String, required: true },
    clientId: { type: String, required: true },
    jobId: { type: String, required: true },
    returnId: str,
    date: { type: Date, required: true },
    amountPaise: { type: Number, required: true },
    method: oneOf(PAYMENT_METHODS, "CASH"),
    reference: str,
    notes: str,
    advanceReason: str, // set when the payment exceeded what was outstanding
    idempotencyKey: str,
    proofKey: str,
    enteredById: str,
    voidedAt: date,
    voidReason: str,
    emailedAt: date, // last successful email to the job worker
    emailedTo: str,
    voidedById: str,
    editedAt: date, // last change by the owner
    editedById: str,
    lines: { type: [subBillLineSchema], default: [] },
  },
  createdOnly,
);
subBillSchema.index({ billNumber: 1 }, { unique: true });
subBillSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
subBillSchema.index({ clientId: 1, voidedAt: 1 });
subBillSchema.index({ jobId: 1, voidedAt: 1, date: 1 });
subBillSchema.index({ returnId: 1 });
subBillSchema.index({ date: -1, createdAt: -1 });

// The final settlement of a challan: created automatically once the challan is completed and fully paid.
// Its content is built live from the challan and its vouchers; the document holds the number, date and status.
const mainBillSchema = new Schema(
  {
    _id: id,
    billNumber: { type: String, required: true },
    jobId: { type: String, required: true },
    clientId: { type: String, required: true },
    date: { type: Date, required: true },
    qty,
    totalPaise: { type: Number, required: true },
    cancelledAt: date,
    cancelReason: str,
  },
  withUpdatedAt,
);
mainBillSchema.index({ billNumber: 1 }, { unique: true });
mainBillSchema.index({ jobId: 1 }, { unique: true });
mainBillSchema.index({ clientId: 1 });
mainBillSchema.index({ date: -1, createdAt: -1 });

// ───────── Logs ─────────

/** Every notification attempt (email today; WhatsApp/SMS/in-app later). */
const notificationLogSchema = new Schema(
  {
    _id: id,
    channel: { type: String, required: true }, // email | whatsapp | sms | in_app
    kind: { type: String, required: true }, // e.g. payment_voucher
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    recipient: str,
    status: { type: String, required: true }, // pending | sent | skipped | failed
    error: str,
    auto: flag(false),
    userId: str,
  },
  createdOnly,
);
notificationLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
notificationLogSchema.index({ createdAt: -1, _id: -1 });
// Automatic sends happen at most once per (channel, kind, entity): the first auto attempt claims this slot.
notificationLogSchema.index({ channel: 1, kind: 1, entity: 1, entityId: 1 }, { unique: true, partialFilterExpression: { auto: true }, name: "auto_once" });

const auditLogSchema = new Schema(
  {
    _id: id,
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    action: { type: String, required: true },
    summary: str,
    reason: str,
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    userId: str,
  },
  { ...createdOnly, minimize: false },
);
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: 1 });
auditLogSchema.index({ createdAt: -1, _id: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ "after.returnId": 1 }, { partialFilterExpression: { "after.returnId": { $exists: true } } });

// ───────── Relations (virtual populate: `populate: { path: "client", select: "name" }`) ─────────

function rel(schema: Schema, name: string, ref: string, localField: string, foreignField = "_id", justOne = true) {
  schema.virtual(name, { ref, localField, foreignField, justOne });
}
function count(schema: Schema, name: string, ref: string, foreignField: string) {
  schema.virtual(name, { ref, localField: "_id", foreignField, count: true });
}

rel(designSchema, "jobWorkType", "JobWorkType", "jobWorkTypeId");
rel(materialSchema, "product", "Product", "productId");
rel(materialSchema, "design", "Design", "designId");
rel(stockMovementSchema, "material", "Material", "materialId");
rel(jobSchema, "client", "Client", "clientId");
rel(jobSchema, "product", "Product", "productId");
rel(jobSchema, "jobWorkType", "JobWorkType", "jobWorkTypeId");
rel(jobSchema, "mainBill", "MainBill", "_id", "jobId");
count(jobSchema, "subBillCount", "SubBill", "jobId");
rel(dispatchSchema, "job", "Job", "jobId");
rel(returnSchema, "job", "Job", "jobId");
rel(returnSchema, "photos", "ReturnPhoto", "_id", "returnId", false);
rel(returnSchema, "subBills", "SubBill", "_id", "returnId", false);
rel(returnPhotoSchema, "return", "Return", "returnId");
rel(returnPhotoSchema, "job", "Job", "jobId");
rel(returnPhotoSchema, "client", "Client", "clientId");
rel(returnPhotoSchema, "design", "Design", "designId");
rel(subBillSchema, "client", "Client", "clientId");
rel(subBillSchema, "job", "Job", "jobId");
rel(subBillSchema, "return", "Return", "returnId");
rel(mainBillSchema, "client", "Client", "clientId");
rel(mainBillSchema, "job", "Job", "jobId");
rel(jobItemPhotoSchema, "job", "Job", "jobId");

const model = <T>(name: string, schema: Schema, collection: string) =>
  new Collection<T>((mongoose.models[name] as Model<any> | undefined) ?? mongoose.model(name, schema, collection));

/** Every collection: `db.job`, `db.return`, … */
export const db = {
  user: model<R.User>("User", userSchema, "users"),
  settings: model<R.Settings>("Settings", settingsSchema, "settings"),
  counter: model<R.Counter>("Counter", counterSchema, "counters"),
  client: model<R.Client>("Client", clientSchema, "clients"),
  product: model<R.Product>("Product", productSchema, "products"),
  jobWorkType: model<R.JobWorkType>("JobWorkType", jobWorkTypeSchema, "jobWorkTypes"),
  design: model<R.Design>("Design", designSchema, "designs"),
  material: model<R.Material>("Material", materialSchema, "materials"),
  stockMovement: model<R.StockMovement>("StockMovement", stockMovementSchema, "stockMovements"),
  job: model<R.Job>("Job", jobSchema, "jobs"),
  workerDocument: model<R.WorkerDocument>("WorkerDocument", workerDocumentSchema, "workerDocuments"),
  jobItemPhoto: model<R.JobItemPhoto>("JobItemPhoto", jobItemPhotoSchema, "jobItemPhotos"),
  dispatch: model<R.Dispatch>("Dispatch", dispatchSchema, "dispatches"),
  return: model<R.Return>("Return", returnSchema, "returns"),
  returnPhoto: model<R.ReturnPhoto>("ReturnPhoto", returnPhotoSchema, "returnPhotos"),
  subBill: model<R.SubBill>("SubBill", subBillSchema, "subBills"),
  mainBill: model<R.MainBill>("MainBill", mainBillSchema, "mainBills"),
  notificationLog: model<R.NotificationLog>("NotificationLog", notificationLogSchema, "notificationLogs"),
  auditLog: model<R.AuditLog>("AuditLog", auditLogSchema, "auditLogs"),
};

export type DB = typeof db;

/** Creates each collection if missing and makes its indexes match the schema (drops indexes no longer declared). */
export async function syncIndexes(): Promise<[string, string[]][]> {
  const out: [string, string[]][] = [];
  for (const c of Object.values(db)) {
    await c.model.createCollection();
    out.push([c.model.collection.collectionName, await c.model.syncIndexes()]);
  }
  return out;
}
