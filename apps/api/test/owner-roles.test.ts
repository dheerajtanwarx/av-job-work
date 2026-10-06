import { prisma } from "@av/db";
import type { ChangeLogRow, Design, JobDetail, SubBillDetail, UserRow } from "@av/shared";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { agentAs, resetDb, stockedMaterial } from "./helpers.js";

let owner: TestAgent;
let sub: TestAgent;
let clientId: string;
let productId: string;
let designId: string;
let materialId: string;

beforeAll(async () => {
  await resetDb();
  owner = await agentAs("owner@example.com", "OWNER", "Anil");
  sub = await agentAs("sub@example.com", "SUB_OWNER", "Sunil");
  clientId = (await owner.post("/clients").send({ name: "Ramesh" }).expect(201)).body.id;
  productId = (await owner.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id;
  designId = (await owner.post("/designs").send({ name: "Floral", defaultRatePaise: 5000 }).expect(201)).body.id;
  materialId = await stockedMaterial(owner, "Saree lot");
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A challan of 10 sent, 10 back OK at ₹50 = ₹500 of work. */
async function workedChallan(by: TestAgent = sub) {
  const job: JobDetail = (
    await by.post("/jobs").send({ clientId, productId, jobDate: "2026-10-01", dispatchNow: true, items: [{ designId, materialId, quantity: 10, ratePaise: 5000 }] }).expect(201)
  ).body;
  await by.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: job.items[0].id, okQty: 10 }] }).expect(201);
  return job;
}

describe("users (owner only)", () => {
  it("the owner adds a sub-owner, who can log in", async () => {
    const u: UserRow = (await owner.post("/users").send({ name: "Mohan", email: "Mohan@Example.com", password: "longenough", role: "SUB_OWNER" }).expect(201)).body;
    expect(u).toMatchObject({ name: "Mohan", email: "mohan@example.com", role: "SUB_OWNER", disabled: false });
    await request(createApp()).post("/auth/login").send({ email: "mohan@example.com", password: "longenough" }).expect(200);
    await owner.post("/users").send({ name: "Again", email: "mohan@example.com", password: "longenough", role: "OWNER" }).expect(422);
    await owner.post("/users").send({ name: "Short", email: "short@example.com", password: "123", role: "OWNER" }).expect(422);
    await sub.post("/users").send({ name: "X", email: "x@example.com", password: "longenough", role: "OWNER" }).expect(403);
  });

  it("a role change applies on the next request, without logging in again", async () => {
    const mohan = request.agent(createApp());
    await mohan.post("/auth/login").send({ email: "mohan@example.com", password: "longenough" }).expect(200);
    await mohan.get("/users").expect(403);
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: "mohan@example.com" } })).id;
    await owner.patch(`/users/${id}`).send({ role: "OWNER" }).expect(200);
    await mohan.get("/users").expect(200);
    expect((await mohan.get("/auth/me").expect(200)).body.user.role).toBe("OWNER");
    await owner.patch(`/users/${id}`).send({ role: "SUB_OWNER" }).expect(200);
  });

  it("turning access off ends the session and blocks login; the name stays in history", async () => {
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: "mohan@example.com" } })).id;
    const mohan = request.agent(createApp());
    await mohan.post("/auth/login").send({ email: "mohan@example.com", password: "longenough" }).expect(200);
    await owner.patch(`/users/${id}`).send({ disabled: true }).expect(200);
    await mohan.get("/clients").expect(401);
    await request(createApp()).post("/auth/login").send({ email: "mohan@example.com", password: "longenough" }).expect(403);
    const list: UserRow[] = (await owner.get("/users").expect(200)).body;
    expect(list.find((u) => u.id === id)?.disabled).toBe(true);
  });

  it("always keeps one owner who can log in", async () => {
    const me = (await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } })).id;
    const res = await owner.patch(`/users/${me}`).send({ role: "SUB_OWNER" }).expect(422);
    expect(res.body.message).toMatch(/only owner/i);
    await owner.patch(`/users/${me}`).send({ disabled: true }).expect(422);
  });

  it("the owner resets a password", async () => {
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: "sub@example.com" } })).id;
    await owner.patch(`/users/${id}`).send({ password: "brand-new-pass" }).expect(200);
    await request(createApp()).post("/auth/login").send({ email: "sub@example.com", password: "brand-new-pass" }).expect(200);
  });
});

