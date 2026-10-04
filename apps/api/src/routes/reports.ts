import { formatDate, JOB_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@av/shared";
import { Router } from "express";
import { rupees, sendCsv } from "../lib/csv.js";
import { toDate } from "../lib/dates.js";
import { str } from "../lib/http.js";
import { billingReport, clientSummaryReport, getDashboard, outstandingReport, pendingMaterial, search } from "../services/reports.js";

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
    { header: "Client", value: (r) => r.clientName },
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
    { header: "Client", value: (r) => r.clientName },
    { header: "Jobs", value: (r) => r.jobs },
    { header: "Pieces sent", value: (r) => r.sent },
    { header: "Pieces received", value: (r) => r.received },
    { header: "Damaged/Rejected/Lost", value: (r) => r.exceptions },
    { header: "Pending pieces", value: (r) => r.pending },
    { header: "Billed (Rs)", value: (r) => rupees(r.billedPaise) },
    { header: "Paid (Rs)", value: (r) => rupees(r.paidPaise) },
    { header: "Outstanding (Rs)", value: (r) => rupees(r.outstandingPaise) },
    { header: "Not yet billed (Rs)", value: (r) => rupees(r.unbilledPaise) },
  ]);
});

reportsRouter.get("/reports/billing", async (req, res) => {
  const data = await billingReport({ from: dateQ(req.query.from), to: dateQ(req.query.to), clientId: str(req.query.clientId) });
  if (!wantsCsv(req.query.format)) return res.json(data);
  sendCsv(res, "billing.csv", data.rows, [
    { header: "Invoice", value: (r) => r.invoiceNumber },
    { header: "Date", value: (r) => formatDate(r.date) },
    { header: "Client", value: (r) => r.client.name },
    { header: "Jobs", value: (r) => r.jobNumbers.join(" ") },
    { header: "Pieces", value: (r) => r.qty },
    { header: "Total (Rs)", value: (r) => rupees(r.totalPaise) },
    { header: "Paid (Rs)", value: (r) => rupees(r.paidPaise) },
    { header: "Outstanding (Rs)", value: (r) => rupees(r.outstandingPaise) },
    { header: "Status", value: (r) => PAYMENT_STATUS_LABEL[r.status] },
  ]);
});

reportsRouter.get("/reports/outstanding", async (req, res) => {
  const data = await outstandingReport({ clientId: str(req.query.clientId) });
  if (!wantsCsv(req.query.format)) return res.json(data);
  sendCsv(res, "outstanding.csv", data.rows, [
    { header: "Invoice", value: (r) => r.invoiceNumber },
    { header: "Date", value: (r) => formatDate(r.date) },
    { header: "Days", value: (r) => r.ageDays },
    { header: "Client", value: (r) => r.client.name },
    { header: "Total (Rs)", value: (r) => rupees(r.totalPaise) },
    { header: "Paid (Rs)", value: (r) => rupees(r.paidPaise) },
    { header: "Outstanding (Rs)", value: (r) => rupees(r.outstandingPaise) },
    { header: "Status", value: (r) => PAYMENT_STATUS_LABEL[r.status] },
  ]);
});
