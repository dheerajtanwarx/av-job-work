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

// ───────── Short links: /r/<code> ─────────
//
// code = kind letter + base62(12-byte ObjectId, 17 chars) + base62(first 10 bytes of the HMAC, 14 chars): 32
// characters, letters and digits only (WhatsApp would read "_" as italics and break the link).

const KIND_CHAR: Record<ReceiptKind, string> = { return: "r", issue: "i" };
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_BYTES = 12;
const ID_CHARS = 17;
const SIG_BYTES = 10;
const SIG_CHARS = 14;
const OBJECT_ID = /^[0-9a-f]{24}$/;
const SHORT_CODE = new RegExp(`^[ri][0-9A-Za-z]{${ID_CHARS + SIG_CHARS}}$`);

const toB62 = (hex: string, width: number) => {
  let n = BigInt(`0x${hex}`);
  let out = "";
  while (n > 0n) {
    out = B62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(width, "0");
};

/** Hex of exactly `bytes` bytes, or null when the value doesn't fit. */
const fromB62 = (s: string, bytes: number) => {
  let n = 0n;
  for (const ch of s) n = n * 62n + BigInt(B62.indexOf(ch));
  const hex = n.toString(16).padStart(bytes * 2, "0");
  return hex.length === bytes * 2 ? hex : null;
};

const shortSig = (kind: ReceiptKind, id: string) => createHmac("sha256", env.jwtSecret).update(`receipt:${kind}:${id}`).digest().subarray(0, SIG_BYTES);

/** The receipt a short code points at, when the code is genuine; otherwise null. */
export function verifyShortReceipt(code: string): { kind: ReceiptKind; id: string } | null {
  if (!SHORT_CODE.test(code)) return null;
  const kind: ReceiptKind = code[0] === "r" ? "return" : "issue";
  const id = fromB62(code.slice(1, 1 + ID_CHARS), ID_BYTES);
  const sigHex = fromB62(code.slice(1 + ID_CHARS), SIG_BYTES);
  if (!id || !sigHex) return null;
  return timingSafeEqual(shortSig(kind, id), Buffer.from(sigHex, "hex")) ? { kind, id } : null;
}

const base = () => env.publicWebUrl.replace(/\/+$/, "");

/**
 * Public web address of the PDF: the short /r/<code> link (≈65 characters, downloads the PDF). Ids from before the
 * Mongo move aren't ObjectIds and keep the long /api/public/receipts link.
 */
export const receiptLink = (kind: ReceiptKind, id: string) =>
  OBJECT_ID.test(id)
    ? `${base()}/r/${KIND_CHAR[kind]}${toB62(id, ID_CHARS)}${toB62(shortSig(kind, id).toString("hex"), SIG_CHARS)}`
    : `${base()}/api/public/receipts/${kind}/${signReceipt(kind, id)}`;
