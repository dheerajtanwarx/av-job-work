/** API types for notifications (email / WhatsApp / SMS / in-app log) and the public QR challan view. */
import type { JobStatus, PayStatus, Unit } from "./enums";

export const NOTIFY_CHANNELS = ["email", "whatsapp", "sms", "in_app"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** "pending" only exists while an automatic send is in flight (it claims the voucher so nothing sends twice). */
export const NOTIFY_STATUSES = ["sent", "skipped", "failed", "pending"] as const;
export type NotifyStatus = (typeof NOTIFY_STATUSES)[number];

export const NOTIFY_CHANNEL_LABEL: Record<NotifyChannel, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS", in_app: "In-app" };
export const NOTIFY_STATUS_LABEL: Record<NotifyStatus, string> = { sent: "Sent", skipped: "Not sent", failed: "Failed", pending: "Sending" };
export const NOTIFY_KIND_LABEL: Record<string, string> = { payment_voucher: "Payment Voucher" };

/** One row of the notification log (Settings → Notification log). */
export interface NotificationLogRow {
  id: string;
  channel: string;
  kind: string;
  entity: string;
  entityId: string;
  /** Human reference for the entity, e.g. the voucher number "SB-012". */
  ref: string | null;
  /** Web path to the record, when there is a page for it. */
  href: string | null;
  recipient: string | null;
  status: NotifyStatus;
  error: string | null;
  auto: boolean;
  user: string | null;
  createdAt: string;
}

/** The read-only challan view behind the QR code (`/c/[token]`). Contains nothing private. */
export interface PublicChallan {
  business: { name: string; logo: string | null };
  challanNumber: string;
  challanDate: string;
  status: JobStatus;
  overdue: boolean;
  workerName: string;
  product: string;
  jobWorkType: string | null;
  unit: Unit;
  designs: {
    designName: string;
    designCode: string | null;
    unit: Unit;
    issued: number;
    /** Received in good condition. */
    returned: number;
    damaged: number;
    rejected: number;
    lost: number;
    pending: number;
  }[];
  totals: { issued: number; returned: number; damaged: number; rejected: number; lost: number; pending: number };
  money: { workValuePaise: number; paidPaise: number; outstandingPaise: number; advancePaise: number };
  payStatus: PayStatus;
  /** Non-voided returns, oldest first. */
  returns: { returnNumber: string; date: string; receivedAt: string; qty: number; okQty: number; ratePaise: number | null; valuePaise: number }[];
  generatedAt: string;
}
