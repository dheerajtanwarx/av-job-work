import { prisma } from "@av/db";
import type { ChallanLedger } from "../src/services/accounts.js";
import type { ClientSummary, Dashboard, JobDetail, Ledger, ReturnDetail, ReturnResult, WorkerMaterialRow } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

/** The AV Creation acceptance scenarios (spec §67–§71), end to end through the HTTP API. */

let api: TestAgent;
let productPcs: string;
let productMtr: string;

beforeAll(async () => {
  await resetDb();
  api = await loggedInAgent();
  productPcs = (await api.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id;
  productMtr = (await api.post("/products").send({ name: "Fabric", unit: "MTR" }).expect(201)).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("§67 Ramesh / 190 PCS Floral, four returns at changing rates", () => {
  let ramesh: string;
  let job: JobDetail;
  let line: string;
  const results: ReturnResult[] = [];

  beforeAll(async () => {
    ramesh = (await api.post("/clients").send({ name: "Ramesh", phone: "9812345678" }).expect(201)).body.id;
    const floral = (await api.post("/designs").send({ name: "Floral", defaultRatePaise: 8000 }).expect(201)).body.id;
    const materialId = await stockedMaterial(api, "Saree blanks", "PCS", 1000);
    job = (
      await api
        .post("/jobs")
        .send({ clientId: ramesh, productId: productPcs, jobDate: "2026-10-01", dispatchNow: true, items: [{ designId: floral, materialId, quantity: 190, ratePaise: 8000 }] })
        .expect(201)
    ).body;
    line = job.items[0].id;
  });

  const ret = (okQty: number, ratePaise: number, amountPaise: number, date: string) =>
    api
      .post(`/jobs/${job.id}/returns`)
      .send({ date, lines: [{ jobItemId: line, okQty, ratePaise }], payment: amountPaise ? { amountPaise, method: "CASH" } : null })
      .expect(201);

  it("records four returns, each with its own rate and exact time, and payments of ₹2,000 / ₹0 / ₹5,000 / ₹1,000", async () => {
    expect(job.jobNumber).toMatch(/^JW-\d{4}$/);
    expect(job.totals).toMatchObject({ quantity: 190, sent: 190, pending: 190 });
    for (const [qty, rate, pay, date] of [[52, 8000, 200000, "2026-10-02"], [44, 8000, 0, "2026-10-03"], [91, 8500, 500000, "2026-10-04"], [3, 8500, 100000, "2026-10-05"]] as const) {
      const before = Date.now();
      const r: ReturnResult = (await ret(qty, rate, pay, date)).body;
      expect(new Date(r.receivedAt).getTime()).toBeGreaterThanOrEqual(before - 1000); // server time, not typed in
      expect(r.voucher?.amountPaise ?? 0).toBe(pay);
      expect(r.voucher?.returnId ?? null).toBe(pay ? r.id : null);
      results.push(r);
    }
    expect(results[1].voucher).toBeNull(); // zero payment: no voucher, return stays unpaid
    expect(results[1].payment).toMatchObject({ valuePaise: 352000, paidPaise: 0, status: "NOT_PAID" });
  });

  it("totals: 190 returned, 0 pending, ₹15,670 work, ₹8,000 paid, ₹7,670 outstanding, Completed", async () => {
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.totals).toMatchObject({ ok: 190, pending: 0 });
    expect(j.totals.completedValuePaise).toBe(52 * 8000 + 44 * 8000 + 91 * 8500 + 3 * 8500);
    expect(j.money).toEqual({ valuePaise: 1567000, paidPaise: 800000, outstandingPaise: 767000, advancePaise: 0 });
    expect(j.status).toBe("COMPLETED");
    expect(j.payStatus).toBe("PARTIAL");
    expect(j.returns.map((r) => [r.okQty, r.ratePaise, r.valuePaise])).toEqual([
      [52, 8000, 416000],
      [44, 8000, 352000],
      [91, 8500, 773500],
      [3, 8500, 25500],
    ]);
    expect(j.returns.every((r) => !!r.receivedAt)).toBe(true);
    // Final settlement only once fully paid
    expect(j.mainBill).toBeNull();
  });

  it("timeline: created → issued → return/payment pairs → completion, each with date and time", async () => {
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    const kinds = j.timeline.filter((e) => e.type !== "audit").map((e) => e.type);
    // Completion sits right after the return that completed the challan, before that return's payment.
    expect(kinds).toEqual(["created", "dispatch", "return", "sub_bill", "return", "return", "sub_bill", "return", "completed", "sub_bill"]);
    expect(j.timeline.every((e) => e.at && e.date)).toBe(true);
  });

  it("challan ledger and worker ledger agree", async () => {
    const cl: ChallanLedger = (await api.get(`/jobs/${job.id}/ledger`).expect(200)).body;
    expect(cl.issuedValuePaise).toBe(1520000);
    expect(cl.totals).toEqual({ debitPaise: 1567000, creditPaise: 800000, closingPaise: 767000 });
    expect(cl.rows.map((r) => r.balancePaise)).toEqual([416000, 216000, 568000, 1341500, 841500, 867000, 767000]);
    const wl: Ledger = (await api.get(`/clients/${ramesh}/ledger`).expect(200)).body;
    expect(wl.totals.closingPaise).toBe(767000);
    const profile: ClientSummary = (await api.get(`/clients/${ramesh}`).expect(200)).body;
    expect(profile.totals).toMatchObject({ completedValuePaise: 1567000, paidPaise: 800000, toPayPaise: 767000, pending: 0 });
  });

  it("dashboard reflects the work and payments", async () => {
    const d: Dashboard = (await api.get("/dashboard").expect(200)).body;
    expect(d.money).toMatchObject({ completedValuePaise: 1567000, paidPaise: 800000, toPayPaise: 767000 });
    expect(d.toPay.find((t) => t.clientId === ramesh)?.valuePaise).toBe(767000);
  });

  it("paying the rest settles the challan and issues the final settlement", async () => {
    const b = (await api.post("/sub-bills").send({ jobId: job.id, date: "2026-10-06", amountPaise: 767000, method: "UPI" }).expect(201)).body;
    expect(b.mainBill).toMatchObject({ cancelled: false });
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.mainBill).toMatchObject({ totalPaise: 1567000, qty: 190 });
    expect(j.money.outstandingPaise).toBe(0);
  });
});

describe("§68 partial challan: 1,000 MTR, 300 + 250 back", () => {
  let worker: string;
  let job: JobDetail;

  beforeAll(async () => {
    worker = (await api.post("/clients").send({ name: "Suresh Prints" }).expect(201)).body.id;
    const design = (await api.post("/designs").send({ name: "Block print", defaultRatePaise: 1000 }).expect(201)).body.id;
    const materialId = await stockedMaterial(api, "Cotton roll", "MTR", 5000);
    job = (
      await api
        .post("/jobs")
        .send({ clientId: worker, productId: productMtr, jobDate: "2026-10-01", items: [{ designId: design, materialId, quantity: 1000, ratePaise: 1000 }] })
        .expect(201)
    ).body;
    const l = job.items[0].id;
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: l, okQty: 300 }], payment: { amountPaise: 200000 } }).expect(201);
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: l, okQty: 250 }], payment: null }).expect(201);
  });

  it("550 returned, 450 pending, Partially Received, ₹3,500 outstanding", async () => {
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.unit).toBe("MTR");
    expect(j.totals).toMatchObject({ ok: 550, pending: 450 });
    expect(j.status).toBe("PARTIALLY_RECEIVED");
    expect(j.money).toMatchObject({ valuePaise: 550000, paidPaise: 200000, outstandingPaise: 350000 });
  });

  it("the worker holds 450 MTR, and the warehouse has 4,550 of 5,000", async () => {
    const m: WorkerMaterialRow[] = (await api.get(`/clients/${worker}/material`).expect(200)).body;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ materialName: "Cotton roll", unit: "MTR", issued: 1000, returned: 550, pending: 450, challans: 1 });
    const mats = (await api.get("/materials").expect(200)).body;
    expect(mats.find((x: { name: string }) => x.name === "Cotton roll").stock).toMatchObject({ available: 4550, withWorkers: 450 });
  });

  it("decimal metres are accepted, fractional pieces are not", async () => {
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-04", lines: [{ jobItemId: job.items[0].id, okQty: 0.5 }] }).expect(201);
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.totals.pending).toBe(449.5);
    const dash: Dashboard = (await api.get("/dashboard").expect(200)).body;
    expect(dash.ops.piecesOutside).toBe(449.5);
  });
});

