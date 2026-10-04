import { prisma } from "@av/db";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/env.js";
import { enableRateLimitInTests } from "../src/middleware/security.js";
import { loggedInAgent, resetDb } from "./helpers.js";

describe("security hardening", () => {
  let api: Awaited<ReturnType<typeof loggedInAgent>>;

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
  });

  afterEach(() => enableRateLimitInTests(false));
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("CSRF: cookie-authenticated writes from other sites are rejected", () => {
    it("rejects a cross-site Origin", async () => {
      const res = await api.post("/clients").set("Origin", "https://evil.example").send({ name: "Evil" });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/another website/);
      expect(await prisma.client.count({ where: { name: "Evil" } })).toBe(0);
    });

    it("rejects Sec-Fetch-Site: cross-site and a foreign Referer, and an opaque null Origin", async () => {
      await api.post("/clients").set("Sec-Fetch-Site", "cross-site").send({ name: "Evil 2" }).expect(403);
      await api.post("/clients").set("Referer", "https://evil.example/page").send({ name: "Evil 3" }).expect(403);
      await api.post("/clients").set("Origin", "null").send({ name: "Evil 4" }).expect(403);
      await api.put("/settings").set("Origin", "https://evil.example").send({ businessName: "Hacked", defaultPaymentPolicy: "MANUAL" }).expect(403);
    });

    it("allows the web app's own origin, same-origin fetches and requests without Origin", async () => {
      await api.post("/clients").set("Origin", new URL(env.webOrigin).origin).set("Sec-Fetch-Site", "same-origin").send({ name: "Same Origin" }).expect(201);
      await api.post("/clients").set("Referer", `${env.webOrigin}/clients`).send({ name: "Same Referer" }).expect(201);
      await api.post("/clients").send({ name: "No Origin" }).expect(201);
    });

    it("never blocks reads", async () => {
      await api.get("/clients").set("Origin", "https://evil.example").set("Sec-Fetch-Site", "cross-site").expect(200);
    });
  });

  describe("rate limits", () => {
    it("limits failed logins per IP when enabled", async () => {
      enableRateLimitInTests(true);
      const app = request(createApp());
      for (let i = 0; i < 10; i++) await app.post("/auth/login").send({ email: "test@example.com", password: "wrong" }).expect(401);
      const blocked = await app.post("/auth/login").send({ email: "test@example.com", password: "secret" });
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/Too many login attempts/);
    });

    it("limits the public QR view per IP when enabled", async () => {
      enableRateLimitInTests(true);
      const app = request(createApp());
      for (let i = 0; i < 60; i++) await app.get(`/public/challans/${"0".repeat(64)}`).expect(404);
      await app.get(`/public/challans/${"0".repeat(64)}`).expect(429);
    });

    it("is off under test by default", async () => {
      const app = request(createApp());
      for (let i = 0; i < 12; i++) await app.post("/auth/login").send({ email: "test@example.com", password: "wrong" }).expect(401);
    });
  });

  describe("roles", () => {
    it("a VIEWER can read but not write", async () => {
      await prisma.user.create({ data: { email: "viewer@example.com", name: "Viewer", role: "VIEWER", passwordHash: await bcrypt.hash("secret", 4) } });
      const viewer = request.agent(createApp());
      const login = await viewer.post("/auth/login").send({ email: "viewer@example.com", password: "secret" }).expect(200);
      expect(login.body.user.role).toBe("VIEWER");
      await viewer.get("/clients").expect(200);
      await viewer.get("/settings").expect(200);
      const res = await viewer.post("/clients").send({ name: "Viewer Worker" });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/read-only/);
      await viewer.put("/settings").send({ businessName: "X", defaultPaymentPolicy: "MANUAL" }).expect(403);
    });
  });
});
