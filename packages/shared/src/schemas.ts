import { z } from "zod";
import { DISPATCH_KINDS, PAYMENT_METHODS, PAYMENT_POLICIES, STOCK_MOVEMENT_TYPES, UNITS, type Unit } from "./enums";

const optText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const optId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** ≈200 KB of image once base64-encoded. */
export const MAX_LOGO_CHARS = 280_000;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please pick a date");
const optDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** Quantities may be decimal (up to 3 places); the unit's own precision is checked by the API. */
const qty = (label = "Quantity") =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .refine((n) => Number.isFinite(n) && Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6, `${label} can have at most 3 decimals`);
const paise = z.coerce.number().int().min(0, "Amount cannot be negative");

const LEGACY_UNITS: Record<string, Unit> = {
  pcs: "PCS", pc: "PCS", piece: "PCS", pieces: "PCS", nos: "PCS",
  m: "MTR", mtr: "MTR", mtrs: "MTR", meter: "MTR", meters: "MTR", metre: "MTR", metres: "MTR",
  kg: "KG", kgs: "KG", roll: "ROLL", rolls: "ROLL", dozen: "DOZEN", dz: "DOZEN", doz: "DOZEN", set: "SET", sets: "SET",
};
export const unitSchema = z.preprocess((v) => (typeof v === "string" ? (LEGACY_UNITS[v.trim().toLowerCase()] ?? v.trim().toUpperCase()) : v), z.enum(UNITS));

const paymentPolicy = z.preprocess((v) => (v === "ON_COMPLETION" ? "AFTER_COMPLETION" : v === "" ? null : v), z.enum(PAYMENT_POLICIES).nullable().optional());
const paymentDays = z.coerce.number().int().min(0, "Days cannot be negative").max(365).nullable().optional();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  businessName: optText,
  phone: optText,
  alternatePhone: optText,
  email: z
    .union([z.string().trim().email("Enter a valid email"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  address: optText,
  gstin: optText,
  pan: optText,
  notes: optText,
  paymentPolicy,
  paymentDays,
  isActive: z.boolean().optional(),
});
export type ClientInput = z.input<typeof clientSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: optText,
  unit: unitSchema.default("PCS"),
  description: optText,
  isActive: z.boolean().optional(),
});
export type ProductInput = z.input<typeof productSchema>;

export const jobWorkTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: optText,
  description: optText,
  isActive: z.boolean().optional(),
});
export type JobWorkTypeInput = z.input<typeof jobWorkTypeSchema>;

export const designSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: optText,
  defaultRatePaise: paise,
  description: optText,
  jobWorkTypeId: optId,
  isActive: z.boolean().optional(),
});
export type DesignInput = z.input<typeof designSchema>;

export const materialSchema = z.object({
  code: z.string().trim().max(60).optional().nullable().transform((v) => (v ? v : null)), // generated when empty
  name: z.string().trim().min(1, "Name is required").max(200),
  productId: optId,
  fabricType: optText,
  color: optText,
  designId: optId,
  unit: unitSchema.default("PCS"),
  lotNumber: optText,
  rollNumber: optText,
  supplier: optText,
  location: optText,
  notes: optText,
  isActive: z.boolean().optional(),
  /** Optional opening stock recorded as a RECEIPT when the material is created. */
  openingQty: qty("Opening stock").optional(),
});
export type MaterialInput = z.input<typeof materialSchema>;

export const stockMovementSchema = z.object({
  materialId: z.string().min(1, "Choose a material"),
  type: z.enum(STOCK_MOVEMENT_TYPES),
  qty: qty().refine((n) => n > 0, "Quantity must be more than 0"),
  date: isoDate,
  reason: optText,
});
export type StockMovementInput = z.input<typeof stockMovementSchema>;

export const jobItemSchema = z.object({
  designId: z.string().min(1, "Choose a design"),
  materialId: z.string({ message: "Choose the material" }).min(1, "Choose the material"),
  jobWorkTypeId: optId,
  quantity: qty().refine((n) => n > 0, "Quantity must be more than 0"),
  ratePaise: paise,
  notes: optText,
});

export const jobCreateSchema = z.object({
  clientId: z.string().min(1, "Choose a job worker"),
  productId: z.string().min(1, "Choose a product"),
  jobWorkTypeId: optId,
  jobDate: isoDate,
  expectedReturnDate: optDate,
  paymentPolicy,
  paymentDays,
  notes: optText,
  items: z.array(jobItemSchema).min(1, "Add at least one design"),
  dispatchNow: z.boolean().default(true),
  /** Needed when issuing more than the warehouse holds. */
  stockOverrideReason: optText,
});
export type JobCreateInput = z.input<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object({
  clientId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  jobWorkTypeId: optId,
  jobDate: isoDate.optional(),
  expectedReturnDate: optDate,
  paymentPolicy,
  paymentDays,
  notes: optText,
  /** Draft challans: full replacement list. Started challans: only existing items (by id), qty/rate changes are audited. */
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        designId: z.string().min(1),
        materialId: optId,
        jobWorkTypeId: optId,
        quantity: qty().refine((n) => n > 0, "Quantity must be more than 0"),
        ratePaise: paise,
        notes: optText,
      }),
    )
    .optional(),
  reason: optText,
});
export type JobUpdateInput = z.input<typeof jobUpdateSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Please give a short reason"),
});

