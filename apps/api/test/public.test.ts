import { prisma } from "@av/db";
import type { JobDetail, PublicChallan } from "@av/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

describe("public QR challan view", () => {
  let api: Awaited<ReturnType<typeof loggedInAgent>>;
  let job: JobDetail;
  const anon = () => request(createApp());

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    await api.put("/settings").send({ businessName: "AV Creation", phone: "9800000000", address: "Surat", defaultPaymentPolicy: "MANUAL" }).expect(200);
    const clientId = (
      await api
        .post("/clients")
        .send({ name: "Ramesh Embroidery", phone: "9876543210", email: "ramesh@example.com", address: "12 Secret Lane", gstin: "24ABCDE1234F1Z5", notes: "PRIVATE-WORKER-NOTE" })
        .expect(201)
    ).body.id;
    const productId = (await api.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id;
    const d1 = (await api.post("/designs").send({ name: "Zari Butti", code: "ZB-1", defaultRatePaise: 4000 }).expect(201)).body.id;
    const d2 = (await api.post("/designs").send({ name: "Mirror Work", defaultRatePaise: 5000 }).expect(201)).body.id;
    const materialId = await stockedMaterial(api, "Saree lot");
    job = (
      await api
        .post("/jobs")
        .send({
          clientId,
          productId,
          jobDate: "2026-10-01",
          dispatchNow: true,
          notes: "PRIVATE-CHALLAN-NOTE",
          items: [
            { designId: d1, materialId, quantity: 100, ratePaise: 4000 },
            { designId: d2, materialId, quantity: 90, ratePaise: 5000 },
          ],
        })
        .expect(201)
    ).body;
    const [a, b] = job.items.map((i) => i.id);
    await api
      .post(`/jobs/${job.id}/returns`)
      .send({ date: "2026-10-02", notes: "PRIVATE-RETURN-NOTE", lines: [{ jobItemId: a, okQty: 40, damagedQty: 2, exceptionReason: "torn" }, { jobItemId: b, okQty: 30 }] })
      .expect(201);
    const second = (await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: a, okQty: 10, ratePaise: 4500 }] }).expect(201)).body;
    await api.post(`/returns/${second.id}/void`).send({ reason: "entered twice" });
    await api.post("/sub-bills").send({ jobId: job.id, date: "2026-10-04", amountPaise: 100000, method: "CASH", reference: "PRIVATE-REF" }).expect(201);
    job = (await api.get(`/jobs/${job.id}`).expect(200)).body;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("shows the challan figures without logging in, matching the challan exactly", async () => {
    const res = await anon().get(`/public/challans/${job.publicToken}`).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-robots-tag"]).toMatch(/noindex/);
    const c: PublicChallan = res.body;
    expect(c).toMatchObject({ business: { name: "AV Creation" }, challanNumber: job.jobNumber, workerName: "Ramesh Embroidery", product: "Saree", status: job.status, payStatus: job.payStatus });
    expect(c.money).toEqual({ workValuePaise: job.money.valuePaise, paidPaise: 100000, outstandingPaise: job.money.outstandingPaise, advancePaise: job.money.advancePaise });
    expect(c.money.workValuePaise).toBe(40 * 4000 + 30 * 5000); // damaged not payable by default; voided return excluded
    expect(c.totals).toEqual({ issued: 190, returned: 70, damaged: 2, rejected: 0, lost: 0, pending: 118 });
    expect(c.designs).toEqual([
      { designName: "Zari Butti", designCode: "ZB-1", unit: "PCS", issued: 100, returned: 40, damaged: 2, rejected: 0, lost: 0, pending: 58 },
      { designName: "Mirror Work", designCode: null, unit: "PCS", issued: 90, returned: 30, damaged: 0, rejected: 0, lost: 0, pending: 60 },
    ]);
    expect(c.returns).toHaveLength(1); // the voided return is not shown
    expect(c.returns[0]).toMatchObject({ qty: 72, okQty: 70, valuePaise: 310000 });
  });

  it("exposes nothing private", async () => {
    const res = await anon().get(`/public/challans/${job.publicToken}`).expect(200);
    const raw = JSON.stringify(res.body);
    for (const secret of ["9876543210", "ramesh@example.com", "Secret Lane", "24ABCDE1234F1Z5", "PRIVATE-", "9800000000", "Surat", "torn", job.id, job.client.id, job.items[0].id, job.returns[0].id, "photo", "href", "publicToken"]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("returns the same 404 for malformed and unknown tokens", async () => {
    const unknown = await anon().get(`/public/challans/${"a".repeat(64)}`).expect(404);
    const malformed = await anon().get("/public/challans/not-a-token").expect(404);
    const sqlish = await anon().get(`/public/challans/${encodeURIComponent("' OR 1=1 --")}`).expect(404);
    expect(malformed.body).toEqual(unknown.body);
    expect(sqlish.body).toEqual(unknown.body);
    expect(malformed.headers["cache-control"]).toBe("no-store");
  });

  it("regenerating the token invalidates the old QR link", async () => {
    const old = job.publicToken;
    const updated: JobDetail = (await api.post(`/jobs/${job.id}/public-token`).expect(200)).body;
    expect(updated.publicToken).toMatch(/^[0-9a-f]{64}$/);
    expect(updated.publicToken).not.toBe(old);
    await anon().get(`/public/challans/${old}`).expect(404);
    await anon().get(`/public/challans/${updated.publicToken}`).expect(200);
  });
});
