import { db } from "@av/db";
import type { JobDetail, ReturnResult } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { beforeAll, describe, expect, it } from "vitest";
import { loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

describe("recording returns", () => {
  let api: TestAgent;
  let job: JobDetail;

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    const clientId = (await api.post("/clients").send({ name: "Ramesh" }).expect(201)).body.id;
    const productId = (await api.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id;
    const designId = (await api.post("/designs").send({ name: "Floral", defaultRatePaise: 8000 }).expect(201)).body.id;
    const materialId = await stockedMaterial(api);
    job = (await api.post("/jobs").send({ clientId, productId, jobDate: "2026-10-01", items: [{ designId, materialId, quantity: 50, ratePaise: 8000 }] }).expect(201)).body;
  });


  it("a retried submit (same key) returns the saved return and never records it or its payment twice", async () => {
    const body = {
      date: "2026-10-02",
      idempotencyKey: "form-1",
      lines: [{ jobItemId: job.items[0].id, okQty: 10 }],
      payment: { amountPaise: 50000, method: "CASH", idempotencyKey: "form-1" },
    };
    const first: ReturnResult = (await api.post(`/jobs/${job.id}/returns`).send(body).expect(201)).body;
    expect(first.duplicate).toBe(false);
    expect(first.lines).toEqual([{ id: expect.any(String), jobItemId: job.items[0].id }]);
    const again: ReturnResult = (await api.post(`/jobs/${job.id}/returns`).send(body).expect(201)).body;
    expect(again).toMatchObject({ id: first.id, returnNumber: first.returnNumber, duplicate: true });
    expect(again.voucher?.id).toBe(first.voucher?.id);
    expect(await db.return.count({ jobId: job.id })).toBe(1);
    expect(await db.subBill.count({ jobId: job.id })).toBe(1);
    expect(again.job.totals.ok).toBe(10);
  });

  it("an edit needs a reason and is audited with before/after", async () => {
    const r: ReturnResult = (await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: job.items[0].id, okQty: 20 }] }).expect(201)).body;
    const line = r.lines[0].id;
    await api.patch(`/returns/${r.id}`).send({ lines: [{ id: line, okQty: 15, damagedQty: 0, rejectedQty: 0, lostQty: 0, ratePaise: 8500 }] }).expect(422);
    const edited = (await api.patch(`/returns/${r.id}`).send({ reason: "Counted again", lines: [{ id: line, okQty: 15, damagedQty: 0, rejectedQty: 0, lostQty: 0, ratePaise: 8500 }] }).expect(200)).body;
    expect(edited).toMatchObject({ okQty: 15, ratePaise: 8500, valuePaise: 127500 });
    expect(edited.editedAt).toBeTruthy();
    const log = await db.auditLog.findOneOrThrow({ entity: "Return", entityId: r.id, action: "update" });
    expect(log.reason).toBe("Counted again");
    expect(log.summary).toMatch(/good 20 → 15, rate ₹85|good 20 → 15, rate ₹80 → ₹85/);
    const j: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(j.totals).toMatchObject({ ok: 25, pending: 25 });
    expect(j.money.valuePaise).toBe(80000 + 127500);
  });
});
