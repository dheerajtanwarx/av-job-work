import { prisma } from "@av/db";
import { REPORTS, type ReportResult, type ReportRow, type SearchResultsV2 } from "@av/shared";
import ExcelJS from "exceljs";
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

const report = async (path: string): Promise<ReportResult> => (await api.get(path).expect(200)).body;
const sumOf = (rows: ReportRow[], key: string) => rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);

/** Raw response body (supertest doesn't buffer binary types by default). */
const binary = (path: string) =>
  api
    .get(path)
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });

describe("report catalogue", () => {
  it("every new report answers JSON, CSV and Excel, with totals equal to the sum of its rows", async () => {
    const needs: Record<string, string> = { "worker-ledger": `clientId=${book.asha}`, "challan-ledger": `jobId=${book.j1.id}` };
    for (const meta of REPORTS.filter((r) => !r.legacy)) {
      const qs = needs[meta.id] ?? "";
      const r = await report(`/reports/${meta.id}?${qs}`);
      expect(r.id).toBe(meta.id);
      expect(r.columns.length).toBeGreaterThan(2);
      expect(r.rows.length).toBe(Math.min(r.total, r.take));
      for (const c of r.columns.filter((c) => c.total === "sum")) {
        const t = r.totals[c.key];
        if (t === null) {
          // Mixed units: each unit is totalled separately instead.
          expect(r.totalsByUnit.length).toBeGreaterThan(1);
          continue;
        }
        if (r.total <= r.take) expect(t, `${meta.id}.${c.key}`).toBeCloseTo(sumOf(r.rows, c.key), 3);
      }
      const csv = await api.get(`/reports/${meta.id}?format=csv&${qs}`).expect(200);
      expect(csv.headers["content-type"]).toMatch(/text\/csv/);
      expect(csv.headers["content-disposition"]).toMatch(new RegExp(`attachment; filename="${meta.id}.*\\.csv"`));
      expect(csv.text.split("\n")[0]).toContain(r.columns[0].header);
      const x = await binary(`/reports/${meta.id}?format=xlsx&${qs}`).expect(200);
      expect(x.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(x.headers["content-disposition"]).toMatch(/\.xlsx"$/);
      expect((x.body as Buffer).subarray(0, 2).toString()).toBe("PK"); // a zip, i.e. a real workbook
    }
  });

  it("legacy reports keep their JSON and gain Excel export", async () => {
    for (const id of ["pending-material", "client-summary", "payments", "to-pay"]) {
      const x = await binary(`/reports/${id}?format=xlsx`).expect(200);
      expect(x.headers["content-type"]).toMatch(/spreadsheetml/);
    }
    const pm = (await api.get("/reports/pending-material").expect(200)).body;
    expect(pm.totals.pending).toBe(329.5);
    expect(pm.rows.map((r: { jobNumber: string }) => r.jobNumber).sort()).toEqual([book.j1.jobNumber, book.j2.jobNumber].sort());
  });

  it("unknown reports 404, ledgers need their worker / challan, bad dates 422", async () => {
    await api.get("/reports/nope").expect(404);
    await api.get("/reports/worker-ledger").expect(422);
    await api.get("/reports/challan-ledger").expect(422);
    await api.get("/reports/rate-history?from=09-10-2026").expect(422);
  });

  it("the Excel file has a bold header, rupee number formats and a totals row", async () => {
    const x = await binary(`/reports/payment-outstanding?format=xlsx`).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body as never);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).font?.bold).toBe(true);
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    const outCol = headers.indexOf("Outstanding") + 1;
    expect(outCol).toBeGreaterThan(0);
    expect(ws.getRow(2).getCell(outCol).numFmt).toContain("₹");
    const last = ws.getRow(ws.rowCount);
    expect(last.getCell(1).value).toBe("Total");
    expect(last.font?.bold).toBe(true);
    expect(last.getCell(outCol).value).toBe(5210); // rupees
    expect(ws.getColumn(2).width).toBeGreaterThan(8);
  });
});

