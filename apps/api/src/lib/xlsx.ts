import ExcelJS from "exceljs";
import type { Response } from "express";
import { env } from "../env.js";
import type { CellType, TableColumn, TableTotals } from "./csv.js";

const RUPEE_FMT = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
const QTY_FMT = "#,##0.###";
const INT_FMT = "#,##0";
const PCT_FMT = '0.0"%"';
const DATE_FMT = "dd-mmm-yyyy";
const DATETIME_FMT = "dd-mmm-yyyy hh:mm";

const DEFAULT_WIDTH: Record<CellType, number> = { text: 22, status: 16, qty: 12, money: 15, rate: 12, int: 9, pct: 10, days: 9, date: 13, datetime: 18 };

const FORMAT: Partial<Record<CellType, string>> = { money: RUPEE_FMT, rate: RUPEE_FMT, qty: QTY_FMT, int: INT_FMT, days: INT_FMT, pct: PCT_FMT, date: DATE_FMT, datetime: DATETIME_FMT };

/** Wall-clock time in the business time zone, as an Excel date (Excel has no time zones). */
function localDate(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: env.businessTz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const p = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return new Date(Date.UTC(p("year"), p("month") - 1, p("day"), p("hour") % 24, p("minute"), p("second")));
}

function excelValue(type: CellType | undefined, v: string | number | null | undefined): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (type) {
    case "money":
    case "rate":
      return Number(v) / 100;
    case "qty":
    case "int":
    case "pct":
    case "days":
      return Number(v);
    case "date":
      return new Date(`${String(v).slice(0, 10)}T00:00:00.000Z`);
    case "datetime":
      return localDate(String(v));
    default:
      return typeof v === "number" ? v : String(v);
  }
}

/** One-sheet workbook: bold frozen header, typed number formats, sensible widths and an optional bold totals row. */
export async function buildWorkbook<T>(rows: T[], columns: TableColumn<T>[], opts: { title?: string; totals?: TableTotals } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AV Creation – AV JOB WORK";
  wb.created = new Date();
  const ws = wb.addWorksheet((opts.title ?? "Report").replace(/[\\/?*[\]:]/g, " ").slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c, i) => ({
    header: c.header,
    key: `c${i}`,
    width: Math.max(c.width ?? DEFAULT_WIDTH[c.type ?? "text"], Math.min(40, c.header.length + 2)),
    style: FORMAT[c.type ?? "text"] ? { numFmt: FORMAT[c.type ?? "text"] } : {},
  }));
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1EE" } };
  columns.forEach((c, i) => {
    if (c.type && c.type !== "text" && c.type !== "status") ws.getCell(1, i + 1).alignment = { horizontal: "right", vertical: "middle" };
  });
  for (const r of rows) ws.addRow(columns.map((c) => excelValue(c.type, c.value(r))));
  if (opts.totals) {
    const t = ws.addRow(
      columns.map((c, i) => {
        const v = opts.totals!.values[c.header];
        if (v !== undefined && v !== null) return excelValue(c.type, v);
        return i === 0 ? (opts.totals!.label ?? "Total") : null;
      }),
    );
    t.font = { bold: true };
    t.eachCell((cell) => {
      cell.border = { top: { style: "thin" } };
    });
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, columns.length) } };
  return wb;
}

export async function sendXlsx<T>(res: Response, filename: string, rows: T[], columns: TableColumn<T>[], opts: { title?: string; totals?: TableTotals } = {}) {
  const wb = await buildWorkbook(rows, columns, opts);
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buf as ArrayBuffer));
}