export const dispatchCreateSchema = z.object({
  date: isoDate,
  kind: z.enum(DISPATCH_KINDS).default("INITIAL"),
  notes: optText,
  /** Needed for rework and additional issues, and when issuing more than the warehouse holds. */
  reason: optText,
  lines: z
    .array(z.object({ jobItemId: z.string().min(1), qty: qty() }))
    .transform((ls) => ls.filter((l) => l.qty > 0))
    .refine((ls) => ls.length > 0, "Enter at least one quantity to send"),
});
export type DispatchCreateInput = z.input<typeof dispatchCreateSchema>;

export const returnLineSchema = z.object({
  jobItemId: z.string().min(1),
  okQty: qty("Good").default(0),
  damagedQty: qty("Damaged").default(0),
  rejectedQty: qty("Rejected").default(0),
  lostQty: qty("Lost").default(0),
  /** Rate for this returned work. Defaults to the challan rate. */
  ratePaise: paise.optional(),
  payDamaged: z.boolean().optional(),
  payRejected: z.boolean().optional(),
  payLost: z.boolean().optional(),
  payOverrideReason: optText,
  exceptionReason: optText,
});

export const paymentNowSchema = z.object({
  amountPaise: paise,
  method: z.enum(PAYMENT_METHODS).default("CASH"),
  reference: optText,
  notes: optText,
  advanceReason: optText,
  idempotencyKey: optText,
});

export const returnCreateSchema = z.object({
  date: isoDate,
  notes: optText,
  lines: z
    .array(returnLineSchema)
    .transform((ls) => ls.filter((l) => l.okQty + l.damagedQty + l.rejectedQty + l.lostQty > 0))
    .refine((ls) => ls.length > 0, "Enter at least one received quantity"),
  /** One per Record Return form: a retried submit returns the return already recorded instead of a second one. */
  idempotencyKey: optText,
  /** Pay now, in the same step. Omit (or amount 0) for "no payment now". */
  payment: paymentNowSchema.optional().nullable(),
});
export type ReturnCreateInput = z.input<typeof returnCreateSchema>;

export const returnUpdateSchema = z.object({
  reason: z.string().trim().min(3, "Please give a reason for the change"),
  date: isoDate.optional(),
  notes: optText,
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        okQty: qty("Good"),
        damagedQty: qty("Damaged"),
        rejectedQty: qty("Rejected"),
        lostQty: qty("Lost"),
        ratePaise: paise,
        payDamaged: z.boolean().optional(),
        payRejected: z.boolean().optional(),
        payLost: z.boolean().optional(),
        exceptionReason: optText,
      }),
    )
    .optional(),
});
export type ReturnUpdateInput = z.input<typeof returnUpdateSchema>;

export const subBillCreateSchema = z
  .object({
    jobId: z.string().min(1, "Choose a challan"),
    returnId: optId,
    date: isoDate,
    method: z.enum(PAYMENT_METHODS).default("CASH"),
    reference: optText,
    notes: optText,
    /** Amount-based payment (partial payments allowed). */
    amountPaise: paise.optional(),
    /** Qty-based payment (legacy): pays returned good quantity at the challan rate. */
    lines: z
      .array(z.object({ jobItemId: z.string().min(1), qty: qty() }))
      .transform((ls) => ls.filter((l) => l.qty > 0))
      .optional(),
    /** Required when paying more than is outstanding. */
    advanceReason: optText,
    /** One per form submit – a repeated key returns the existing voucher instead of paying twice. */
    idempotencyKey: optText,
  })
  .refine((v) => (v.amountPaise ?? 0) > 0 || (v.lines?.length ?? 0) > 0, { message: "Enter the amount paid", path: ["amountPaise"] });
export type SubBillCreateInput = z.input<typeof subBillCreateSchema>;

export const settingsSchema = z.preprocess(
  (v) => {
    if (v && typeof v === "object" && "billingPolicy" in v && !("defaultPaymentPolicy" in v)) {
      const { billingPolicy, ...rest } = v as Record<string, unknown>;
      return { ...rest, defaultPaymentPolicy: billingPolicy };
    }
    return v;
  },
  z.object({
    businessName: z.string().trim().min(1, "Business name is required"),
    address: optText,
    phone: optText,
    email: optText,
    /** Kept small so it can be embedded inline in every email. */
    logo: z
      .string()
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "Logo must be a PNG or JPEG image")
      .max(MAX_LOGO_CHARS, "Logo must be smaller than 200 KB")
      .nullable()
      .optional(),
    emailBills: z.boolean().optional(),
    defaultPaymentPolicy: z.preprocess((v) => (v === "ON_COMPLETION" ? "AFTER_COMPLETION" : v), z.enum(PAYMENT_POLICIES)),
    defaultPaymentDays: z.coerce.number().int().min(0).max(365).optional(),
    payDamagedDefault: z.boolean().optional(),
    payRejectedDefault: z.boolean().optional(),
    payLostDefault: z.boolean().optional(),
  }),
);
export type SettingsInput = z.input<typeof settingsSchema>;

/** Common report/list filters. */
export const listFilterSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  clientId: z.string().optional(),
  jobId: z.string().optional(),
  designId: z.string().optional(),
  productId: z.string().optional(),
  jobWorkTypeId: z.string().optional(),
  materialId: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
});
export type ListFilter = z.output<typeof listFilterSchema>;