describe("rate history (§50)", () => {
  it("lists every non-voided return line with worker, design, challan, return, date, rate, qty and amount", async () => {
    const r = await report("/reports/rate-history");
    expect(r.total).toBe(4);
    expect(r.rows.map((x) => [x.returnNumber, x.designName, x.ratePaise, x.payableQty, x.valuePaise])).toEqual([
      [book.r3.returnNumber, "Block", 1200, 200.5, 240600],
      [book.r4.returnNumber, "Floral", 8000, 12, 96000],
      [book.r2.returnNumber, "Floral", 9000, 5, 45000],
      [book.r1.returnNumber, "Floral", 8000, 60, 480000],
    ]);
    expect(r.rows[2]).toMatchObject({ clientName: "Asha Embroidery", jobNumber: book.j1.jobNumber, date: "2026-10-02", challanRatePaise: 8000 });
    expect(r.totals.valuePaise).toBe(861600);
    expect(r.totals.payableQty).toBeNull(); // PCS and MTR are never added together
    expect(r.totalsByUnit).toEqual(
      expect.arrayContaining([
        { unit: "PCS", values: expect.objectContaining({ payableQty: 77 }) },
        { unit: "MTR", values: expect.objectContaining({ payableQty: 200.5 }) },
      ]),
    );
  });

  it("filters by worker, design and date, and pages on the server with totals over the full set", async () => {
    const asha = await report(`/reports/rate-history?clientId=${book.asha}&designId=${book.floral}&from=2026-09-01&to=2026-10-05`);
    expect(asha.rows.map((x) => x.returnNumber)).toEqual([book.r2.returnNumber, book.r1.returnNumber]);
    const page = await report("/reports/rate-history?take=1&skip=1");
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].returnNumber).toBe(book.r4.returnNumber);
    expect(page.total).toBe(4);
    expect(page.totals.valuePaise).toBe(861600);
    const csv = await api.get("/reports/rate-history?format=csv").expect(200);
    const lines = csv.text.trim().split("\n");
    expect(lines).toHaveLength(1 + 4 + 1);
    expect(lines[0]).toContain("Rate (Rs)");
    expect(lines.at(-1)).toMatch(/^Total,.*8616\.00/);
  });
});

