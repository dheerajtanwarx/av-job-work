import { prisma } from "@av/db";
import type { ClientSummary, Dashboard, InvoiceDetail, JobDetail, ReturnResult } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loggedInAgent, resetDb } from "./helpers.js";

/** Brief §25 – the critical acceptance scenario, end to end through the HTTP API. */
describe("acceptance: Sharma Embroidery / 100 plain blouses", () => {
  let api: TestAgent;
  let clientId: string;
  let job: JobDetail;
  let invoice: InvoiceDetail;
  const design: Record<string, string> = {};
  const item: Record<string, string> = {};

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    clientId = (await api.post("/clients").send({ name: "Sharma Embroidery", phone: "9800000000" }).expect(201)).body.id;
    const productId = (await api.post("/products").send({ name: "Plain Blouse", unit: "pcs" }).expect(201)).body.id;
    for (const [name, rate] of [["Floral", 2000], ["Royal", 2500], ["Simple", 1500]] as const) {
      design[name] = (await api.post("/designs").send({ name, defaultRatePaise: rate }).expect(201)).body.id;
    }
    job = (
      await api
        .post("/jobs")
        .send({
          clientId,
          productId,
          jobDate: "2026-10-04",
          expectedReturnDate: "2026-10-20",
          dispatchNow: true,
          items: [
            { designId: design.Floral, quantity: 20, ratePaise: 2000 },
            { designId: design.Royal, quantity: 50, ratePaise: 2500 },
            { designId: design.Simple, quantity: 30, ratePaise: 1500 },
          ],
        })
        .expect(201)
    ).body;
    for (const it of job.items) item[it.designName] = it.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const ret = (date: string, lines: [string, number][], extra: Record<string, unknown> = {}) =>
    api.post(`/jobs/${job.id}/returns`).send({ date, lines: lines.map(([n, okQty]) => ({ jobItemId: item[n], okQty, ...extra })) });

  it("creates the job: 100 pieces, ₹2,100, sent", () => {
    expect(job.jobNumber).toBe("JOB-001");
    expect(job.status).toBe("IN_PROGRESS");
    expect(job.totals.quantity).toBe(100);
    expect(job.totals.sent).toBe(100);
    expect(job.totals.pending).toBe(100);
    expect(job.totals.expectedValuePaise).toBe(210000);
  });

  it("first return: 15 / 30 / 20", async () => {
    const r: ReturnResult = (await ret("2026-10-05", [["Floral", 15], ["Royal", 30], ["Simple", 20]]).expect(201)).body;
    expect(r.receivedNow).toBe(65);
    const j = r.job;
    expect(j.totals.ok).toBe(65);
    expect(j.items.map((i) => i.pending)).toEqual([5, 20, 10]);
    expect(j.totals.pending).toBe(35);
    expect(j.totals.completedValuePaise).toBe(135000); // 300 + 750 + 300
    expect(j.status).toBe("PARTIALLY_RECEIVED");
  });

  it("rejects an over-return without a reason (rule 6)", async () => {
    const res = await ret("2026-10-06", [["Floral", 6]]).expect(422);
    expect(res.body.message).toMatch(/only 5 pending/);
  });

  it("second return: 5 / 15 / 10", async () => {
    const j = ((await ret("2026-10-07", [["Floral", 5], ["Royal", 15], ["Simple", 10]]).expect(201)).body as ReturnResult).job;
    expect(j.totals.ok).toBe(95);
    expect(j.items.map((i) => i.pending)).toEqual([0, 5, 0]);
    expect(j.totals.pending).toBe(5);
    expect(j.status).toBe("PARTIALLY_RECEIVED");
  });

  it("final return: Royal 5 completes the job", async () => {
    const r: ReturnResult = (await ret("2026-10-09", [["Royal", 5]]).expect(201)).body;
    expect(r.justCompleted).toBe(true);
    expect(r.job.totals.ok).toBe(100);
    expect(r.job.totals.pending).toBe(0);
    expect(r.job.status).toBe("COMPLETED");
    expect(r.job.totals.completedValuePaise).toBe(210000);
    job = r.job;
  });

  it("generates the invoice from unbilled work", async () => {
    const unbilled = (await api.get(`/billing/unbilled?clientId=${clientId}`).expect(200)).body as { jobItemId: string; unbilledQty: number }[];
    expect(unbilled.map((u) => u.unbilledQty)).toEqual([20, 50, 30]);
    invoice = (
      await api
        .post("/invoices")
        .send({ clientId, date: "2026-10-09", taxPercent: 0, lines: unbilled.map((u) => ({ jobItemId: u.jobItemId, qty: u.unbilledQty })) })
        .expect(201)
    ).body;
    expect(invoice.invoiceNumber).toBe("INV-001");
    expect(invoice.lines.map((l) => [l.designName, l.qty, l.ratePaise, l.amountPaise])).toEqual([
      ["Floral", 20, 2000, 40000],
      ["Royal", 50, 2500, 125000],
      ["Simple", 30, 1500, 45000],
    ]);
    expect(invoice.totalPaise).toBe(210000);
    expect(invoice.status).toBe("UNPAID");
    // Nothing left to bill and double billing is refused
    expect((await api.get(`/billing/unbilled?clientId=${clientId}`).expect(200)).body).toEqual([]);
    await api.post("/invoices").send({ clientId, date: "2026-10-09", lines: [{ jobItemId: item.Royal, qty: 1 }] }).expect(422);
  });

  it("records a partial payment and shows outstanding", async () => {
    await api.post("/payments").send({ invoiceId: invoice.id, date: "2026-10-10", amountPaise: 300000, method: "CASH" }).expect(422);
    invoice = (await api.post("/payments").send({ invoiceId: invoice.id, date: "2026-10-10", amountPaise: 100000, method: "UPI" }).expect(201)).body;
    expect(invoice.paidPaise).toBe(100000);
    expect(invoice.outstandingPaise).toBe(110000);
    expect(invoice.status).toBe("PARTIAL");
  });

  it("shows the complete transaction history", async () => {
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    const types = j.timeline.map((e) => e.type);
    expect(types.filter((t) => t === "dispatch")).toHaveLength(1);
    expect(types.filter((t) => t === "return")).toHaveLength(3);
    expect(types).toContain("completed");
    expect(types).toContain("invoice");
    expect(types).toContain("payment");
    const returns = j.timeline.filter((e) => e.type === "return");
    expect(returns.map((r) => r.type === "return" && r.total)).toEqual([65, 30, 5]);
    // Completion comes right after the last return
    expect(types.indexOf("completed")).toBeGreaterThan(types.lastIndexOf("return"));
    expect(j.invoices[0].status).toBe("PARTIAL");
  });

  it("reports and dashboard agree", async () => {
    const pending = (await api.get("/reports/pending-material").expect(200)).body;
    expect(pending.totals.pending).toBe(0);

    const cs = (await api.get("/reports/client-summary").expect(200)).body;
    const row = cs.rows.find((r: { clientId: string }) => r.clientId === clientId);
    expect(row).toMatchObject({ jobs: 1, sent: 100, received: 100, pending: 0, billedPaise: 210000, paidPaise: 100000, outstandingPaise: 110000 });

    const billing = (await api.get(`/reports/billing?from=2026-10-01&to=2026-10-31&clientId=${clientId}`).expect(200)).body;
    expect(billing.summary).toMatchObject({ completedPieces: 100, invoiceCount: 1, billedPaise: 210000, outstandingPaise: 110000 });

    const out = (await api.get("/reports/outstanding").expect(200)).body;
    expect(out.totals).toMatchObject({ invoices: 1, partial: 1, outstandingPaise: 110000 });

    const dash: Dashboard = (await api.get("/dashboard").expect(200)).body;
    expect(dash.ops.piecesOutside).toBe(0);
    expect(dash.ops.activeJobs).toBe(0);
    expect(dash.money).toMatchObject({ completedValuePaise: 210000, billedPaise: 210000, paidPaise: 100000, outstandingPaise: 110000, unbilledPaise: 0 });

    const profile: ClientSummary = (await api.get(`/clients/${clientId}`).expect(200)).body;
    expect(profile.totals).toMatchObject({ completedJobs: 1, pending: 0, billedPaise: 210000, paidPaise: 100000, outstandingPaise: 110000 });

    const csv = await api.get("/reports/outstanding?format=csv").expect(200);
    expect(csv.text).toContain("INV-001");
  });

  it("changing a design's default rate never changes the job", async () => {
    await api.put(`/designs/${design.Royal}`).send({ defaultRatePaise: 3000 }).expect(200);
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.items.find((i) => i.designName === "Royal")!.ratePaise).toBe(2500);
    expect(j.totals.expectedValuePaise).toBe(210000);
  });

  it("search finds job, invoice and client", async () => {
    const s = (await api.get("/search?q=sharma").expect(200)).body;
    expect(s.clients).toHaveLength(1);
    expect(s.jobs).toHaveLength(1);
    expect(s.invoices).toHaveLength(1);
    const byDate = (await api.get("/search?q=04/10/2026").expect(200)).body;
    expect(byDate.jobs).toHaveLength(1);
  });
});