describe("payments: sub-owners record, only the owner changes", () => {
  let job: JobDetail;
  let voucher: SubBillDetail;

  beforeAll(async () => {
    job = await workedChallan();
    voucher = (await sub.post("/sub-bills").send({ jobId: job.id, date: "2026-10-03", method: "CASH", amountPaise: 30000 }).expect(201)).body;
    expect(voucher.enteredBy).toBe("Sunil");
    expect(voucher.edited).toBeNull();
  });

  it("a sub-owner can't edit or void a payment", async () => {
    const res = await sub.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 1, reason: "typo fix" }).expect(403);
    expect(res.body.message).toMatch(/only the owner/i);
    await sub.post(`/sub-bills/${voucher.id}/void`).send({ reason: "wrong one" }).expect(403);
  });

  it("an edit needs a reason and a real change", async () => {
    await owner.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 35000 }).expect(422);
    await owner.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 30000, reason: "no change" }).expect(422);
  });

  it("the owner edits it: marked edited by them, with old → new in its history and on the challan", async () => {
    const b: SubBillDetail = (
      await owner.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 35000, method: "UPI", reference: "UPI-1", date: "2026-10-04", reason: "Entered the wrong amount" }).expect(200)
    ).body;
    expect(b.amountPaise).toBe(35000);
    expect(b.method).toBe("UPI");
    expect(b.reference).toBe("UPI-1");
    expect(b.date.slice(0, 10)).toBe("2026-10-04");
    expect(b.enteredBy).toBe("Sunil");
    expect(b.edited?.by).toBe("Anil");
    expect(b.challanMoney.outstandingPaise).toBe(15000);
    const h = b.history.find((x) => x.action === "update")!;
    expect(h.user).toBe("Anil");
    expect(h.reason).toBe("Entered the wrong amount");
    expect(h.summary).toContain("amount ₹300 → ₹350");
    expect(h.summary).toContain("method Cash → UPI");

    const list = (await sub.get(`/sub-bills?jobId=${job.id}`).expect(200)).body;
    expect(list[0].edited.by).toBe("Anil");
    const detail: JobDetail = (await sub.get(`/jobs/${job.id}`).expect(200)).body;
    const ev = detail.timeline.find((e) => e.type === "audit" && e.text.includes("edited"));
    expect(ev && ev.type === "audit" && ev.by).toBe("Anil");
  });

  it("raising it past what's payable needs an advance reason, and settles the challan when it covers everything", async () => {
    const res = await owner.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 60000, reason: "Paid more" }).expect(422);
    expect(res.body.details).toMatchObject({ outstandingPaise: 50000, needsAdvanceReason: true });
    const b: SubBillDetail = (await owner.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 50000, reason: "Paid in full" }).expect(200)).body;
    expect(b.challanMoney.outstandingPaise).toBe(0);
    expect(b.mainBill?.cancelled).toBe(false);
    // Back down: the final settlement is cancelled again.
    const c: SubBillDetail = (await owner.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 40000, reason: "Paid less" }).expect(200)).body;
    expect(c.mainBill?.cancelled).toBe(true);
  });

  it("voiding records who voided it", async () => {
    const b: SubBillDetail = (await owner.post(`/sub-bills/${voucher.id}/void`).send({ reason: "Duplicate entry" }).expect(200)).body;
    expect(b.voidedBy).toBe("Anil");
    await owner.patch(`/sub-bills/${voucher.id}`).send({ amountPaise: 100, reason: "too late" }).expect(422);
  });
});

describe("edited marks on other records", () => {
  it("masters show who last edited them", async () => {
    const before: Design[] = (await owner.get("/designs").expect(200)).body;
    expect(before.find((d) => d.id === designId)?.edited).toBeNull();
    const d: Design = (await sub.put(`/designs/${designId}`).send({ defaultRatePaise: 5500 }).expect(200)).body;
    expect(d.edited?.by).toBe("Sunil");
    expect(d).not.toHaveProperty("editedById");
    const w = (await sub.put(`/clients/${clientId}`).send({ phone: "9800000000" }).expect(200)).body;
    expect(w.edited.by).toBe("Sunil");
    expect((await owner.get(`/clients/${clientId}`).expect(200)).body.client.edited.by).toBe("Sunil");
  });

  it("a challan is marked edited only when something really changes", async () => {
    const job = await workedChallan(owner);
    expect(job.edited).toBeNull();
    const same: JobDetail = (await sub.patch(`/jobs/${job.id}`).send({ jobDate: "2026-10-01" }).expect(200)).body;
    expect(same.edited).toBeNull();
    const changed: JobDetail = (await sub.patch(`/jobs/${job.id}`).send({ notes: "Rush order" }).expect(200)).body;
    expect(changed.edited?.by).toBe("Sunil");
  });

  it("an edited return names its editor", async () => {
    const job = await workedChallan(owner);
    const r = job.id && (await owner.get(`/jobs/${job.id}`).expect(200)).body.returns[0];
    await sub.patch(`/returns/${r.id}`).send({ notes: "Checked twice", reason: "Added a note" }).expect(200);
    const rows = (await owner.get(`/jobs/${job.id}`).expect(200)).body.returns;
    expect(rows[0].editedBy).toBe("Sunil");
  });
});

describe("change log (owner only)", () => {
  it("lists changes newest first with who made them, once per change", async () => {
    const res = (await owner.get("/change-log?kind=edits").expect(200)).body as { rows: ChangeLogRow[]; more: boolean };
    const pay = res.rows.filter((r) => r.entity === "SubBill" && r.action === "update");
    expect(pay.length).toBeGreaterThan(0);
    expect(pay[0]).toMatchObject({ entityLabel: "Payment voucher", user: "Anil" });
    expect(pay[0].href).toMatch(/^\/bills\/sub\//);
    // The copy written on the challan is folded into the voucher's own entry.
    expect(res.rows.filter((r) => r.entity === "Job" && r.summary?.includes("edited: amount"))).toHaveLength(0);
    const all = (await owner.get("/change-log").expect(200)).body as { rows: ChangeLogRow[] };
    expect(all.rows.some((r) => r.entity === "User" && r.summary?.includes("added as Sub-owner"))).toBe(true);
    const times = all.rows.map((r) => r.at);
    expect([...times].sort().reverse()).toEqual(times);
  });
});
