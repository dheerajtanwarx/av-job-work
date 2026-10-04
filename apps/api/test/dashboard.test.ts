import { prisma } from "@av/db";
import type { DashboardCharts, DashboardV2 } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loggedInAgent, resetDb } from "./helpers.js";
import { buildBook, NOW } from "./report-fixtures.js";

let api: TestAgent;
let book: Awaited<ReturnType<typeof buildBook>>;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  await resetDb();
  api = await loggedInAgent();
  book = await buildBook(api);
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.$disconnect();
});

describe("GET /dashboard", () => {
  let d: DashboardV2;
  beforeAll(async () => {
    d = (await api.get("/dashboard").expect(200)).body;
  });

  it("keeps the existing figures", () => {
    expect(d.today).toBe("2026-10-09");
    expect(d.money).toEqual({ completedValuePaise: 861600, paidPaise: 400000, toPayPaise: 521000 });
    expect(d.ops).toMatchObject({ activeJobs: 2, draftJobs: 0, piecesOutside: 329.5, overdueJobs: 1, clientsWithPending: 2 });
    expect(d.toPay).toEqual([{ clientId: book.asha, clientName: "Asha Embroidery", qty: 2, valuePaise: 521000 }]);
    expect(d.overdue.map((j) => j.id)).toEqual([book.j1.id]);
    expect(d.designsPending.map((x) => [x.designName, x.pending])).toEqual([
      ["Block", 299.5],
      ["Floral", 30],
    ]);
  });

  it("KPI cards: material per unit (never MTR + PCS), values, outstanding and overdue", () => {
    expect(d.kpis).toEqual({
      activeWorkers: 2,
      activeChallans: 2,
      materialOutside: [
        { unit: "MTR", qty: 299.5 },
        { unit: "PCS", qty: 30 },
      ],
      materialValueOutsidePaise: 30 * 8000 + 299.5 * 1000,
      workValuePaise: 861600,
      paidPaise: 400000,
      outstandingPaise: 521000,
      advancePaise: 59400,
      overduePayments: { amountPaise: 380000, count: 1 },
      overdueChallans: 1,
    });
  });

  it("attention required: every item counted, labelled and linked to the record", () => {
    const by = Object.fromEntries(d.attention.map((a) => [a.kind, a]));
    expect(Object.keys(by).sort()).toEqual(["advances", "expected-today", "long-held-material", "overdue-challans", "overdue-payments", "payments-due-today", "quantity-mismatch"]);
    expect(by["overdue-challans"]).toMatchObject({ count: 1, href: `/jobs/${book.j1.id}`, tone: "danger" });
    expect(by["overdue-payments"]).toMatchObject({ count: 1, amountPaise: 380000, href: `/returns/${book.r1.id}` });
    expect(by["overdue-payments"].records[0].sub).toMatch(/^7 days overdue/);
    expect(by["payments-due-today"]).toMatchObject({ count: 1, amountPaise: 45000, href: `/returns/${book.r2.id}` });
    expect(by["long-held-material"]).toMatchObject({ count: 1, href: `/clients/${book.asha}` });
    expect(by["expected-today"]).toMatchObject({ count: 1, href: `/jobs/${book.j2.id}` });
    expect(by["quantity-mismatch"]).toMatchObject({ count: 1, href: `/jobs/${book.j3.id}` });
    expect(by["quantity-mismatch"].records[0].sub).toContain("2 PCS over");
    expect(by.advances).toMatchObject({ count: 1, amountPaise: 59400, href: `/jobs/${book.j2.id}` });
    for (const a of d.attention) expect(a.label.length).toBeGreaterThan(5);
  });

  it("who has my material: worker × material with age, value and status", () => {
    expect(d.materialHolders).toEqual([
      {
        clientId: book.asha,
        clientName: "Asha Embroidery",
        materialId: book.blanks,
        materialName: "Saree blanks",
        unit: "PCS",
        qty: 30,
        challans: 1,
        overdueChallans: 1,
        oldestIssueDate: "2026-09-01",
        daysOutside: 38,
        valuePaise: 240000,
        status: "OVERDUE",
      },
      expect.objectContaining({ clientId: book.bharat, materialId: book.cotton, unit: "MTR", qty: 299.5, daysOutside: 4, valuePaise: 299500, status: "OK" }),
    ]);
  });

  it("today's returns: who brought material today, with time, rate and amount", () => {
    expect(d.todayReturns).toHaveLength(1);
    expect(d.todayReturns[0]).toMatchObject({
      returnId: book.r3.id,
      client: { id: book.bharat, name: "Bharat Prints" },
      job: { id: book.j2.id },
      designName: "Block",
      unit: "MTR",
      qty: 200.5,
      ratePaise: 1200,
      valuePaise: 240600,
      photoId: null,
    });
    expect(d.todayReturns[0].receivedAt).toBe(NOW.toISOString());
  });

  it("a date range scopes work value and payments, not positions", async () => {
    const r: DashboardV2 = (await api.get("/dashboard?from=2026-10-01&to=2026-10-31").expect(200)).body;
    expect(r.kpis.workValuePaise).toBe(45000 + 240600 + 96000);
    expect(r.kpis.paidPaise).toBe(400000);
    expect(r.kpis.outstandingPaise).toBe(521000);
    expect(r.range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    await api.get("/dashboard?from=yesterday").expect(422);
  });

  it("a voided return drops out of every figure", async () => {
    await api.post(`/returns/${book.r2.id}/void`).send({ reason: "Entered twice" }).expect((res) => expect([200, 201]).toContain(res.status));
    const r: DashboardV2 = (await api.get("/dashboard").expect(200)).body;
    expect(r.money.completedValuePaise).toBe(861600 - 45000);
    expect(r.attention.find((a) => a.kind === "payments-due-today")).toBeUndefined();
    expect(r.kpis.materialOutside.find((m) => m.unit === "PCS")?.qty).toBe(35);
  });
});

describe("GET /dashboard/charts", () => {
  let c: DashboardCharts;
  beforeAll(async () => {
    c = (await api.get("/dashboard/charts?from=2026-09-01&to=2026-10-31").expect(200)).body;
  });

  it("material issued vs returned vs pending per unit", () => {
    expect(c.materialFlow.find((m) => m.unit === "PCS")).toEqual({ unit: "PCS", issued: 110, returned: 72, exceptions: 5, pending: 35 });
    expect(c.materialFlow.find((m) => m.unit === "MTR")).toEqual({ unit: "MTR", issued: 500, returned: 200.5, exceptions: 0, pending: 299.5 });
  });

  it("monthly work and payments, every month in the range", () => {
    expect(c.monthlyWork).toEqual([
      { month: "2026-09", valuePaise: 480000 },
      { month: "2026-10", valuePaise: 96000 + 240600 },
    ]);
    expect(c.monthlyPayments).toEqual([
      { month: "2026-09", paidPaise: 0 },
      { month: "2026-10", paidPaise: 400000 },
    ]);
  });

  it("worker outstanding and pending material", () => {
    expect(c.workerOutstanding).toEqual([{ clientId: book.asha, clientName: "Asha Embroidery", outstandingPaise: 480000 + 96000 - 100000 }]);
    expect(c.workerPending.map((w) => [w.clientName, w.unit, w.pending])).toEqual([
      ["Bharat Prints", "MTR", 299.5],
      ["Asha Embroidery", "PCS", 35],
    ]);
  });

  it("challan aging buckets", () => {
    const by = Object.fromEntries(c.challanAging.map((a) => [a.bucket, a]));
    expect(c.challanAging.map((a) => a.bucket)).toEqual(["0-3", "4-7", "8-15", "16-30", "30+"]);
    expect(by["30+"]).toMatchObject({ challans: 1, pending: [{ unit: "PCS", qty: 35 }], valuePaise: 280000 });
    expect(by["4-7"]).toMatchObject({ challans: 1, pending: [{ unit: "MTR", qty: 299.5 }] });
    expect(by["0-3"].challans).toBe(0);
  });

  it("completion days, defect / rejection %, value by design and job work type", () => {
    expect(c.completionDays).toEqual([{ clientId: book.asha, clientName: "Asha Embroidery", avgDays: 0, challans: 1 }]);
    const asha = c.defects.find((x) => x.clientId === book.asha)!;
    expect(asha).toMatchObject({ accounted: 77, defectPct: 6.5, rejectionPct: 0 });
    expect(c.byDesign).toEqual([
      { designId: book.floral, designName: "Floral", valuePaise: 576000 },
      { designId: book.block, designName: "Block", valuePaise: 240600 },
    ]);
    expect(c.byJobWorkType).toEqual([
      { jobWorkTypeId: book.jwt, name: "Embroidery", valuePaise: 576000 },
      { jobWorkTypeId: null, name: "No job work type", valuePaise: 240600 },
    ]);
  });
});
