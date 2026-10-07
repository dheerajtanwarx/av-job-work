import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "@av/db";
import type { JobDetail, PhotoPage, PhotoView, ReturnDetail, ReturnResult } from "@av/shared";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { assertKey } from "../src/lib/storage.js";
import { watermarkLines } from "../src/services/photos.js";
import { loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "av-photos-"));
process.env.UPLOAD_DIR = uploadDir;

let api: TestAgent;
let job: JobDetail;
let ret1: ReturnResult; // Floral 50 @ ₹80 + Paisley 20 @ ₹120
let ret2: ReturnResult; // Floral 30 @ ₹85
let ret1Detail: ReturnDetail;

const jpeg = (w = 64, h = 48, color = { r: 200, g: 40, b: 90 }) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();

async function agentWithRole(email: string, role: "OWNER" | "SUB_OWNER") {
  await db.user.create({ email, name: role, role, passwordHash: await bcrypt.hash("secret", 4) });
  const a = request.agent(createApp());
  await a.post("/auth/login").send({ email, password: "secret" }).expect(200);
  return a;
}

const upload = (returnId: string, files: { buf: Buffer; name: string; type: string }[], returnLineId?: string) => {
  let req = api.post(`/returns/${returnId}/photos`);
  for (const f of files) req = req.attach("photos", f.buf, { filename: f.name, contentType: f.type });
  if (returnLineId) req = req.field("returnLineId", returnLineId);
  return req;
};

beforeAll(async () => {
  await resetDb();
  api = await loggedInAgent();
  const product = (await api.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id;
  const client = (await api.post("/clients").send({ name: "Suresh" }).expect(201)).body.id;
  const floral = (await api.post("/designs").send({ name: "Floral", defaultRatePaise: 8000 }).expect(201)).body.id;
  const paisley = (await api.post("/designs").send({ name: "Paisley", defaultRatePaise: 12000 }).expect(201)).body.id;
  const materialId = await stockedMaterial(api);
  job = (
    await api
      .post("/jobs")
      .send({
        clientId: client,
        productId: product,
        jobDate: "2026-10-01",
        dispatchNow: true,
        items: [
          { designId: floral, materialId, quantity: 100, ratePaise: 8000 },
          { designId: paisley, materialId, quantity: 50, ratePaise: 12000 },
        ],
      })
      .expect(201)
  ).body;
  ret1 = (
    await api
      .post(`/jobs/${job.id}/returns`)
      .send({ date: "2026-10-02", lines: [{ jobItemId: job.items[0].id, okQty: 50 }, { jobItemId: job.items[1].id, okQty: 20 }] })
      .expect(201)
  ).body;
  ret2 = (await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-03", lines: [{ jobItemId: job.items[0].id, okQty: 30, ratePaise: 8500 }] }).expect(201)).body;
  ret1Detail = (await api.get(`/returns/${ret1.id}`).expect(200)).body;
});

afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
});

