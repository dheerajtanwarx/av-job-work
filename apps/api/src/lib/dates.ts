import { businessToday } from "@av/shared";
import { env } from "../env.js";

/** Calendar dates are stored as UTC midnight. */
export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function toDateOrNull(iso: string | null | undefined): Date | null {
  return iso ? toDate(iso) : null;
}

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Today's calendar date in the business time zone ("2026-10-04"). */
export function today(): string {
  return businessToday(env.businessTz);
}

/** Today as a stored calendar date (UTC midnight). */
export function todayUTC(): Date {
  return toDate(today());
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Understands 2026-10-04, 04/10/2026, 4-10-2026, "04 Oct", "4 oct 2026". */
export function parseSearchDate(q: string): Date | null {
  const s = q.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) return mk(m[3] ? year(+m[3]) : new Date().getFullYear(), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\s*(\d{2,4})?$/);
  if (m && MONTHS.includes(m[2])) return mk(m[3] ? year(+m[3]) : new Date().getFullYear(), MONTHS.indexOf(m[2]) + 1, +m[1]);
  return null;
}

function year(y: number) {
  return y < 100 ? 2000 + y : y;
}

function mk(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
