import { z } from "zod";
import { BILLING_POLICIES, DISPATCH_KINDS, PAYMENT_METHODS } from "./enums";

const optText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please pick a date");
const optDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const qty = (label = "Quantity") =>
  z.coerce.number({ message: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} cannot be negative`);
const paise = z.coerce.number().int().min(0, "Amount cannot be negative");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  businessName: optText,
  phone: optText,
  email: z
    .union([z.string().trim().email("Enter a valid email"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  address: optText,
  gstin: optText,
  notes: optText,
  isActive: z.boolean().optional(),
});
export type ClientInput = z.input<typeof clientSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: optText,
  unit: z.string().trim().min(1).max(20).default("pcs"),
  description: optText,
  isActive: z.boolean().optional(),
});
export type ProductInput = z.input<typeof productSchema>;

export const designSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: optText,
  defaultRatePaise: paise,
  description: optText,
  isActive: z.boolean().optional(),
});
export type DesignInput = z.input<typeof designSchema>;

export const jobItemSchema = z.object({
  designId: z.string().min(1, "Choose a design"),
  quantity: qty().refine((n) => n > 0, "Quantity must be at least 1"),
  ratePaise: paise,
});

export const jobCreateSchema = z.object({
  clientId: z.string().min(1, "Choose a client"),
  productId: z.string().min(1, "Choose a product"),
  jobDate: isoDate,
  expectedReturnDate: optDate,
  notes: optText,
  items: z.array(jobItemSchema).min(1, "Add at least one design"),
  dispatchNow: z.boolean().default(true),
});
export type JobCreateInput = z.input<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object({
  clientId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  jobDate: isoDate.optional(),
  expectedReturnDate: optDate,
  notes: optText,
  /** Draft jobs: full replacement list. Started jobs: only existing items (by id), qty/rate changes are audited. */
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        designId: z.string().min(1),
        quantity: qty().refine((n) => n > 0, "Quantity must be at least 1"),
        ratePaise: paise,
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
  lines: z
    .array(z.object({ jobItemId: z.string().min(1), qty: qty() }))
    .transform((ls) => ls.filter((l) => l.qty > 0))
    .refine((ls) => ls.length > 0, "Enter at least one quantity to send"),
});
export type DispatchCreateInput = z.input<typeof dispatchCreateSchema>;

export const returnLineSchema = z.object({
  jobItemId: z.string().min(1),
  okQty: qty("Received").default(0),
  damagedQty: qty("Damaged").default(0),
  rejectedQty: qty("Rejected").default(0),
  lostQty: qty("Lost").default(0),
  exceptionReason: optText,
});

export const returnCreateSchema = z.object({
  date: isoDate,
  notes: optText,
  lines: z
    .array(returnLineSchema)
    .transform((ls) => ls.filter((l) => l.okQty + l.damagedQty + l.rejectedQty + l.lostQty > 0))
    .refine((ls) => ls.length > 0, "Enter at least one received quantity"),
});
export type ReturnCreateInput = z.input<typeof returnCreateSchema>;

export const invoiceCreateSchema = z.object({
  clientId: z.string().min(1, "Choose a client"),
  date: isoDate,
  dueDate: optDate,
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  notes: optText,
  lines: z
    .array(z.object({ jobItemId: z.string().min(1), qty: qty() }))
    .transform((ls) => ls.filter((l) => l.qty > 0))
    .refine((ls) => ls.length > 0, "Select at least one line to bill"),
});
export type InvoiceCreateInput = z.input<typeof invoiceCreateSchema>;

export const paymentCreateSchema = z.object({
  invoiceId: z.string().min(1, "Choose an invoice"),
  date: isoDate,
  amountPaise: paise.refine((n) => n > 0, "Amount must be more than zero"),
  method: z.enum(PAYMENT_METHODS).default("CASH"),
  reference: optText,
  notes: optText,
});
export type PaymentCreateInput = z.input<typeof paymentCreateSchema>;

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required"),
  address: optText,
  phone: optText,
  email: optText,
  gstin: optText,
  billingPolicy: z.enum(BILLING_POLICIES),
  defaultTaxPercent: z.coerce.number().min(0).max(100),
  invoiceFooter: optText,
});
export type SettingsInput = z.input<typeof settingsSchema>;
