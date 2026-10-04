import { prisma } from "@av/db";
import type { ClientSummary, Dashboard, JobDetail, MainBillDetail, ReturnResult, SubBillDetail, UnpaidLine } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

/** Brief §25 – the critical acceptance scenario, end to end through the HTTP API. */
describe("acceptance: Sharma Embroidery / 100 plain blouses", () => {
  let api: TestAgent;
  let clientId: string;
  let job: JobDetail;
  const subBills: SubBillDetail[] = [];
  const design: Record<string, string> = {};
  const item: Record<string, string> = {};

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    clientId = (await api.post("/clients").send({ name: "Sharma Embroidery", phone: "9800000000" }).expect(201)).body.id;
    const productId = (await api.post("/products").send({ name: "Plain Blouse", unit: "pcs" }).expect(201)).body.id;
    const materialId = await stockedMaterial(api, "Plain blouse lot");
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
            { designId: design.Floral, materialId, quantity: 20, ratePaise: 2000 },
            { designId: design.Royal, materialId, quantity: 50, ratePaise: 2500 },
            { designId: design.Simple, materialId, quantity: 30, ratePaise: 1500 },
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

  /** Pays for everything returned and not yet paid on the job – one sub bill. */
  const payAll = async (date: string, method = "CASH") => {
    const unpaid: UnpaidLine[] = (await api.get(`/bills/unpaid?jobId=${job.id}`).expect(200)).body;
    const b: SubBillDetail = (
      await api.post("/sub-bills").send({ jobId: job.id, date, method, lines: unpaid.map((u) => ({ jobItemId: u.jobItemId, qty: u.unbilledQty })) }).expect(201)
    ).body;
    subBills.push(b);
    return b;
  };

  it("creates the job: 100 pieces, ₹2,100, sent", () => {
    expect(job.jobNumber).toBe("JW-0001"); // challans are numbered JW-0001 (was JOB-001)
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

  it("pays for the first 65 pieces with sub bill SB-001", async () => {
    const b = await payAll("2026-10-05", "UPI");
    expect(b.billNumber).toBe("SB-001");
    expect(b.lines.map((l) => [l.designName, l.qty, l.ratePaise, l.amountPaise])).toEqual([
      ["Floral", 15, 2000, 30000],
      ["Royal", 30, 2500, 75000],
      ["Simple", 20, 1500, 30000],
    ]);
    expect(b.amountPaise).toBe(135000);
    expect(b.mainBill).toBeNull();
    // Paying for more than came back is refused
    await api.post("/sub-bills").send({ jobId: job.id, date: "2026-10-05", lines: [{ jobItemId: item.Royal, qty: 1 }] }).expect(422);
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
    const b = await payAll("2026-10-07");
    expect(b.billNumber).toBe("SB-002");
    expect(b.amountPaise).toBe(62500); // 100 + 375 + 150
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

  it("no main bill until every returned piece is paid", async () => {
    expect(job.mainBill).toBeNull();
    expect(job.totals.unbilledQty).toBe(5);
    expect((await api.get("/main-bills").expect(200)).body).toEqual([]);
  });

  it("the last sub bill settles the job and issues main bill MB-001", async () => {
    const b = await payAll("2026-10-10", "BANK");
    expect(b.billNumber).toBe("SB-003");
    expect(b.amountPaise).toBe(12500);
    expect(b.mainBill).toMatchObject({ billNumber: "MB-001", cancelled: false });
    expect((await api.get(`/bills/unpaid?jobId=${job.id}`).expect(200)).body).toEqual([]);

    const mb: MainBillDetail = (await api.get(`/main-bills/${b.mainBill!.id}`).expect(200)).body;
    expect(mb).toMatchObject({ billNumber: "MB-001", qty: 100, totalPaise: 210000, subBillCount: 3, cancelledAt: null });
    expect(mb.date.slice(0, 10)).toBe("2026-10-10");
    expect(mb.product.name).toBe("Plain Blouse");
    expect(mb.job.jobNumber).toBe("JW-0001");
    expect(mb.designs.map((d) => [d.designName, d.quantity, d.ok, d.paidQty, d.paidValuePaise])).toEqual([
      ["Floral", 20, 20, 20, 40000],
      ["Royal", 50, 50, 50, 125000],
      ["Simple", 30, 30, 30, 45000],
    ]);
    expect(mb.subBills.map((s) => s.billNumber)).toEqual(["SB-001", "SB-002", "SB-003"]);
  });

  it("shows the complete transaction history", async () => {
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    const types = j.timeline.map((e) => e.type);
    expect(types.filter((t) => t === "dispatch")).toHaveLength(1);
    expect(types.filter((t) => t === "return")).toHaveLength(3);
    expect(types).toContain("completed");
    expect(types.filter((t) => t === "sub_bill")).toHaveLength(3);
    expect(types).toContain("main_bill");
    const returns = j.timeline.filter((e) => e.type === "return");
    expect(returns.map((r) => r.type === "return" && r.total)).toEqual([65, 30, 5]);
    // Completion comes right after the last return
    expect(types.indexOf("completed")).toBeGreaterThan(types.lastIndexOf("return"));
    expect(j.subBills.map((b) => b.amountPaise)).toEqual([135000, 62500, 12500]);
    expect(j.mainBill).toMatchObject({ billNumber: "MB-001", totalPaise: 210000 });
  });

  it("reports and dashboard agree", async () => {
    const pending = (await api.get("/reports/pending-material").expect(200)).body;
    expect(pending.totals.pending).toBe(0);

    const cs = (await api.get("/reports/client-summary").expect(200)).body;
    const row = cs.rows.find((r: { clientId: string }) => r.clientId === clientId);
    expect(row).toMatchObject({ jobs: 1, sent: 100, received: 100, pending: 0, completedValuePaise: 210000, paidPaise: 210000, toPayPaise: 0 });

    const payments = (await api.get(`/reports/payments?from=2026-10-01&to=2026-10-31&clientId=${clientId}`).expect(200)).body;
    expect(payments.summary).toMatchObject({ completedPieces: 100, subBillCount: 3, paidPieces: 100, paidPaise: 210000 });

    const toPay = (await api.get("/reports/to-pay").expect(200)).body;
    expect(toPay.totals).toMatchObject({ qty: 0, valuePaise: 0 });

    const dash: Dashboard = (await api.get("/dashboard").expect(200)).body;
    expect(dash.ops.piecesOutside).toBe(0);
    expect(dash.ops.activeJobs).toBe(0);
    expect(dash.money).toEqual({ completedValuePaise: 210000, paidPaise: 210000, toPayPaise: 0 });

    const profile: ClientSummary = (await api.get(`/clients/${clientId}`).expect(200)).body;
    expect(profile.totals).toMatchObject({ completedJobs: 1, pending: 0, paidPaise: 210000, toPayPaise: 0 });
    expect(profile.subBills).toHaveLength(3);
    expect(profile.mainBills).toHaveLength(1);

    const csv = await api.get("/reports/payments?format=csv").expect(200);
    expect(csv.text).toContain("SB-003");
  });

  it("changing a design's default rate never changes the job", async () => {
    await api.put(`/designs/${design.Royal}`).send({ defaultRatePaise: 3000 }).expect(200);
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.items.find((i) => i.designName === "Royal")!.ratePaise).toBe(2500);
    expect(j.totals.expectedValuePaise).toBe(210000);
  });

  it("search finds job, bills and job worker", async () => {
    const s = (await api.get("/search?q=sharma").expect(200)).body;
    expect(s.clients).toHaveLength(1);
    expect(s.jobs).toHaveLength(1);
    expect(s.bills.map((b: { billNumber: string }) => b.billNumber)).toEqual(["MB-001", "SB-003", "SB-002", "SB-001"]);
    const byDate = (await api.get("/search?q=04/10/2026").expect(200)).body;
    expect(byDate.jobs).toHaveLength(1);
  });
});

describe("edge cases", () => {
  let api: TestAgent;
  let clientId: string;
  let productId: string;
  let designId: string;
  let materialId: string;

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    materialId = await stockedMaterial(api, "Saree lot");
    clientId = (await api.post("/clients").send({ name: "Gupta Prints" }).expect(201)).body.id;
    productId = (await api.post("/products").send({ name: "Saree" }).expect(201)).body.id;
    designId = (await api.post("/designs").send({ name: "Border", defaultRatePaise: 5000 }).expect(201)).body.id;
  });

  const newJob = async (qty: number, dispatchNow = true) =>
    (await api.post("/jobs").send({ clientId, productId, jobDate: "2026-10-01", dispatchNow, items: [{ designId, materialId, quantity: qty, ratePaise: 5000 }] }).expect(201)).body as JobDetail;

  it("damaged/rejected/lost are kept separate, not payable, and close the job", async () => {
    const j = await newJob(10);
    const r: ReturnResult = (
      await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: j.items[0].id, okQty: 6, damagedQty: 2, rejectedQty: 1, lostQty: 1 }] }).expect(201)
    ).body;
    expect(r.job.totals).toMatchObject({ ok: 6, damaged: 2, rejected: 1, lost: 1, exceptions: 4, pending: 0, unbilledQty: 6, completedValuePaise: 30000 });
    expect(r.job.status).toBe("COMPLETED");

    // Rework the rejected piece: job reopens, then completes again
    const afterRework: JobDetail = (await api.post(`/jobs/${j.id}/dispatches`).send({ date: "2026-10-03", kind: "REWORK", reason: "Thread work redone", lines: [{ jobItemId: j.items[0].id, qty: 1 }] }).expect(201)).body;
    expect(afterRework.totals.pending).toBe(1);
    expect(afterRework.status).toBe("PARTIALLY_RECEIVED");
    await api.post(`/jobs/${j.id}/dispatches`).send({ date: "2026-10-03", kind: "REWORK", reason: "Too many", lines: [{ jobItemId: j.items[0].id, qty: 5 }] }).expect(422);
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

  it("sub bills: one job only, rate locked once paid, voiding cancels and re-issues the main bill", async () => {
    const j = await newJob(10);
    const other = await newJob(5);
    const line = j.items[0].id;
    await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: line, okQty: 4 }] }).expect(201);
    await api.post(`/jobs/${other.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: other.items[0].id, okQty: 5 }] }).expect(201);

    // Lines from another job are refused
    await api.post("/sub-bills").send({ jobId: j.id, date: "2026-10-02", lines: [{ jobItemId: other.items[0].id, qty: 1 }] }).expect(422);
    // More than returned is refused
    await api.post("/sub-bills").send({ jobId: j.id, date: "2026-10-02", lines: [{ jobItemId: line, qty: 5 }] }).expect(422);

    const first: SubBillDetail = (await api.post("/sub-bills").send({ jobId: j.id, date: "2026-10-02", lines: [{ jobItemId: line, qty: 4 }] }).expect(201)).body;
    expect(first.amountPaise).toBe(20000);
    await api.patch(`/jobs/${j.id}`).send({ items: [{ id: line, designId, quantity: 10, ratePaise: 6000 }] }).expect(422);

    // Can't void a return whose pieces are paid for
    const r: ReturnResult = (await api.post(`/jobs/${j.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: line, okQty: 6 }] }).expect(201)).body;
    expect(r.job.status).toBe("COMPLETED");
    expect(r.job.mainBill).toBeNull(); // completed but 6 still unpaid
    const second: SubBillDetail = (await api.post("/sub-bills").send({ jobId: j.id, date: "2026-10-04", lines: [{ jobItemId: line, qty: 6 }] }).expect(201)).body;
    expect(second.mainBill?.cancelled).toBe(false);
    await api.post(`/returns/${r.id}/void`).send({ reason: "Oops" }).expect(422);

    // Voiding a sub bill cancels the main bill; paying again re-issues the same number
    const voided: SubBillDetail = (await api.post(`/sub-bills/${second.id}/void`).send({ reason: "Paid twice by mistake" }).expect(200)).body;
    expect(voided.voidedAt).toBeTruthy(); // kept, never deleted
    expect(voided.mainBill).toMatchObject({ billNumber: second.mainBill!.billNumber, cancelled: true });
    await api.post(`/sub-bills/${second.id}/void`).send({ reason: "Again" }).expect(422);

    const third: SubBillDetail = (await api.post("/sub-bills").send({ jobId: j.id, date: "2026-10-05", lines: [{ jobItemId: line, qty: 6 }] }).expect(201)).body;
    expect(third.mainBill).toMatchObject({ billNumber: second.mainBill!.billNumber, cancelled: false });
    const mb: MainBillDetail = (await api.get(`/main-bills/${third.mainBill!.id}`).expect(200)).body;
    expect(mb).toMatchObject({ totalPaise: 50000, qty: 10, subBillCount: 2 });
    expect(mb.subBills.map((b) => b.billNumber)).toEqual([first.billNumber, third.billNumber]);
  });

  it("requires login", async () => {
    const request = (await import("supertest")).default;
    const { createApp } = await import("../src/app.js");
    await request(createApp()).get("/jobs").expect(401);
  });
});