describe("§69 overdue payment: 7-day terms, returned 01 Oct, nothing paid", () => {
  let worker: string;
  let job: JobDetail;

  beforeAll(async () => {
    worker = (await api.post("/clients").send({ name: "Mahesh Stitching", paymentPolicy: "DAYS_AFTER_RETURN", paymentDays: 7 }).expect(201)).body.id;
    const design = (await api.post("/designs").send({ name: "Stitch", defaultRatePaise: 10000 }).expect(201)).body.id;
    const materialId = await stockedMaterial(api, "Blouse pieces", "PCS", 500);
    job = (await api.post("/jobs").send({ clientId: worker, productId: productPcs, jobDate: "2026-09-25", items: [{ designId: design, materialId, quantity: 100, ratePaise: 10000 }] }).expect(201)).body;
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-01", lines: [{ jobItemId: job.items[0].id, okQty: 100 }] }).expect(201);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is due 08 Oct and 1 day overdue on 09 Oct", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T06:00:00Z") });
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.terms).toEqual({ policy: "DAYS_AFTER_RETURN", days: 7 });
    expect(j.returns[0].payment).toMatchObject({ valuePaise: 1000000, paidPaise: 0, dueDate: "2026-10-08", overdueDays: 1, status: "NOT_PAID" });
    const profile: ClientSummary = (await api.get(`/clients/${worker}`).expect(200)).body;
    expect(profile.totals.toPayPaise).toBe(1000000);
  });

  it("is not overdue on the due date itself", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-08T06:00:00Z") });
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.returns[0].payment?.overdueDays).toBe(0);
  });

  it("a challan-level override wins over the worker's terms", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T06:00:00Z") });
    await api.patch(`/jobs/${job.id}`).send({ paymentPolicy: "DAYS_AFTER_RETURN", paymentDays: 15, reason: "Agreed 15 days for this lot" }).expect(200);
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.returns[0].payment).toMatchObject({ dueDate: "2026-10-16", overdueDays: 0 });
  });
});

