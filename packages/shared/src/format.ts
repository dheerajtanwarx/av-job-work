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

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

/** Indian numbering in words: 123456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six". */
function integerInWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  for (const [size, name] of [[10_000_000, "Crore"], [100_000, "Lakh"], [1000, "Thousand"]] as const) {
    if (n >= size) {
      const count = Math.floor(n / size);
      parts.push(`${size === 10_000_000 ? integerInWords(count) : belowThousand(count)} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** "Rupees Two Thousand One Hundred and Fifty Paise Only" – for printed bills. */
export function amountInWords(paise: number) {
  const p = Math.max(0, Math.round(paise));
  const rupees = Math.floor(p / 100);
  const rest = p % 100;
  return `Rupees ${integerInWords(rupees)}${rest ? ` and ${integerInWords(rest)} Paise` : ""} Only`;
}
