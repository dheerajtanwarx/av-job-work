import { db } from "@av/db";
import type { NotificationLogRow } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/env.js";
import { notify } from "../src/notifications/index.js";
import { loggedInAgent, resetDb } from "./helpers.js";

describe("notification service", () => {
  let api: TestAgent;

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
  });

  /** Pretends WhatsApp credentials are set for the duration of `fn`. */
  const withWhatsApp = async <T>(fn: () => Promise<T>) => {
    const saved = { ...env.whatsapp };
    Object.assign(env.whatsapp, { token: "test-token", phoneNumberId: "123" });
    try {
      return await fn();
    } finally {
      Object.assign(env.whatsapp, saved);
    }
  };

  it("SMS and in-app are stubs that log skipped; WhatsApp is skipped until its API is set up", async () => {
    for (const channel of ["sms", "in_app"] as const) {
      const r = await notify({ channel, kind: "return_receipt", entity: "Return", entityId: `x-${channel}`, recipient: "9811111111", auto: false, render: () => ({ text: "hello" }) });
      expect(r.status).toBe("skipped");
      expect(r.error).toMatch(/not configured yet/);
    }
    const token = env.whatsapp.token;
    env.whatsapp.token = undefined;
    try {
      const r = await notify({ channel: "whatsapp", kind: "return_receipt", entity: "Return", entityId: "x-whatsapp", recipient: "919811111111", auto: false, render: () => ({ text: "hello" }) });
      expect(r.status).toBe("skipped");
    } finally {
      env.whatsapp.token = token;
    }
    const row = await db.notificationLog.findOneOrThrow({ channel: "whatsapp", entityId: "x-whatsapp" });
    expect(row).toMatchObject({ status: "skipped", error: "WhatsApp Business API is not set up on the server (WHATSAPP_* settings in .env)", recipient: "919811111111" });
  });

  it("sends an automatic message at most once per entity, even when called concurrently", async () => {
    const input = { channel: "whatsapp" as const, kind: "return_receipt", entity: "Return", entityId: "auto-once", recipient: "919811111111", auto: true, skipReason: "test", render: () => ({ text: "hello" }) };
    const results = await Promise.all([notify(input), notify(input)]);
    expect(results.map((r) => r.status).sort()).toEqual(["duplicate", "skipped"]);
    expect((await notify(input)).status).toBe("duplicate");
    // Manual sends are always attempted and logged.
    expect((await notify({ ...input, auto: false })).status).toBe("skipped");
    expect(await db.notificationLog.count({ entityId: "auto-once" })).toBe(2);
  });

  it("never throws when rendering fails – logs failed instead", async () => {
    const r = await withWhatsApp(() =>
      notify({ channel: "whatsapp", kind: "test", entity: "Test", entityId: "t1", recipient: "919811111111", auto: false, render: () => Promise.reject(new Error("template broke")) }),
    );
    expect(r).toMatchObject({ status: "failed", error: "template broke" });
    expect(await db.notificationLog.count({ entity: "Test", entityId: "t1", status: "failed" })).toBe(1);
  });

  it("lists the log filtered by status", async () => {
    const failed: NotificationLogRow[] = (await api.get("/notifications?status=failed").expect(200)).body;
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed.every((r) => r.status === "failed")).toBe(true);
    const list: NotificationLogRow[] = (await api.get("/notifications?entity=Return&entityId=auto-once").expect(200)).body;
    expect(list).toHaveLength(2);
    await api.get("/notifications?status=bogus").expect(422);
  });
});
