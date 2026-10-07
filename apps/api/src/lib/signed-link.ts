import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Unguessable links to a receipt PDF that work without logging in – sent to job workers on WhatsApp.
 * Token = "<record id>.<HMAC of kind:id>", so a link only ever opens the one receipt it was made for.
 */
export type ReceiptKind = "return" | "issue";

const sig = (kind: ReceiptKind, id: string) => createHmac("sha256", env.jwtSecret).update(`receipt:${kind}:${id}`).digest("hex").slice(0, 32);

export const signReceipt = (kind: ReceiptKind, id: string) => `${id}.${sig(kind, id)}`;

/** The record id when the token is genuine for this kind, otherwise null. */
export function verifyReceipt(kind: ReceiptKind, token: string): string | null {
  const m = /^([a-z0-9]{1,40})\.([0-9a-f]{32})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(sig(kind, m[1]));
  const given = Buffer.from(m[2]);
  return timingSafeEqual(expected, given) ? m[1] : null;
}

/** Public web address of the PDF (through the web app's /api proxy). */
export const receiptLink = (kind: ReceiptKind, id: string) => `${env.publicWebUrl.replace(/\/+$/, "")}/api/public/receipts/${kind}/${signReceipt(kind, id)}`;