describe("§70 rate change: default ₹70, challan ₹80, returns at ₹80 and ₹85, then default → ₹90", () => {
  it("never changes historical rates", async () => {
    const worker = (await api.post("/clients").send({ name: "Dinesh" }).expect(201)).body.id;
    const design = (await api.post("/designs").send({ name: "Zari", defaultRatePaise: 7000 }).expect(201)).body.id;
    const materialId = await stockedMaterial(api, "Zari lot", "PCS", 100);
    const job: JobDetail = (await api.post("/jobs").send({ clientId: worker, productId: productPcs, jobDate: "2026-10-01", items: [{ designId: design, materialId, quantity: 20, ratePaise: 8000 }] }).expect(201)).body;
    const l = job.items[0].id;
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: l, okQty: 10 }] }).expect(201); // challan rate
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: l, okQty: 10, ratePaise: 8500 }] }).expect(201);
    await api.put(`/designs/${design}`).send({ defaultRatePaise: 9000 }).expect(200);

    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.items[0].ratePaise).toBe(8000);
    expect(j.returns.map((r) => r.ratePaise)).toEqual([8000, 8500]);
    expect(j.money.valuePaise).toBe(165000);
    const d = (await api.get("/designs").expect(200)).body.find((x: { id: string }) => x.id === design);
    expect(d.defaultRatePaise).toBe(9000); // new challans start from ₹90
    const rateHistory = await prisma.auditLog.findFirst({ where: { entity: "Job", entityId: job.id, summary: { contains: "₹85" } } });
    expect(rateHistory?.summary).toMatch(/received at ₹85 \(challan rate ₹80\)/);
  });
});

describe("§71 void a return", () => {
  it("removes it from every calculation but keeps it visible with the reason", async () => {
    const worker = (await api.post("/clients").send({ name: "Kamal" }).expect(201)).body.id;
    const design = (await api.post("/designs").send({ name: "Cutwork", defaultRatePaise: 5000 }).expect(201)).body.id;
    const materialId = await stockedMaterial(api, "Cutwork lot", "PCS", 100);
    const job: JobDetail = (await api.post("/jobs").send({ clientId: worker, productId: productPcs, jobDate: "2026-10-01", items: [{ designId: design, materialId, quantity: 50, ratePaise: 5000 }] }).expect(201)).body;
    const l = job.items[0].id;
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: l, okQty: 20 }], payment: { amountPaise: 100000 } }).expect(201);
    const r2: ReturnResult = (await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: l, okQty: 30 }] }).expect(201)).body;
    expect(r2.job.status).toBe("COMPLETED");

    const after: JobDetail = (await api.post(`/returns/${r2.id}/void`).send({ reason: "Entered on the wrong challan" }).expect(200)).body;
    expect(after.totals).toMatchObject({ ok: 20, pending: 30 });
    expect(after.status).toBe("PARTIALLY_RECEIVED");
    expect(after.money).toMatchObject({ valuePaise: 100000, paidPaise: 100000, outstandingPaise: 0 });
    const voided = after.returns.find((r) => r.id === r2.id)!;
    expect(voided).toMatchObject({ voidReason: "Entered on the wrong challan", payment: null });
    expect(voided.voidedAt).toBeTruthy();

    const detail: ReturnDetail = (await api.get(`/returns/${r2.id}`).expect(200)).body;
    expect(detail.history.map((h) => h.action)).toEqual(["create", "void"]);
    expect(detail.history[1].reason).toBe("Entered on the wrong challan");
    const m: WorkerMaterialRow[] = (await api.get(`/clients/${worker}/material`).expect(200)).body;
    expect(m[0].pending).toBe(30);
    await api.post(`/returns/${r2.id}/void`).send({ reason: "again" }).expect(422);
  });
});
