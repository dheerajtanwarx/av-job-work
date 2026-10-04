import type { Response } from "express";

export type Column<T> = { header: string; value: (row: T) => string | number | null | undefined };

function cell(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sendCsv<T>(res: Response, filename: string, rows: T[], columns: Column<T>[]) {
  const lines = [columns.map((c) => cell(c.header)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(","))];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("﻿" + lines.join("\n"));
}

export const rupees = (paise: number) => (paise / 100).toFixed(2);