describe("edge cases", () => {
  let api: TestAgent;
  let clientId: string;
  let productId: string;
  let designId: string;

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    clientId = (await api.post("/clients").send({ name: "Gupta Prints" }).expect(201)).body.id;
    productId = (await api.post("/products").send({ name: "Saree" }).expect(201)).body.id;
    designId = (await api.post("/designs").send({ name: "Border", defaultRatePaise: 5000 }).expect(201)).body.id;
  });

  const newJob = async (qty: number, dispatchNow = true) =>
    (await api.post("/jobs").send({ clientId, productId, jobDate: "2026-10-01", dispatchNow, items: [{ designId, quantity: qty, ratePaise: 5000 }] }).expect(201)).body as JobDetail;

  it("damaged/rejected/lost are kept separate, not billable, and close the job", async () => {
    const j = await newJob(10);
    const r: ReturnResult = (
      await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: j.items[0].id, okQty: 6, damagedQty: 2, rejectedQty: 1, lostQty: 1 }] }).expect(201)
    ).body;
    expect(r.job.totals).toMatchObject({ ok: 6, damaged: 2, rejected: 1, lost: 1, exceptions: 4, pending: 0, unbilledQty: 6, completedValuePaise: 30000 });
    expect(r.job.status).toBe("COMPLETED");

    // Rework the rejected piece: job reopens, then completes again
    const afterRework: JobDetail = (await api.post(`/jobs/${j.id}/dispatches`).send({ date: "2026-10-03", kind: "REWORK", lines: [{ jobItemId: j.items[0].id, qty: 1 }] }).expect(201)).body;
    expect(afterRework.totals.pending).toBe(1);
    expect(afterRework.status).toBe("PARTIALLY_RECEIVED");
    await api.post(`/jobs/${j.id}/dispatches`).send({ date: "2026-10-03", kind: "REWORK", lines: [{ jobItemId: j.items[0].id, qty: 5 }] }).expect(422);
    const back: ReturnResult = (await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-04", lines: [{ jobItemId: j.items[0].id, okQty: 1 }] }).expect(201)).body;
    expect(back.job.status).toBe("COMPLETED");
    expect(back.job.totals.ok).toBe(7);
  });

  it("over-return with a reason is accepted and audited", async () => {
    const j = await newJob(5);
    const r: ReturnResult = (
      await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: j.items[0].id, okQty: 6, exceptionReason: "Client returned an extra piece from old job" }] }).expect(201)
    ).body;
    expect(r.job.totals.excess).toBe(1);
    expect(r.job.timeline.some((e) => e.type === "audit" && e.text.includes("extra piece"))).toBe(true);
  });

  it("draft job, partial dispatch, void return, cancel", async () => {
    const j = await newJob(10, false);
    expect(j.status).toBe("DRAFT");
    await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: j.items[0].id, okQty: 1 }] }).expect(422);
    const sent: JobDetail = (await api.post(`/jobs/${j.id}/dispatches`).send({ date: "2026-10-02", lines: [{ jobItemId: j.items[0].id, qty: 6 }] }).expect(201)).body;
    expect(sent.totals).toMatchObject({ sent: 6, notYetSent: 4, pending: 6 });
    await api.post(`/jobs/${j.id}/dispatches`).send({ date: "2026-10-02", lines: [{ jobItemId: j.items[0].id, qty: 5 }] }).expect(422);

    const r: ReturnResult = (await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: j.items[0].id, okQty: 6 }] }).expect(201)).body;
    expect(r.job.status).toBe("PARTIALLY_RECEIVED"); // 4 not yet sent
    const voided: JobDetail = (await api.post(`/returns/${r.id}/void`).send({ reason: "Entered twice" }).expect(200)).body;
    expect(voided.totals.ok).toBe(0);
    expect(voided.timeline.find((e) => e.type === "return" && e.voided)).toBeTruthy();

    const cancelled: JobDetail = (await api.post(`/jobs/${j.id}/cancel`).send({ reason: "Order cancelled" }).expect(200)).body;
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.totals.pending).toBe(6); // still visible – nothing disappears
  });

  it("billing after each return + rate locked once billed + cancel invoice blocked by payment", async () => {
    const j = await newJob(10);
    await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: j.items[0].id, okQty: 4 }] }).expect(201);
    const inv: InvoiceDetail = (await api.post("/invoices").send({ clientId, date: "2026-10-02", taxPercent: 5, lines: [{ jobItemId: j.items[0].id, qty: 4 }] }).expect(201)).body;
    expect(inv).toMatchObject({ subtotalPaise: 20000, taxPaise: 1000, totalPaise: 21000 });
    await api.patch(`/jobs/${j.id}`).send({ items: [{ id: j.items[0].id, designId, quantity: 10, ratePaise: 6000 }] }).expect(422);

    const paid: InvoiceDetail = (await api.post("/payments").send({ invoiceId: inv.id, date: "2026-10-03", amountPaise: 21000 }).expect(201)).body;
    expect(paid.status).toBe("PAID");
    await api.post(`/invoices/${inv.id}/cancel`).send({ reason: "Wrong" }).expect(422);
    const unpaid: InvoiceDetail = (await api.post(`/payments/${paid.payments[0].id}/void`).send({ reason: "Cheque bounced" }).expect(200)).body;
    expect(unpaid.status).toBe("UNPAID");
    expect(unpaid.payments[0].voidedAt).toBeTruthy(); // kept, never deleted
    await api.post(`/invoices/${inv.id}/cancel`).send({ reason: "Wrong" }).expect(200);
    const unbilled = (await api.get(`/billing/unbilled?jobId=${j.id}`).expect(200)).body;
    expect(unbilled[0].unbilledQty).toBe(4);
  });

  it("requires login", async () => {
    const request = (await import("supertest")).default;
    const { createApp } = await import("../src/app.js");
    await request(createApp()).get("/jobs").expect(401);
  });
});