describe("upload", () => {
  it("stores the original untouched plus display copy and thumbnail, with server-side metadata", async () => {
    const big = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#3366aa" } }).jpeg({ quality: 90 }).toBuffer();
    const floralLine = ret1Detail.lines.find((l) => l.designName === "Floral")!;
    const before = Date.now();
    const res = await upload(ret1.id, [{ buf: big, name: "IMG_0001.JPG", type: "image/jpeg" }], floralLine.id).expect(201);
    const [p]: PhotoView[] = res.body;
    expect(p).toMatchObject({ returnId: ret1.id, returnLineId: floralLine.id, qty: 50, ratePaise: 8000, valuePaise: 400000, unit: "PCS", uploadedBy: "Test", originalName: "IMG_0001.JPG", width: 2400, height: 1200 });
    expect(p.design?.name).toBe("Floral");
    expect(new Date(p.uploadedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const original = await api.get(`/photos/${p.id}/original`).buffer(true).expect(200);
    expect(original.headers["content-type"]).toBe("image/jpeg");
    expect(original.headers["cache-control"]).toBe("private, max-age=86400");
    expect(Buffer.compare(original.body, big)).toBe(0);
    const display = await api.get(`/photos/${p.id}/display`).buffer(true).expect(200);
    expect((await sharp(display.body).metadata()).width).toBe(1600);
    const thumb = await api.get(`/photos/${p.id}/thumb`).buffer(true).expect(200);
    expect((await sharp(thumb.body).metadata()).width).toBe(320);

    // Keys are random, never the user's file name.
    const row = await db.returnPhoto.findOneOrThrow({ _id: p.id });
    expect(row.storageKey).toMatch(/^photos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\/original\.jpg$/);
    expect(row.meta).toMatchObject({ qty: 50, ratePaise: 8000, returnNumber: ret1.returnNumber });
    const log = await db.auditLog.findOne({ entity: "ReturnPhoto", entityId: p.id, action: "create" });
    expect(log?.after).toMatchObject({ returnId: ret1.id });
    // And the return's history picks it up.
    const detail: ReturnDetail = (await api.get(`/returns/${ret1.id}`).expect(200)).body;
    expect(detail.photos.map((x) => x.id)).toContain(p.id);
    expect(detail.history.some((h) => h.summary?.includes("photo"))).toBe(true);
  });

  it("a photo of the whole return with mixed rates shows the total and no single rate", async () => {
    const [p]: PhotoView[] = (await upload(ret1.id, [{ buf: await jpeg(), name: "all.png", type: "image/png" }]).expect(201)).body;
    expect(p).toMatchObject({ qty: 70, ratePaise: null, valuePaise: 50 * 8000 + 20 * 12000, design: null });
    // Real content decides the stored type (a JPEG named .png).
    expect((await api.get(`/photos/${p.id}/original`).expect(200)).headers["content-type"]).toBe("image/jpeg");
  });

  it("accepts several files at once and auto-fills the design of a single-line return", async () => {
    const res = await upload(ret2.id, [
      { buf: await jpeg(), name: "a.jpg", type: "image/jpeg" },
      { buf: await sharp({ create: { width: 40, height: 40, channels: 4, background: "#00ff0080" } }).png().toBuffer(), name: "b.png", type: "image/png" },
      { buf: await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ff0" } }).webp().toBuffer(), name: "c.webp", type: "image/webp" },
    ]).expect(201);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((p: PhotoView) => p.design?.name === "Floral" && p.ratePaise === 8500 && p.qty === 30)).toBe(true);
  });

  it("rejects bad types, fake images, oversize files and stray lines with clear messages", async () => {
    let r = await upload(ret2.id, [{ buf: Buffer.from("hello"), name: "notes.txt", type: "text/plain" }]).expect(422);
    expect(r.body.message).toMatch(/notes\.txt: text\/plain files can't be uploaded/);
    r = await upload(ret2.id, [{ buf: Buffer.from("definitely not a jpeg"), name: "fake.jpg", type: "image/jpeg" }]).expect(422);
    expect(r.body.message).toMatch(/fake\.jpg: this file isn't a readable image/);
    r = await upload(ret2.id, [{ buf: await jpeg(), name: "x.exe", type: "image/jpeg" }]).expect(422);
    expect(r.body.message).toMatch(/"\.exe" files/);
    // A real GIF is an image but not an accepted format.
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer();
    r = await upload(ret2.id, [{ buf: gif, name: "a.jpg", type: "image/jpeg" }]).expect(422);
    expect(r.body.message).toMatch(/gif images can't be uploaded/);
    r = await upload(ret2.id, [{ buf: Buffer.alloc(15 * 1024 * 1024 + 10, 1), name: "huge.jpg", type: "image/jpeg" }]).expect(422);
    expect(r.body.message).toMatch(/larger than 15 MB/);
    r = await upload(ret2.id, []).expect(422);
    expect(r.body.message).toMatch(/at least one photo/);
    // One good and one bad file: nothing is stored, the bad one is named.
    const count = await db.returnPhoto.count();
    r = await upload(ret2.id, [{ buf: await jpeg(), name: "good.jpg", type: "image/jpeg" }, { buf: Buffer.from("x"), name: "bad.jpg", type: "image/jpeg" }]).expect(422);
    expect(r.body.details.files).toEqual([{ index: 1, name: "bad.jpg", message: expect.stringMatching(/bad\.jpg/) }]);
    expect(await db.returnPhoto.count()).toBe(count);
    // A line from another return.
    r = await upload(ret2.id, [{ buf: await jpeg(), name: "a.jpg", type: "image/jpeg" }], ret1Detail.lines[0].id).expect(422);
    expect(r.body.message).toMatch(/doesn't belong to this return/);
    await upload("nope", [{ buf: await jpeg(), name: "a.jpg", type: "image/jpeg" }]).expect(404);
  });

  it("refuses photos on a voided return", async () => {
    const r: ReturnResult = (await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-04", lines: [{ jobItemId: job.items[0].id, okQty: 1 }] }).expect(201)).body;
    await api.post(`/returns/${r.id}/void`).send({ reason: "entered twice" }).expect(200);
    const res = await upload(r.id, [{ buf: await jpeg(), name: "a.jpg", type: "image/jpeg" }]).expect(422);
    expect(res.body.message).toMatch(/voided/);
  });
});

describe("gallery", () => {
  it("lists newest first with cursor pagination and filters", async () => {
    const all: PhotoPage = (await api.get("/photos").expect(200)).body;
    expect(all.rows).toHaveLength(5);
    expect(all.nextCursor).toBeNull();
    const times = all.rows.map((r) => r.uploadedAt);
    expect([...times].sort().reverse()).toEqual(times);

    const p1: PhotoPage = (await api.get("/photos?take=2").expect(200)).body;
    const p2: PhotoPage = (await api.get(`/photos?take=2&cursor=${p1.nextCursor}`).expect(200)).body;
    const p3: PhotoPage = (await api.get(`/photos?take=2&cursor=${p2.nextCursor}`).expect(200)).body;
    expect(p3.nextCursor).toBeNull();
    expect([...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id)).toEqual(all.rows.map((r) => r.id));

    const byReturn: PhotoPage = (await api.get(`/photos?returnId=${ret2.id}`).expect(200)).body;
    expect(byReturn.rows).toHaveLength(3);
    expect((await api.get(`/photos?jobId=${job.id}`).expect(200)).body.rows).toHaveLength(5);
    expect((await api.get(`/photos?clientId=${job.client.id}`).expect(200)).body.rows).toHaveLength(5);
    const paisley = job.items[1].designId;
    // The whole-return photo includes the Paisley line.
    expect((await api.get(`/photos?designId=${paisley}`).expect(200)).body.rows).toHaveLength(1);
    expect((await api.get("/photos?minRate=8500").expect(200)).body.rows).toHaveLength(4); // ret2 ×3 + whole ret1 (has ₹120)
    expect((await api.get("/photos?minRate=8100&maxRate=8600").expect(200)).body.rows).toHaveLength(3);
    expect((await api.get("/photos?from=2026-10-03&to=2026-10-03").expect(200)).body.rows).toHaveLength(3);
    expect((await api.get("/photos?to=2026-10-02").expect(200)).body.rows).toHaveLength(2);
    await api.get("/photos?minRate=abc").expect(422);
  });

  it("shows the live rate after an audited return edit", async () => {
    const line = ret1Detail.lines.find((l) => l.designName === "Floral")!;
    const other = ret1Detail.lines.find((l) => l.designName !== "Floral")!;
    await api
      .patch(`/returns/${ret1.id}`)
      .send({
        reason: "rate agreed later",
        lines: [
          { id: line.id, okQty: 50, damagedQty: 0, rejectedQty: 0, lostQty: 0, ratePaise: 9000 },
          { id: other.id, okQty: 20, damagedQty: 0, rejectedQty: 0, lostQty: 0, ratePaise: 12000 },
        ],
      })
      .expect(200);
    const rows: PhotoView[] = (await api.get(`/photos?returnId=${ret1.id}`).expect(200)).body.rows;
    const linePhoto = rows.find((r) => r.returnLineId === line.id)!;
    expect(linePhoto).toMatchObject({ ratePaise: 9000, valuePaise: 450000 });
    const single: PhotoView = (await api.get(`/photos/${linePhoto.id}`).expect(200)).body;
    expect(single.ratePaise).toBe(9000);
    // The snapshot still records what it was at upload.
    expect((await db.returnPhoto.findOneOrThrow({ _id: linePhoto.id })).meta).toMatchObject({ ratePaise: 8000 });
    // The line photo and the whole-return photo (which includes that line) both match the new rate.
    const at9000 = (await api.get("/photos?minRate=9000&maxRate=9000").expect(200)).body.rows.map((r: PhotoView) => r.id);
    expect(at9000).toHaveLength(2);
    expect(at9000).toContain(linePhoto.id);
    expect((await api.get("/photos?minRate=8000&maxRate=8000").expect(200)).body.rows).toHaveLength(0);
  });

  it("generates a watermarked share copy without touching the original", async () => {
    const [p]: PhotoView[] = (await api.get(`/photos?returnId=${ret2.id}&take=1`).expect(200)).body.rows;
    const before = (await api.get(`/photos/${p.id}/original`).buffer(true).expect(200)).body as Buffer;
    const res = await api.get(`/photos/${p.id}/share`).buffer(true).expect(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="JW-\d{4}_RET-\d+_[A-Za-z0-9]+\.jpg"$/);
    expect((await sharp(res.body).metadata()).format).toBe("jpeg");
    const after = (await api.get(`/photos/${p.id}/original`).buffer(true).expect(200)).body as Buffer;
    expect(Buffer.compare(before, after)).toBe(0);
    const text = watermarkLines(p, "AV Creation");
    expect(text.right).toEqual(["Qty: 30 PCS", "Rate: ₹85/PCS", expect.stringMatching(/^Time: \d{2}:\d{2} (AM|PM)$/)]);
    expect(text.left).toEqual([`Challan: ${job.jobNumber}`, `Return: ${ret2.returnNumber}`, "Date: 03-10-2026"]);
  });
});

describe("void / restore and access", () => {
  let manager: TestAgent;
  let photo: PhotoView;

  beforeAll(async () => {
    manager = await agentWithRole("sub@example.com", "SUB_OWNER");
    photo = (await api.get(`/photos?returnId=${ret2.id}&take=1`).expect(200)).body.rows[0];
  });

  it("a sub-owner can upload", async () => {
    const res = await manager.post(`/returns/${ret2.id}/photos`).attach("photos", await jpeg(), { filename: "c.jpg", contentType: "image/jpeg" }).expect(201);
    expect(res.body[0].uploadedBy).toBe("SUB_OWNER");
  });

  it("a sub-owner voids with a reason; the photo is hidden from lists but kept and recoverable by the owner", async () => {
    await manager.post(`/photos/${photo.id}/void`).send({ reason: "x" }).expect(422);
    const v: PhotoView = (await manager.post(`/photos/${photo.id}/void`).send({ reason: "blurry photo" }).expect(200)).body;
    expect(v.voidReason).toBe("blurry photo");
    expect(v.voidedAt).not.toBeNull();
    await manager.post(`/photos/${photo.id}/void`).send({ reason: "blurry photo" }).expect(422);

    // Not listed by default; still served and listed on request.
    await manager.get(`/photos/${photo.id}/original`).expect(200);
    expect((await manager.get(`/photos?returnId=${ret2.id}`).expect(200)).body.rows.map((r: PhotoView) => r.id)).not.toContain(photo.id);
    expect((await manager.get(`/photos?returnId=${ret2.id}&includeVoided=true`).expect(200)).body.rows.map((r: PhotoView) => r.id)).toContain(photo.id);
    expect(await db.returnPhoto.count({ _id: photo.id })).toBe(1);

    // Restore is owner-only.
    await manager.post(`/photos/${photo.id}/restore`).send({ reason: "it was fine" }).expect(403);
    const r: PhotoView = (await api.post(`/photos/${photo.id}/restore`).send({ reason: "it was fine" }).expect(200)).body;
    expect(r.voidedAt).toBeNull();
    await manager.get(`/photos/${photo.id}`).expect(200);
    const logs = await db.auditLog.find({ entity: "ReturnPhoto", entityId: photo.id }, { sort: { createdAt: 1 } });
    expect(logs.map((l) => l.action)).toEqual(["create", "void", "restore"]);
    expect(logs[1].reason).toBe("blurry photo");
  });

  it("everything needs a login", async () => {
    const anon = request(createApp());
    await anon.get("/photos").expect(401);
    await anon.get(`/photos/${photo.id}`).expect(401);
    await anon.get(`/photos/${photo.id}/thumb`).expect(401);
    await anon.get(`/photos/${photo.id}/original`).expect(401);
    await anon.get(`/photos/${photo.id}/share`).expect(401);
    await anon.post(`/returns/${ret2.id}/photos`).attach("photos", await jpeg(), { filename: "a.jpg", contentType: "image/jpeg" }).expect(401);
  });
});

describe("storage", () => {
  it("rejects path traversal and odd keys", () => {
    for (const k of ["../etc/passwd", "/abs/path", "photos/../../x", "photos//x", "photos/a b", ""]) expect(() => assertKey(k), k).toThrow();
    expect(() => assertKey("photos/2026/10/0b6f3c1e-1111-2222-3333-444455556666/original.jpg")).not.toThrow();
  });

  it("writes under UPLOAD_DIR", () => {
    expect(readdirSync(path.join(uploadDir, "photos")).length).toBeGreaterThan(0);
  });
});

describe("challan line reference photos", () => {
  const attach = (jobItemId: string, kind: string | null) => {
    let req = api.post(`/job-items/${jobItemId}/photos`);
    if (kind) req = req.field("kind", kind);
    return req;
  };

  it("uploads item and design photos to a line and shows them on the challan", async () => {
    const itemId = job.items[0].id;
    const item = await attach(itemId, "ITEM").attach("photos", await jpeg(), { filename: "fabric.jpg", contentType: "image/jpeg" }).expect(201);
    expect(item.body).toEqual([expect.objectContaining({ kind: "ITEM", name: "fabric.jpg" })]);
    await attach(itemId, "DESIGN")
      .attach("photos", await jpeg(80, 80), { filename: "sample-1.jpg", contentType: "image/jpeg" })
      .attach("photos", await jpeg(90, 90), { filename: "sample-2.jpg", contentType: "image/jpeg" })
      .expect(201);

    const detail: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    const photos = detail.items.find((i) => i.id === itemId)!.photos;
    expect(photos.map((p) => [p.kind, p.name])).toEqual([
      ["ITEM", "fabric.jpg"],
      ["DESIGN", "sample-1.jpg"],
      ["DESIGN", "sample-2.jpg"],
    ]);
    expect(detail.items[1].photos).toEqual([]);

    const thumb = await api.get(`/job-photos/${photos[0].id}/thumb`).expect(200);
    expect(thumb.headers["content-type"]).toBe("image/jpeg");
  });

  it("rejects a missing kind and non-images", async () => {
    await attach(job.items[1].id, null).attach("photos", await jpeg(), { filename: "a.jpg", contentType: "image/jpeg" }).expect(422);
    await attach(job.items[1].id, "DESIGN").attach("photos", Buffer.from("hello"), { filename: "a.txt", contentType: "text/plain" }).expect(422);
    await attach("nope", "ITEM").attach("photos", await jpeg(), { filename: "a.jpg", contentType: "image/jpeg" }).expect(404);
  });

  it("removes a photo from the challan", async () => {
    const [p] = (await attach(job.items[1].id, "ITEM").attach("photos", await jpeg(), { filename: "x.jpg", contentType: "image/jpeg" }).expect(201)).body;
    await api.post(`/job-photos/${p.id}/remove`).send({}).expect(200);
    await api.get(`/job-photos/${p.id}/thumb`).expect(404);
    const detail: JobDetail = (await api.get(`/jobs/${job.id}`).expect(200)).body;
    expect(detail.items[1].photos).toEqual([]);
  });

  it("keeps photos on lines kept when a draft challan is edited", async () => {
    const d = job.items[0];
    const draft: JobDetail = (
      await api
        .post("/jobs")
        .send({ clientId: job.client.id, productId: job.product.id, jobDate: "2026-10-05", dispatchNow: false, items: [{ designId: d.designId, materialId: d.material!.id, quantity: 10, ratePaise: 8000 }] })
        .expect(201)
    ).body;
    await attach(draft.items[0].id, "DESIGN").attach("photos", await jpeg(), { filename: "keep.jpg", contentType: "image/jpeg" }).expect(201);
    const edited: JobDetail = (
      await api
        .patch(`/jobs/${draft.id}`)
        .send({ items: [{ id: draft.items[0].id, designId: d.designId, materialId: d.material!.id, quantity: 12, ratePaise: 8000 }] })
        .expect(200)
    ).body;
    expect(edited.items[0].quantity).toBe(12);
    expect(edited.items[0].photos.map((p) => p.name)).toEqual(["keep.jpg"]);
  });
});
