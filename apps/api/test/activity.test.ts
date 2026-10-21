import { db } from "@av/db";
import type { ActivityFolders, ActivityRow, JobDetail, UnpaidLine } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { beforeAll, describe, expect, it } from "vitest";
import { agentAs, loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

describe("activity monitor", () => {
  let api: TestAgent;
  let clientId: string;
  let otherClientId: string;
  let job: JobDetail;

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    clientId = (await api.post("/clients").send({ name: "Sharma Embroidery" }).expect(201)).body.id;
    otherClientId = (await api.post("/clients").send({ name: "Verma Stitching" }).expect(201)).body.id;
    const productId = (await api.post("/products").send({ name: "Plain Blouse", unit: "pcs" }).expect(201)).body.id;
    const materialId = await stockedMaterial(api);
    const designId = (await api.post("/designs").send({ name: "Floral", defaultRatePaise: 2000 }).expect(201)).body.id;
    job = (
      await api
        .post("/jobs")
        .send({ clientId, productId, jobDate: "2026-10-04", dispatchNow: true, items: [{ designId, materialId, quantity: 20, ratePaise: 2000 }] })
        .expect(201)
    ).body;
    await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-05", lines: [{ jobItemId: job.items[0]!.id, okQty: 10 }] }).expect(201);
    const unpaid: UnpaidLine[] = (await api.get(`/bills/unpaid?jobId=${job.id}`).expect(200)).body;
    await api
      .post("/sub-bills")
      .send({ jobId: job.id, date: "2026-10-05", method: "CASH", lines: unpaid.map((u) => ({ jobItemId: u.jobItemId, qty: u.unbilledQty })) })
      .expect(201);
  });

  it("tags challan, issue, return and payment entries with their job worker", async () => {
    const rows = await db.auditLog.find({ entity: { $in: ["Job", "Dispatch", "Return", "SubBill"] } });
    expect(new Set(rows.map((r) => r.entity))).toEqual(new Set(["Job", "Dispatch", "Return", "SubBill"]));
    for (const r of rows) expect(r).toMatchObject({ clientId, jobId: job.id });
    const worker = await db.auditLog.findOne({ entity: "Client", entityId: clientId });
    expect(worker).toMatchObject({ clientId, jobId: null });
  });

  it("counts every folder by type and by job worker", async () => {
    const f: ActivityFolders = (await api.get("/activity/folders").expect(200)).body;
    const count = (key: string) => f.types.find((t) => t.key === key)!.count;
    expect(count("workers")).toBe(2);
    expect(count("challans")).toBeGreaterThanOrEqual(1);
    expect(count("issues")).toBe(1);
    expect(count("returns")).toBe(1);
    expect(count("payments")).toBe(1);
    expect(count("team")).toBeGreaterThanOrEqual(1); // the owner's sign-in
    expect(f.total).toBeGreaterThanOrEqual(f.types.reduce((s, t) => s + t.count, 0));
    const mine = f.workers.find((w) => w.clientId === clientId)!;
    expect(mine).toMatchObject({ name: "Sharma Embroidery" });
    expect(mine.count).toBeGreaterThanOrEqual(5);
    expect(f.workers.find((w) => w.clientId === otherClientId)?.count).toBe(1);
  });

  it("lists one folder, one job worker, or a search", async () => {
    const issues: ActivityRow[] = (await api.get("/activity?folder=issues").expect(200)).body.rows;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ entityLabel: "Material issue", href: `/jobs/${job.id}`, jobNumber: job.jobNumber, worker: { id: clientId, name: "Sharma Embroidery" } });

    const worker: ActivityRow[] = (await api.get(`/activity?clientId=${otherClientId}`).expect(200)).body.rows;
    expect(worker.map((r) => r.entity)).toEqual(["Client"]);

    const found: ActivityRow[] = (await api.get("/activity?q=verma").expect(200)).body.rows;
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((r) => /verma/i.test(r.summary ?? ""))).toBe(true);
  });

  it("records sign-ins", async () => {
    await agentAs("sub@example.com", "SUB_OWNER", "Sunil");
    const team: ActivityRow[] = (await api.get("/activity?folder=team").expect(200)).body.rows;
    expect(team.find((r) => r.action === "login" && r.user === "Sunil")?.summary).toBe("Sunil signed in (password, web)");
  });
});
