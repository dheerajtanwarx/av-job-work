/** API types and helpers for return photos (gallery, viewer, upload). `PhotoView` itself lives in types.ts. */
import type { PhotoView } from "./types";

/** Upload limits – the API enforces these; the capture UI can use them to warn early. */
export const PHOTO_LIMITS = {
  maxFiles: 10,
  maxBytes: 15 * 1024 * 1024,
  /** MIME types accepted by `POST /returns/:id/photos` (field `photos`). */
  mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as readonly string[],
  extensions: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] as readonly string[],
} as const;

/** `GET /photos` query. Rates are integer paise (live rate of the linked return line or lines). */
export interface PhotoFilter {
  clientId?: string;
  jobId?: string;
  designId?: string;
  productId?: string;
  jobWorkTypeId?: string;
  returnId?: string;
  /** Return date range, YYYY-MM-DD. */
  from?: string;
  to?: string;
  minRate?: number;
  maxRate?: number;
  /** Owner / manager only; ignored for other roles. */
  includeVoided?: boolean;
  cursor?: string;
  take?: number;
}

/** `GET /photos` response: newest first; pass `nextCursor` back as `cursor` for the next page. */
export interface PhotoPage {
  rows: PhotoView[];
  nextCursor: string | null;
}

/** URLs of a photo's files (all behind login; ids are unguessable). Relative to the web app (`/api` is proxied). */
export const photoUrls = (id: string, base = "/api") => ({
  thumb: `${base}/photos/${id}/thumb`,
  display: `${base}/photos/${id}/display`,
  original: `${base}/photos/${id}/original`,
  share: `${base}/photos/${id}/share`,
});

// ───────────────────────── Time formatting (business time zone) ─────────────────────────

export const BUSINESS_TZ = "Asia/Kolkata";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const partsCache = new Map<string, Intl.DateTimeFormat>();

function zoned(d: string | Date, tz: string) {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    partsCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute) };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "02:37 PM" in the business time zone. */
export function formatTime(d: string | Date | null | undefined, tz = BUSINESS_TZ) {
  const z = d ? zoned(d, tz) : null;
  if (!z) return "—";
  return `${pad(z.h % 12 || 12)}:${pad(z.min)} ${z.h < 12 ? "AM" : "PM"}`;
}

/** "04 Oct 2026, 02:37 PM" in the business time zone (for instants such as receivedAt / uploadedAt). */
export function formatDateTime(d: string | Date | null | undefined, tz = BUSINESS_TZ) {
  const z = d ? zoned(d, tz) : null;
  if (!z) return "—";
  return `${pad(z.d)} ${MONTHS[z.m - 1]} ${z.y}, ${formatTime(d, tz)}`;
}

/** "04-10-2026" for a calendar date stored as UTC midnight. */
export function formatDateNumeric(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}
