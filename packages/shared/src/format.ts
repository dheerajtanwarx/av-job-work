const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

/** ₹2,100 or ₹12.50 – whole rupees drop the decimals. */
export function formatINR(paise: number | null | undefined) {
  const p = paise ?? 0;
  return p % 100 === 0 ? inr0.format(p / 100) : inr2.format(p / 100);
}

export function formatQty(n: number | null | undefined) {
  return num.format(n ?? 0);
}

export function paiseToRupees(paise: number) {
  return paise / 100;
}

export function rupeesToPaise(rupees: number | string) {
  const n = typeof rupees === "string" ? Number(rupees) : rupees;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dates are calendar dates (stored as UTC midnight). "04 Oct 2026" */
export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatShortDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]}`;
}

/** YYYY-MM-DD for <input type="date"> using the local calendar day. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toISODate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}
