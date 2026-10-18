import { db } from "@av/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/env.js";
import { HttpError } from "../src/lib/http.js";
import { agentAs, resetDb } from "./helpers.js";

// Google's own token check is covered by google-auth-library; here the "token" is just the email it verifies to.
vi.mock("../src/lib/google.js", () => ({
  verifyGoogleIdToken: async (idToken: string) => {
    if (idToken === "bad") throw new HttpError(401, "Google sign-in failed. Please try again.");
    return idToken.toLowerCase();
  },
}));

describe("Continue with Google", () => {
  const app = request(createApp());
  const before = env.googleClientId;

  beforeAll(async () => {
    await resetDb();
    env.googleClientId = "test-client.apps.googleusercontent.com";
    await agentAs("staff@example.com", "SUB_OWNER");
    await agentAs("gone@example.com", "SUB_OWNER");
    await db.user.updateMany({ email: "gone@example.com" }, { disabledAt: new Date() });
  });
  afterAll(() => {
    env.googleClientId = before;
  });

  it("tells the login screens the client ID", async () => {
    const res = await app.get("/auth/google").expect(200);
    expect(res.body.clientId).toBe("test-client.apps.googleusercontent.com");
  });

  it("signs an existing user in on the web with a session cookie", async () => {
    const agent = request.agent(createApp());
    const res = await agent.post("/auth/google").send({ idToken: "Staff@Example.com" }).expect(200);
    expect(res.body.user).toMatchObject({ email: "staff@example.com", role: "SUB_OWNER" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/av_session=/);
    await agent.get("/auth/me").expect(200);
  });

  it("returns a bearer token for the mobile app", async () => {
    const res = await app.post("/auth/google/token").send({ idToken: "staff@example.com" }).expect(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    await app.get("/auth/me").set("Authorization", `Bearer ${res.body.token}`).expect(200);
  });

  it("never creates an account for an unknown Google email", async () => {
    const res = await app.post("/auth/google").send({ idToken: "stranger@gmail.com" }).expect(403);
    expect(res.body.message).toMatch(/Ask the owner to add you/);
    expect(await db.user.count({ email: "stranger@gmail.com" })).toBe(0);
  });

  it("refuses a turned-off account and a token Google rejects", async () => {
    await app.post("/auth/google").send({ idToken: "gone@example.com" }).expect(403);
    await app.post("/auth/google/token").send({ idToken: "bad" }).expect(401);
    await app.post("/auth/google").send({}).expect(422);
  });
});
