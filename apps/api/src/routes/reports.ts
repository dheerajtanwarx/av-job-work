import { formatDate, JOB_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@av/shared";
import { Router } from "express";
import { rupees, sendCsv } from "../lib/csv.js";
import { toDate } from "../lib/dates.js";
import { str } from "../lib/http.js";
import { clientSummaryReport, getDashboard, paymentsReport, pendingMaterial, search, toPayReport } from "../services/reports.js";

const dateQ = (v: unknown) => (str(v) ? toDate(str(v)!) : undefined);
const wantsCsv = (q: unknown) => q === "csv";

export const reportsRouter = Router();

reportsRouter.get("/dashboard", async (_req, res) => {
  res.json(await getDashboard());
});

reportsRouter.get("/search", async (req, res) => {
  res.json(await search(str(req.query.q) ?? ""));
});

reportsRouter.get("/reports/pending-material", async (req, res) => {
  const data = await pendingMaterial({ clientId: str(req.query.clientId), designId: str(req.query.designId), onlyPending: req.query.onlyPending === "true" });
  if (!wantsCsv(req.query.format)) return res.json(data);
  sendCsv(res, "pending-material.csv", data.rows, [
    { header: "Job worker", value: (r) => r.clientName },
    { header: "Job", value: (r) => r.jobNumber },
    { header: "Status", value: (r) => JOB_STATUS_LABEL[r.jobStatus] },
    { header: "Job date", value: (r) => formatDate(r.jobDate) },
    { header: "Expected back", value: (r) => formatDate(r.expectedReturnDate) },
    { header: "Product", value: (r) => r.productName },
    { header: "Design", value: (r) => r.designName },
    { header: "Sent", value: (r) => r.sent },
    { header: "Received", value: (r) => r.received },
    { header: "Damaged/Rejected/Lost", value: (r) => r.exceptions },
    { header: "Pending", value: (r) => r.pending },
    { header: "Pending value (Rs)", value: (r) => rupees(r.pendingValuePaise) },
  ]);
});

reportsRouter.get("/reports/client-summary", async (req, res) => {
  const data = await clientSummaryReport({ includeInactive: req.query.includeInactive === "true" });
  if (!wantsCsv(req.query.format)) return res.json(data);
  sendCsv(res, "client-summary.csv", data.rows, [
    { header: "Job worker", value: (r) => r.clientName },
    { header: "Jobs", value: (r) => r.jobs },
    { header: "Pieces sent", value: (r) => r.sent },
    { header: "Pieces received", value: (r) => r.received },
    { header: "Damaged/Rejected/Lost", value: (r) => r.exceptions },
    { header: "Pending pieces", value: (r) => r.pending },
    { header: "Work completed (Rs)", value: (r) => rupees(r.completedValuePaise) },
    { header: "Paid (Rs)", value: (r) => rupees(r.paidPaise) },
    { header: "To pay (Rs)", value: (r) => rupees(r.toPayPaise) },
  ]);
});

reportsRouter.get("/reports/payments", async (req, res) => {
  const data = await paymentsReport({ from: dateQ(req.query.from), to: dateQ(req.query.to), clientId: str(req.query.clientId) });
  if (!wantsCsv(req.query.format)) return res.json(data);
  sendCsv(res, "payments.csv", data.rows, [
    { header: "Sub bill", value: (r) => r.billNumber },
    { header: "Date", value: (r) => formatDate(r.date) },
    { header: "Job worker", value: (r) => r.client.name },
    { header: "Job", value: (r) => r.job.jobNumber },
    { header: "Product", value: (r) => r.job.productName },
    { header: "Pieces", value: (r) => r.qty },
    { header: "Amount (Rs)", value: (r) => rupees(r.amountPaise) },
    { header: "Method", value: (r) => PAYMENT_METHOD_LABEL[r.method] },
    { header: "Reference", value: (r) => r.reference ?? "" },
    { header: "Status", value: (r) => (r.voidedAt ? "Voided" : "Paid") },
  ]);
});

reportsRouter.get("/reports/to-pay", async (req, res) => {
  const data = await toPayReport({ clientId: str(req.query.clientId) });
  if (!wantsCsv(req.query.format)) return res.json(data);
  sendCsv(res, "to-pay.csv", data.rows, [
    { header: "Job worker", value: (r) => r.clientName },
    { header: "Job", value: (r) => r.jobNumber },
    { header: "Status", value: (r) => JOB_STATUS_LABEL[r.jobStatus] },
    { header: "Product", value: (r) => r.productName },
    { header: "Design", value: (r) => r.designName },
    { header: "Rate (Rs)", value: (r) => rupees(r.ratePaise) },
    { header: "Received OK", value: (r) => r.ok },
    { header: "Paid pieces", value: (r) => r.billedQty },
    { header: "To pay pieces", value: (r) => r.unbilledQty },
    { header: "To pay (Rs)", value: (r) => rupees(r.unbilledValuePaise) },
  ]);
});
