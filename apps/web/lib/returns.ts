"use client";

import { formatDate, qtyFitsUnit, type JobDetail, type JobListRow, type PhotoView, type ReturnDetail, type ReturnRow, type SessionUser, type Unit } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "./api";

// ───────────────────────── Queries ─────────────────────────

/** Same cache entry as the app shell; the session user carries the role. */
export const useMe = () =>
  useQuery({ queryKey: ["me"], queryFn: () => api.get<{ user: SessionUser }>("/auth/me"), staleTime: Infinity, retry: false });

export function useIsManager() {
  const me = useMe();
  const role = me.data?.user?.role;
  return role === "OWNER" || role === "MANAGER";
}

export const useOpenJobs = () => useQuery({ queryKey: ["jobs", "pending"], queryFn: () => api.get<JobListRow[]>("/jobs?pending=true") });

export const useJobsFor = (clientId: string) =>
  useQuery({ queryKey: ["jobs", "client", clientId], queryFn: () => api.get<JobListRow[]>(`/jobs${qs({ clientId })}`), enabled: !!clientId });

export const useAllJobs = () => useQuery({ queryKey: ["jobs", "all"], queryFn: () => api.get<JobListRow[]>("/jobs"), staleTime: 60_000 });

export const useJob = (id: string) => useQuery({ queryKey: ["job", id], queryFn: () => api.get<JobDetail>(`/jobs/${id}`), enabled: !!id });

export interface ReturnFilters {
  clientId?: string;
  jobId?: string;
  designId?: string;
  from?: string;
  to?: string;
  q?: string;
  voided?: boolean;
  skip?: number;
  take?: number;
}

export const useReturns = (f: ReturnFilters) =>
  useQuery({
    queryKey: ["returns", f],
    queryFn: () => api.get<{ total: number; rows: ReturnRow[] }>(`/returns${qs({ ...f, voided: f.voided ? "true" : undefined })}`),
    placeholderData: (p) => p,
  });

export const useReturn = (id: string) => useQuery({ queryKey: ["return", id], queryFn: () => api.get<ReturnDetail>(`/returns/${id}`), enabled: !!id });

// ───────────────────────── Photos ─────────────────────────

export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_MAX_FILES = 10;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Client-side check before upload (the server re-checks every file). */
export function photoProblem(f: File): string | null {
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  const typeOk = PHOTO_TYPES.includes(f.type) || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
  if (!typeOk) return "Only JPEG, PNG, WebP or HEIC photos";
  if (f.size > PHOTO_MAX_BYTES) return "Photo is larger than 15 MB";
  return null;
}

export const photoThumb = (id: string) => `/api/photos/${id}/thumb`;
export const photoDisplay = (id: string) => `/api/photos/${id}/display`;
export const photoHref = (id: string) => `/gallery?photo=${id}`;

/**
 * Uploads one photo to a saved return with progress (fetch has no upload progress, so XHR).
 * Resolves with the created PhotoView[]; rejects with a readable message.
 */
export function uploadReturnPhoto(returnId: string, file: File, returnLineId: string | null, onProgress: (pct: number) => void): Promise<PhotoView[]> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("photos", file, file.name);
    if (returnLineId) fd.append("returnLineId", returnLineId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/returns/${returnId}/photos`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { message?: string } | PhotoView[] | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(Array.isArray(body) ? body : []);
      else if (xhr.status === 401) reject(new Error("Signed out. Sign in again and retry."));
      else reject(new Error((body && !Array.isArray(body) && body.message) || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network problem. Check the connection and retry."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Retry."));
    xhr.send(fd);
  });
}

// ───────────────────────── Misc helpers ─────────────────────────

/** crypto.randomUUID needs a secure context; phones on the shop LAN may use plain http. */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* insecure context */
    }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const TZ = "Asia/Kolkata";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "3:42 PM" in India time. */
export function formatTime(at: string | null | undefined) {
  if (!at) return "—";
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "—" : timeFmt.format(d);
}

/** YYYY-MM-DD of an instant in India time. */
export function istDay(at: string) {
  return dayFmt.format(new Date(at));
}

/**
 * "04 Oct 2026, 3:42 PM". For a back-dated return (calendar date ≠ the day it was entered) the entry
 * moment is shown separately so the exact time is never misread as the receipt time.
 */
export function receivedLabel(date: string, receivedAt: string) {
  const sameDay = date.slice(0, 10) === istDay(receivedAt);
  return sameDay ? `${formatDate(date)}, ${formatTime(receivedAt)}` : `${formatDate(date)} (entered ${formatDate(istDay(receivedAt))}, ${formatTime(receivedAt)})`;
}

/** Parses a typed quantity: NaN when blank-but-invalid, 0 when blank. */
export function parseQty(v: string) {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Error text for a typed quantity in a unit, or null when fine. */
export function qtyError(v: string, unit: Unit) {
  const n = parseQty(v);
  if (Number.isNaN(n)) return "Not a number";
  if (n < 0) return "Cannot be negative";
  if (!qtyFitsUnit(n, unit)) return unit === "PCS" || unit === "SET" || unit === "DOZEN" || unit === "ROLL" ? `Whole ${unit} only` : `Too many decimals for ${unit}`;
  return null;
}

/** Parses a rupee string to paise; NaN when invalid. */
export function rupeesInput(v: string) {
  if (v.trim() === "") return Number.NaN;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
}

export const paiseToInput = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));