describe("arrivals, aging and money reports", () => {
  it("today's returns default to today, latest first; any day can be asked for", async () => {
    const today = await report("/reports/arrivals");
    expect(today.rows.map((x) => x.returnNumber)).toEqual([book.r3.returnNumber]);
    expect(today.rows[0]).toMatchObject({ clientName: "Bharat Prints", designName: "Block", qty: 200.5, ratePaise: 1200, valuePaise: 240600, receivedAt: NOW.toISOString() });
    const oct8 = await report("/reports/arrivals?date=2026-10-08");
    expect(oct8.rows.map((x) => x.returnNumber)).toEqual([book.r4.returnNumber]);
  });

  it("payment aging puts each unpaid return in its due-date bucket", async () => {
    const r = await report("/reports/payment-aging");
    const by = Object.fromEntries(r.rows.map((x) => [x.returnNumber as string, x]));
    expect(by[book.r1.returnNumber]).toMatchObject({ outstandingPaise: 380000, dueDate: "2026-10-02", overdueDays: 7, bucket: "1-7" });
    expect(by[book.r2.returnNumber]).toMatchObject({ outstandingPaise: 45000, dueDate: "2026-10-09", overdueDays: 0, bucket: "DUE_TODAY" });
    expect(by[book.r4.returnNumber]).toMatchObject({ outstandingPaise: 96000, dueDate: "2026-10-15", bucket: "NOT_DUE" });
    expect(by[book.r3.returnNumber]).toBeUndefined(); // fully paid
    expect(r.totals.outstandingPaise).toBe(521000);
    const summary = Object.fromEntries(r.summary.map((s) => [s.label, s.value]));
    expect(summary).toMatchObject({ "1–7 days overdue": 380000, "Due today": 45000, "Not due yet": 96000, "30+ days overdue": 0 });
  });

  it("payment outstanding shows work, paid, outstanding, advance and overdue per challan", async () => {
    const r = await report("/reports/payment-outstanding");
    const by = Object.fromEntries(r.rows.map((x) => [x.jobNumber as string, x]));
    expect(by[book.j1.jobNumber]).toMatchObject({ valuePaise: 525000, paidPaise: 100000, outstandingPaise: 425000, advancePaise: 0, overduePaise: 380000 });
    expect(by[book.j2.jobNumber]).toMatchObject({ valuePaise: 240600, paidPaise: 300000, outstandingPaise: 0, advancePaise: 59400 });
    expect(r.totals).toMatchObject({ outstandingPaise: 521000, advancePaise: 59400, overduePaise: 380000 });
  });

  it("challan aging: days since issue, bucket and pending", async () => {
    const r = await report("/reports/challan-aging");
    expect(r.rows.map((x) => [x.jobNumber, x.daysOut, x.bucket, x.pending, x.unit])).toEqual([
      [book.j1.jobNumber, 38, "30+", 30, "PCS"],
      [book.j2.jobNumber, 4, "4-7", 299.5, "MTR"],
    ]);
    expect(r.rows[0].status).toContain("Overdue");
    expect(r.totals.pending).toBeNull();
    const overdue = await report("/reports/challan-aging?status=OVERDUE");
    expect(overdue.rows.map((x) => x.jobNumber)).toEqual([book.j1.jobNumber]);
  });

  it("material outside and worker material position", async () => {
    const out = await report("/reports/material-outside");
    expect(out.rows.map((x) => [x.clientName, x.materialName, x.qty, x.status])).toEqual([
      ["Asha Embroidery", "Saree blanks", 30, "Overdue"],
      ["Bharat Prints", "Cotton roll", 299.5, "OK"],
    ]);
    expect(out.totals.valuePaise).toBe(240000 + 299500);
    const pos = await report(`/reports/worker-material?clientId=${book.asha}`);
    expect(pos.rows).toHaveLength(1);
    expect(pos.rows[0]).toMatchObject({ issued: 110, returned: 77, damaged: 5, pending: 30, challans: 2 });
    expect(pos.totals.pending).toBe(30);
  });

  it("material stock per material", async () => {
    const r = await report(`/reports/material-stock?materialId=${book.blanks}`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ name: "Saree blanks", available: 1000 - 110 + 77, withWorkers: 110 - 82, damagedHeld: 5 });
  });

  it("job work by design and worker, completion time, defect / rejection", async () => {
    const design = await report("/reports/job-work-by-design?from=2026-09-01&to=2026-10-31");
    expect(design.rows.map((x) => [x.name, x.unit, x.valuePaise, x.pending])).toEqual([
      ["Floral", "PCS", 621000, 30],
      ["Block", "MTR", 240600, 299.5],
    ]);
    const sept = await report("/reports/job-work-by-worker?from=2026-09-01&to=2026-09-30");
    expect(sept.rows.map((x) => [x.name, x.challans, x.valuePaise])).toEqual([["Asha Embroidery", 1, 525000]]);
    const ct = await report("/reports/completion-time");
    expect(ct.rows.find((x) => x.jobNumber === book.j3.jobNumber)).toMatchObject({ daysToFirst: 0, daysToComplete: 0 });
    expect(ct.rows.find((x) => x.jobNumber === book.j1.jobNumber)).toMatchObject({ daysToFirst: 24, daysToComplete: null });
    const dr = await report("/reports/defect-rejection");
    expect(dr.rows.find((x) => x.name === "Asha Embroidery")).toMatchObject({ accounted: 82, damaged: 5, defectPct: 6.1, rejectionPct: 0 });
  });

  it("worker and challan ledgers", async () => {
    const wl = await report(`/reports/worker-ledger?clientId=${book.asha}`);
    expect(wl.rows.at(-1)?.balancePaise).toBe(521000);
    expect(wl.totals).toMatchObject({ debitPaise: 621000, creditPaise: 100000 });
    const cl = await report(`/reports/challan-ledger?jobId=${book.j1.id}`);
    expect(cl.rows.map((x) => x.balancePaise)).toEqual([480000, 525000, 425000]);
  });
});

describe("GET /search", () => {
  const s = async (q: string): Promise<SearchResultsV2> => (await api.get(`/search?q=${encodeURIComponent(q)}`).expect(200)).body;

  it("finds vouchers and returns by amount", async () => {
    const byVoucher = await s("₹3,000");
    expect(byVoucher.matchedAmountPaise).toBe(300000);
    expect(byVoucher.bills.map((b) => b.amountPaise)).toContain(300000);
    const byReturn = await s("2406");
    expect(byReturn.returns.map((r) => r.id)).toEqual([book.r3.id]);
    expect((await s("1000")).bills.map((b) => b.billNumber)).toContain(book.v1.billNumber);
  });

  it("finds returns by number, materials by lot, vouchers by reference, workers by phone", async () => {
    expect((await s(book.r4.returnNumber)).returns.map((r) => r.id)).toEqual([book.r4.id]);
    expect((await s("lot-77")).materials.map((m) => m.id)).toEqual([book.blanks]);
    expect((await s("UPI-REF")).bills.map((b) => b.id)).toEqual([book.v1.id]);
    expect((await s("98765 00002")).clients.map((c) => c.id)).toEqual([book.bharat]);
  });

  it("finds returns and challans by date", async () => {
    const r = await s("25 Sep 2026");
    expect(r.matchedDate).toBe("2026-09-25");
    expect(r.returns.map((x) => x.id)).toEqual([book.r1.id]);
    expect((await s("01/09/2026")).jobs.map((j) => j.id)).toEqual([book.j1.id]);
  });
});
