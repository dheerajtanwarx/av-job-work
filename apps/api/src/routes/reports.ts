import { JOB_STATUS_LABEL, PAYMENT_METHOD_LABEL, REPORTS, type SubBillRow, type UnpaidLine } from "@av/shared";
import { Router, type Response } from "express";
import { exportFormat, sendTable, type ExportFormat, type TableColumn, type TableTotals } from "../lib/csv.js";
import { toDate, today } from "../lib/dates.js";
import { HttpError, str } from "../lib/http.js";
import type { Filters } from "../services/analytics.js";
import { exportShape, isCatalogReport, MAX_TAKE, runReport } from "../services/report-catalog.js";
import { clientSummaryReport, getCharts, getDashboard, paymentsReport, pendingMaterial, search, toPayReport, type ClientSummaryRow, type PendingMaterialRow } from "../services/reports.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A YYYY-MM-DD query parameter (rejects anything else with a 422 rather than silently ignoring it). */
function day(v: unknown, name: string) {
  const s = str(v);
  if (!s) return undefined;
  if (!ISO.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(422, `${name} must be a date like 2026-10-04`);
  return s;
}
const dateQ = (v: unknown) => (day(v, "date") ? toDate(day(v, "date")!) : undefined);

function filtersOf(q: Record<string, unknown>): Filters {
  return {
    from: day(q.from, "from"),
    to: day(q.to, "to"),
    date: day(q.date, "date"),
    clientId: str(q.clientId),
    designId: str(q.designId),
    productId: str(q.productId),
    jobWorkTypeId: str(q.jobWorkTypeId),
    materialId: str(q.materialId),
    jobId: str(q.jobId),
    status: str(q.status),
  };
}

function pageOf(q: Record<string, unknown>) {
  const skip = Math.max(0, Number.parseInt(String(q.skip ?? "0"), 10) || 0);
  const take = Math.min(MAX_TAKE, Math.max(1, Number.parseInt(String(q.take ?? "100"), 10) || 100));
  return { skip, take };
}

/** JSON as-is, or the same rows as CSV / Excel. */
async function respond<T>(res: Response, format: ExportFormat | null, data: unknown, name: string, rows: T[], columns: TableColumn<T>[], totals?: TableTotals) {
  if (!format) return res.json(data);
  await sendTable(res, format, name, rows, columns, { title: name, totals });
}

export const reportsRouter = Router();

reportsRouter.get("/dashboard", async (req, res) => {
  res.json(await getDashboard({ from: day(req.query.from, "from"), to: day(req.query.to, "to") }));
});

reportsRouter.get("/dashboard/charts", async (req, res) => {
  res.json(await getCharts({ from: day(req.query.from, "from"), to: day(req.query.to, "to") }));
});

reportsRouter.get("/search", async (req, res) => {
  res.json(await search(str(req.query.q) ?? ""));
});

reportsRouter.get("/reports", (_req, res) => {
  res.json(REPORTS);
});

// ───────────────────────── Pre-existing reports (JSON shape unchanged) ─────────────────────────

const pendingColumns: TableColumn<PendingMaterialRow>[] = [
  { header: "Job worker", value: (r) => r.clientName },
  { header: "Challan", value: (r) => r.jobNumber },
  { header: "Status", type: "status", value: (r) => `${JOB_STATUS_LABEL[r.jobStatus]}${r.overdue ? " · Overdue" : ""}` },
  { header: "Challan date", type: "date", value: (r) => r.jobDate },
  { header: "Expected back", type: "date", value: (r) => r.expectedReturnDate },
  { header: "Product", value: (r) => r.productName },
  { header: "Design", value: (r) => r.designName },
  { header: "Sent", type: "qty", value: (r) => r.sent },
  { header: "Received", type: "qty", value: (r) => r.received },
  { header: "Damaged/Rejected/Lost", type: "qty", value: (r) => r.exceptions },
  { header: "Pending", type: "qty", value: (r) => r.pending },
  { header: "Days out", type: "days", value: (r) => r.daysOut },
  { header: "Pending value", type: "money", value: (r) => r.pendingValuePaise },
];

reportsRouter.get("/reports/pending-material", async (req, res) => {
  const data = await pendingMaterial({ clientId: str(req.query.clientId), designId: str(req.query.designId), onlyPending: req.query.onlyPending === "true" });
  const t = data.totals;
  await respond(res, exportFormat(req.query.format), data, "pending-material", data.rows, pendingColumns, {
    values: { Sent: t.sent, Received: t.received, "Damaged/Rejected/Lost": t.exceptions, Pending: t.pending, "Pending value": t.pendingValuePaise },
  });
});

const clientColumns: TableColumn<ClientSummaryRow>[] = [
  { header: "Job worker", value: (r) => r.clientName },
  { header: "Challans", type: "int", value: (r) => r.jobs },
  { header: "Sent", type: "qty", value: (r) => r.sent },
  { header: "Received", type: "qty", value: (r) => r.received },
  { header: "Damaged/Rejected/Lost", type: "qty", value: (r) => r.exceptions },
  { header: "Pending", type: "qty", value: (r) => r.pending },
  { header: "Work completed", type: "money", value: (r) => r.completedValuePaise },
  { header: "Paid", type: "money", value: (r) => r.paidPaise },
  { header: "To pay", type: "money", value: (r) => r.toPayPaise },
];

reportsRouter.get("/reports/client-summary", async (req, res) => {
  const data = await clientSummaryReport({ includeInactive: req.query.includeInactive === "true" });
  const t = data.totals;
  await respond(res, exportFormat(req.query.format), data, "worker-summary", data.rows, clientColumns, {
    values: { Challans: t.jobs, Sent: t.sent, Received: t.received, "Damaged/Rejected/Lost": t.exceptions, Pending: t.pending, "Work completed": t.completedValuePaise, Paid: t.paidPaise, "To pay": t.toPayPaise },
  });
});

const paymentColumns: TableColumn<SubBillRow>[] = [
  { header: "Voucher", value: (r) => r.billNumber },
  { header: "Date", type: "date", value: (r) => r.date },
  { header: "Job worker", value: (r) => r.client.name },
  { header: "Challan", value: (r) => r.job.jobNumber },
  { header: "Return", value: (r) => r.returnNumber ?? "" },
  { header: "Product", value: (r) => r.job.productName },
  { header: "Amount", type: "money", value: (r) => r.amountPaise },
  { header: "Method", value: (r) => PAYMENT_METHOD_LABEL[r.method] },
  { header: "Reference", value: (r) => r.reference ?? "" },
  { header: "Status", type: "status", value: (r) => (r.voidedAt ? "Voided" : "Paid") },
];

reportsRouter.get("/reports/payments", async (req, res) => {
  const data = await paymentsReport({ from: dateQ(req.query.from), to: dateQ(req.query.to), clientId: str(req.query.clientId) });
  await respond(res, exportFormat(req.query.format), data, "payments", data.rows, paymentColumns, { label: "Total paid (excl. voided)", values: { Amount: data.summary.paidPaise } });
});

const toPayColumns: TableColumn<UnpaidLine>[] = [
  { header: "Job worker", value: (r) => r.clientName },
  { header: "Challan", value: (r) => r.jobNumber },
  { header: "Status", type: "status", value: (r) => JOB_STATUS_LABEL[r.jobStatus] },
  { header: "Product", value: (r) => r.productName },
  { header: "Design", value: (r) => r.designName },
  { header: "Rate", type: "rate", value: (r) => r.ratePaise },
  { header: "Received OK", type: "qty", value: (r) => r.ok },
  { header: "Paid pieces", type: "qty", value: (r) => r.billedQty },
  { header: "To pay pieces", type: "qty", value: (r) => r.unbilledQty },
  { header: "To pay", type: "money", value: (r) => r.unbilledValuePaise },
];

reportsRouter.get("/reports/to-pay", async (req, res) => {
  const data = await toPayReport({ clientId: str(req.query.clientId) });
  await respond(res, exportFormat(req.query.format), data, "to-pay", data.rows, toPayColumns, { values: { "To pay pieces": data.totals.qty, "To pay": data.totals.valuePaise } });
});

// ───────────────────────── Catalogue reports ─────────────────────────

reportsRouter.get("/reports/:id", async (req, res) => {
  const id = req.params.id;
  if (!isCatalogReport(id)) throw new HttpError(404, "Report not found");
  const format = exportFormat(req.query.format);
  const q = req.query as Record<string, unknown>;
  const data = await runReport(id, filtersOf(q), today(), format ? undefined : pageOf(q));
  if (!format) return res.json(data);
  const shape = exportShape(data);
  const suffix = [q.from, q.to ?? q.date].filter((x) => typeof x === "string" && x).join("_to_");
  await sendTable(res, format, `${id}${suffix ? `_${suffix}` : ""}`, data.rows, shape.columns, { title: data.title, totals: shape.totals });
});
