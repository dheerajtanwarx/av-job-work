import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "@av/db";
import type { Client } from "@av/shared";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loggedInAgent, resetDb } from "./helpers.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "av-workers-"));
process.env.UPLOAD_DIR = uploadDir;

let owner: TestAgent;
let staff: TestAgent;
let worker: Client;

const jpeg = () => sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer();
let image: Buffer;
const put = (agent: TestAgent, slot: string) => agent.post(`/clients/${worker.id}/documents/${slot}`).attach("photo", image, { filename: `${slot}.jpg`, contentType: "image/jpeg" });

beforeAll(async () => {
  await resetDb();
  image = await jpeg();
  owner = await loggedInAgent();
  await db.user.create({ email: "staff@example.com", name: "Staff", role: "SUB_OWNER", passwordHash: await bcrypt.hash("secret", 4) });
  staff = request.agent(createApp());
  await staff.post("/auth/login").send({ email: "staff@example.com", password: "secret" }).expect(200);
  worker = (await owner.post("/clients").send({ name: "Rafeek", phone: "9887773095", workItems: "kacchi patti, pittan", address: "Khohnagori" }).expect(201)).body;
});

afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
});

describe("worker profile", () => {
  it("saves and searches by work / items", async () => {
    expect(worker.workItems).toBe("kacchi patti, pittan");
    const found: Client[] = (await owner.get("/clients?q=pittan").expect(200)).body;
    expect(found.map((c) => c.id)).toEqual([worker.id]);
  });

  it("sets, replaces and removes the worker photo", async () => {
    const first: Client = (await put(staff, "photo").expect(200)).body;
    expect(first.photoId).toBeTruthy();
    await staff.get(`/worker-documents/${first.photoId}/thumb`).expect(200);
    const second: Client = (await put(staff, "photo").expect(200)).body;
    expect(second.photoId).not.toBe(first.photoId);
    const cleared: Client = (await staff.post(`/clients/${worker.id}/documents/photo/remove`).send({}).expect(200)).body;
    expect(cleared.photoId).toBeNull();
  });

  it("keeps Aadhaar images to signed-in owners and sub-owners", async () => {
    await put(staff, "aadhaar-front").expect(200);
    const c: Client = (await put(owner, "aadhaar-front").expect(200)).body;
    await put(owner, "aadhaar-back").expect(200);
    await owner.get(`/worker-documents/${c.aadhaarFrontId}/display`).expect(200);
    await staff.get(`/worker-documents/${c.aadhaarFrontId}/display`).expect(200);
    await request(createApp()).get(`/worker-documents/${c.aadhaarFrontId}/display`).expect(401);
    const profile = (await owner.get(`/clients/${worker.id}`).expect(200)).body;
    expect(profile.client.aadhaarFrontId).toBe(c.aadhaarFrontId);
    expect(profile.client.aadhaarBackId).toBeTruthy();
  });

  it("rejects unknown slots and non-images", async () => {
    await put(owner, "passport").expect(404);
    await owner.post(`/clients/${worker.id}/documents/photo`).attach("photo", Buffer.from("nope"), { filename: "a.txt", contentType: "text/plain" }).expect(422);
  });
});
