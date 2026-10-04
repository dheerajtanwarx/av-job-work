import type { Response } from "express";
import { sendXlsx } from "./xlsx.js";

export type Column<T> = { header: string; value: (row: T) => string | number | null | undefined };

function cell(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sendCsv<T>(res: Response, filename: string, rows: T[], columns: Column<T>[], footer?: (string | number | null)[]) {
  const lines = [columns.map((c) => cell(c.header)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(","))];
  if (footer) lines.push(footer.map((v) => cell(v)).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("﻿" + lines.join("\n"));
}

export const rupees = (paise: number) => (paise / 100).toFixed(2);

// ───────────────────────── Typed tables (CSV + Excel from one definition) ─────────────────────────

export type CellType = "text" | "qty" | "money" | "rate" | "int" | "pct" | "days" | "date" | "datetime" | "status";

/**
 * A column that exports to both CSV and Excel. Money/rate values are paise (CSV shows rupees with 2 decimals,
 * Excel a rupee number format); dates are "YYYY-MM-DD" or ISO timestamps.
 */
export interface TableColumn<T> {
  header: string;
  type?: CellType;
  width?: number;
  value: (row: T) => string | number | null | undefined;
}

export type ExportFormat = "csv" | "xlsx";

export const exportFormat = (q: unknown): ExportFormat | null => (q === "csv" || q === "xlsx" ? q : null);

const dd = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** Text form of a cell for CSV. */
export function csvValue(type: CellType | undefined, v: string | number | null | undefined, tz = "Asia/Kolkata"): string | number | null | undefined {
  if (v === null || v === undefined || v === "") return v;
  switch (type) {
    case "money":
    case "rate":
      return rupees(Number(v));
    case "date":
      return dd(String(v).slice(0, 10));
    case "datetime":
      return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(String(v)));
    default:
      return v;
  }
}

export interface TableTotals {
  label?: string;
  /** header → total value (in the column's own unit, e.g. paise for money) */
  values: Record<string, number | null | undefined>;
}

/** Sends rows as CSV or Excel. Headers of money columns get " (Rs)" in CSV so the figures read as rupees. */
export async function sendTable<T>(res: Response, format: ExportFormat, name: string, rows: T[], columns: TableColumn<T>[], opts: { title?: string; totals?: TableTotals } = {}) {
  if (format === "xlsx") return sendXlsx(res, `${name}.xlsx`, rows, columns, opts);
  const footer = opts.totals
    ? columns.map((c, i) => {
        const v = opts.totals!.values[c.header];
        if (v !== undefined && v !== null) return csvValue(c.type, v) as string | number;
        return i === 0 ? (opts.totals!.label ?? "Total") : "";
      })
    : undefined;
  sendCsv(
    res,
    `${name}.csv`,
    rows,
    columns.map((c) => ({ header: c.type === "money" || c.type === "rate" ? `${c.header} (Rs)` : c.header, value: (r: T) => csvValue(c.type, c.value(r)) })),
    footer,
  );
}
