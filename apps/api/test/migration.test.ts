import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createPrisma, prisma } from "@av/db";
import { isSettled, sumTotals } from "@av/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadJobs, summarizeJobItems } from "../src/services/jobs.js";

/**
 * Applies the real migration files to a scratch database: everything before challan_v2, then legacy-shaped
 * rows (integer quantities, qty-based sub bills, a main bill, free-text units, the old billing policy),
 * then challan_v2 – and checks that old data keeps its meaning.
 */
const MIGRATIONS = path.resolve(import.meta.dirname, "../../../packages/db/prisma/migrations");
const DB_NAME = `${new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1)}_migration`;
const V2 = "20261004170000_challan_v2";

function statements(file: string) {
  return readFileSync(path.join(MIGRATIONS, file, "migration.sql"), "utf8")
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

describe("migration of existing data to challan_v2", () => {
  const url = process.env.TEST_DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, `/${DB_NAME}$1`);
  let scratch: ReturnType<typeof createPrisma>;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE ${DB_NAME}`);
    scratch = createPrisma(url);
    const run = async (file: string) => {
      for (const s of statements(file)) await scratch.$executeRawUnsafe(s);
    };
    const all = readdirSync(MIGRATIONS).filter((f) => /^\d+_/.test(f)).sort();
    for (const f of all.filter((f) => f < V2)) await run(f);

    // ── Legacy data, exactly as the previous version stored it ──
    const sql = (s: string) => scratch.$executeRawUnsafe(s);
    await sql(`INSERT INTO "Settings" (id, "businessName", "billingPolicy", "updatedAt") VALUES (1, 'AV Creation', 'ON_COMPLETION', now())`);
    await sql(`INSERT INTO "Counter" (name, next) VALUES ('job', 3), ('return', 3), ('subBill', 3), ('mainBill', 2)`);
    await sql(`INSERT INTO "Client" (id, name, "createdAt", "updatedAt") VALUES ('c1', 'Ramesh', '2026-09-01', now()), ('c2', 'Suresh', '2026-09-02', now())`);
    await sql(`INSERT INTO "Product" (id, name, unit, "updatedAt") VALUES ('p1', 'Blouse', 'pcs', now()), ('p2', 'Fabric', 'm', now()), ('p3', 'Lace', 'yards', now())`);
    await sql(`INSERT INTO "Design" (id, name, "defaultRatePaise", "updatedAt") VALUES ('d1', 'Floral', 7000, now())`);
    await sql(`INSERT INTO "Job" (id, "jobNumber", "clientId", "productId", "jobDate", status, "updatedAt") VALUES
      ('j1', 'JOB-001', 'c1', 'p1', '2026-09-10', 'COMPLETED', now()),
      ('j2', 'JOB-002', 'c2', 'p2', '2026-09-12', 'PARTIALLY_RECEIVED', now())`);
    await sql(`INSERT INTO "JobItem" (id, "jobId", "designId", "designName", quantity, "ratePaise") VALUES
      ('i1', 'j1', 'd1', 'Floral', 10, 8000), ('i2', 'j2', 'd1', 'Floral', 100, 1500)`);
    await sql(`INSERT INTO "Dispatch" (id, "jobId", date, kind) VALUES ('dp1', 'j1', '2026-09-10', 'INITIAL'), ('dp2', 'j2', '2026-09-12', 'INITIAL')`);
    await sql(`INSERT INTO "DispatchLine" (id, "dispatchId", "jobItemId", qty) VALUES ('dl1', 'dp1', 'i1', 10), ('dl2', 'dp2', 'i2', 100)`);
    await sql(`INSERT INTO "Return" (id, "returnNumber", "jobId", date, "createdAt") VALUES
      ('r1', 'RET-001', 'j1', '2026-09-15', '2026-09-15 08:40:00'), ('r2', 'RET-002', 'j2', '2026-09-16', '2026-09-16 15:05:00')`);
    await sql(`INSERT INTO "ReturnLine" (id, "returnId", "jobItemId", "okQty", "damagedQty") VALUES ('rl1', 'r1', 'i1', 9, 1), ('rl2', 'r2', 'i2', 40, 0)`);
    await sql(`INSERT INTO "SubBill" (id, "billNumber", "clientId", "jobId", date, "amountPaise", method) VALUES
      ('sb1', 'SB-001', 'c1', 'j1', '2026-09-15', 72000, 'CASH'), ('sb2', 'SB-002', 'c2', 'j2', '2026-09-16', 30000, 'UPI')`);
    await sql(`INSERT INTO "SubBillLine" (id, "subBillId", "jobItemId", "designName", qty, "ratePaise", "amountPaise") VALUES
      ('sl1', 'sb1', 'i1', 'Floral', 9, 8000, 72000), ('sl2', 'sb2', 'i2', 'Floral', 20, 1500, 30000)`);
    await sql(`INSERT INTO "MainBill" (id, "billNumber", "jobId", "clientId", date, qty, "totalPaise", "updatedAt") VALUES ('mb1', 'MB-001', 'j1', 'c1', '2026-09-15', 9, 72000, now())`);

    await run(V2);
  });

  afterAll(async () => {
    await scratch?.$disconnect();
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  });

  it("gives every existing return its challan rate and keeps its time", async () => {
    const lines = await scratch.returnLine.findMany({ orderBy: { id: "asc" } });
    expect(lines.map((l) => l.ratePaise)).toEqual([8000, 1500]);
    const r = await scratch.return.findUniqueOrThrow({ where: { id: "r2" } });
    expect(r.receivedAt.toISOString()).toBe(r.createdAt.toISOString());
    expect(r.date.toISOString().slice(0, 10)).toBe("2026-09-16");
    expect(await scratch.returnPhoto.count()).toBe(0); // no photos are fabricated
  });

  it("keeps quantities, payments and the final settlement", async () => {
    const [j1, j2] = (await loadJobs(scratch, {})).sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
    const t1 = sumTotals(summarizeJobItems(j1));
    expect(t1).toMatchObject({ quantity: 10, sent: 10, ok: 9, damaged: 1, pending: 0, completedValuePaise: 72000, billedQty: 9 });
    expect(j1.agg.paidPaise).toBe(72000);
    expect(isSettled("COMPLETED", t1.completedValuePaise, j1.agg.paidPaise)).toBe(true);
    const t2 = sumTotals(summarizeJobItems(j2));
    expect(t2).toMatchObject({ sent: 100, ok: 40, pending: 60, completedValuePaise: 60000 });
    expect(j2.agg.paidPaise).toBe(30000);
    const mb = await scratch.mainBill.findUniqueOrThrow({ where: { id: "mb1" } });
    expect(mb.totalPaise).toBe(72000);
    expect(mb.cancelledAt).toBeNull();
    const sb = await scratch.subBill.findMany({ orderBy: { billNumber: "asc" } });
    expect(sb.map((b) => [b.billNumber, b.amountPaise, b.method])).toEqual([["SB-001", 72000, "CASH"], ["SB-002", 30000, "UPI"]]);
  });

  it("maps units, payment policy and adds codes and QR tokens", async () => {
    const products = await scratch.product.findMany({ orderBy: { id: "asc" } });
    expect(products.map((p) => p.unit)).toEqual(["PCS", "MTR", "PCS"]);
    expect(await scratch.auditLog.count({ where: { entity: "Product", entityId: "p3" } })).toBe(1); // "yards" flagged
    expect((await scratch.settings.findUniqueOrThrow({ where: { id: 1 } })).defaultPaymentPolicy).toBe("AFTER_COMPLETION");
    const clients = await scratch.client.findMany({ orderBy: { createdAt: "asc" } });
    expect(clients.map((c) => c.workerCode)).toEqual(["WK-0001", "WK-0002"]);
    expect((await scratch.counter.findUniqueOrThrow({ where: { name: "worker" } })).next).toBe(3);
    const jobs = await scratch.job.findMany();
    expect(jobs.every((j) => /^[0-9a-f]{64}$/.test(j.publicToken))).toBe(true);
    expect(new Set(jobs.map((j) => j.publicToken)).size).toBe(2);
    const items = await scratch.jobItem.findMany({ orderBy: { id: "asc" } });
    expect(items.map((i) => [i.unit, i.materialId])).toEqual([["PCS", null], ["MTR", null]]);
  });
});
