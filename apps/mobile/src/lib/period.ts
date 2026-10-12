import { todayISO } from "@av/shared";

export type Period = "all" | "month" | "90d" | "fy";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "90d", label: "90 days" },
  { value: "fy", label: "This FY" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Date range for a period, as the API's ?from&to (YYYY-MM-DD). The Indian financial year starts 1 April. */
export function periodRange(p: Period): { from?: string; to?: string } {
  const now = new Date();
  const to = todayISO();
  if (p === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (p === "90d") return { from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)), to };
  if (p === "fy") return { from: iso(new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1)), to };
  return {};
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "Sun, 12 Oct" */
export function todayLabel() {
  return new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
