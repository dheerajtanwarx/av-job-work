import { prisma } from "@av/db";
import type { JobDetail, NotificationLogRow, SubBillWithEmail } from "@av/shared";
import type { SendMailOptions, Transporter } from "nodemailer";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setTransport } from "../src/lib/mailer.js";
import { notify } from "../src/notifications/index.js";
import { emailSubBill } from "../src/services/bill-email.js";
import { loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

describe("notification service and payment voucher emails", () => {
  let api: TestAgent;
  let sent: SendMailOptions[];
  let clientId: string;
  let productId: string;
  let designId: string;
  let materialId: string;

  const okTransport = () =>
    setTransport({
      sendMail: async (o: SendMailOptions) => {
        sent.push(o);
        return {};
      },
    } as unknown as Transporter);

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    clientId = (await api.post("/clients").send({ name: "Ramesh Embroidery", email: "ramesh@example.com" }).expect(201)).body.id;
    productId = (await api.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id;
    designId = (await api.post("/designs").send({ name: "Zari Butti", defaultRatePaise: 1500 }).expect(201)).body.id;
    materialId = await stockedMaterial(api, "Saree lot");
    await api.put("/settings").send({ businessName: "AV Creation", emailBills: true, defaultPaymentPolicy: "MANUAL" }).expect(200);
  });

  beforeEach(() => {
    sent = [];
    okTransport();
  });

  afterAll(async () => {
    setTransport(undefined);
    await prisma.$disconnect();
  });

  /** A challan with 10 pcs returned good at ₹15 → work value ₹150. */
  const challanWithReturn = async () => {
    const job: JobDetail = (
      await api.post("/jobs").send({ clientId, productId, jobDate: "2026-10-01", dispatchNow: true, items: [{ designId, materialId, quantity: 10, ratePaise: 1500 }] }).expect(201)
    ).body;
    const ret = (await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: job.items[0].id, okQty: 10 }] }).expect(201)).body;
    return { job, returnId: ret.id as string, returnNumber: ret.returnNumber as string };
  };
  const logsFor = (id: string) => prisma.notificationLog.findMany({ where: { entity: "SubBill", entityId: id }, orderBy: { createdAt: "asc" } });

  it("logs a sent automatic email once, never twice for a repeated submit, and logs each manual resend", async () => {
    const { job, returnId, returnNumber } = await challanWithReturn();
    const body = { jobId: job.id, date: "2026-10-03", amountPaise: 5000, method: "UPI", reference: "UTR-1", returnId, idempotencyKey: "notify-key-1" };
    const first: SubBillWithEmail = (await api.post("/sub-bills").send(body).expect(201)).body;
    expect(first.email.status).toBe("sent");
    expect(sent).toHaveLength(1);

    // Amount-based copy: no "for 0 pieces"; challan, return, method, reference and the challan account.
    const mail = sent[0];
    expect(mail.subject).toBe(`Payment Voucher ${first.billNumber} – ₹50 for Challan ${job.jobNumber} – AV Creation`);
    expect(mail.text).not.toMatch(/pieces/);
    expect(mail.text).toContain(`challan ${job.jobNumber}`);
    expect(mail.text).toContain(`Against return: ${returnNumber}`);
    expect(mail.text).toContain("Payment method: UPI");
    expect(mail.text).toContain("Reference: UTR-1");
    expect(mail.text).toContain("Job work value: ₹150");
    expect(mail.text).toContain("Paid to date: ₹50");
    expect(mail.text).toContain("Outstanding: ₹100");
    expect(mail.text).not.toContain("Work paid for");

    let logs = await logsFor(first.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ channel: "email", kind: "payment_voucher", status: "sent", recipient: "ramesh@example.com", auto: true, error: null });
    expect(first.notifications).toEqual([expect.objectContaining({ status: "sent", auto: true })]);

    // Double submit with the same idempotency key: same voucher, no second email, no second log row.
    const again = (await api.post("/sub-bills").send(body).expect(200)).body;
    expect(again.id).toBe(first.id);
    expect(again.duplicate).toBe(true);
    // Concurrent automatic sends for the same voucher (e.g. two code paths racing) – still nothing new.
    const racing = await Promise.all([emailSubBill(first.id, undefined, { auto: true }), emailSubBill(first.id, undefined, { auto: true })]);
    expect(racing.map((r) => r.status)).toEqual(["skipped", "skipped"]);
    expect(sent).toHaveLength(1);
    expect(await logsFor(first.id)).toHaveLength(1);

    // An explicit resend is always allowed and logged as a new, manual row.
    const resent: SubBillWithEmail = (await api.post(`/sub-bills/${first.id}/email`).expect(200)).body;
    expect(resent.email.status).toBe("sent");
    expect(sent).toHaveLength(2);
    logs = await logsFor(first.id);
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({ status: "sent", auto: false });
    expect(resent.notifications).toHaveLength(2);
  });

  it("concurrent double-submit with one idempotency key sends one email", async () => {
    const { job } = await challanWithReturn();
    const body = { jobId: job.id, date: "2026-10-03", amountPaise: 1000, method: "CASH", idempotencyKey: "notify-race" };
    const [a, b] = await Promise.all([api.post("/sub-bills").send(body), api.post("/sub-bills").send(body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(sent).toHaveLength(1);
    expect(await logsFor(a.body.id)).toHaveLength(1);
  });

  it("logs failures with the SMTP error text and keeps the payment", async () => {
    const { job } = await challanWithReturn();
    setTransport({ sendMail: async () => Promise.reject(new Error("535 Authentication failed")) } as unknown as Transporter);
    const v: SubBillWithEmail = (await api.post("/sub-bills").send({ jobId: job.id, date: "2026-10-03", amountPaise: 2000, method: "CASH" }).expect(201)).body;
    expect(v.email).toMatchObject({ status: "failed", message: "Could not email ramesh@example.com: 535 Authentication failed" });
    expect(v.emailedAt).toBeNull();
    expect(v.notifications[0]).toMatchObject({ status: "failed", error: "535 Authentication failed", recipient: "ramesh@example.com" });

    const failed: NotificationLogRow[] = (await api.get("/notifications?status=failed").expect(200)).body;
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed.every((r) => r.status === "failed")).toBe(true);
    expect(failed[0]).toMatchObject({ entityId: v.id, ref: v.billNumber, href: `/bills/sub/${v.id}`, error: "535 Authentication failed" });
    await api.get("/notifications?status=bogus").expect(422);
  });

  it("logs skipped sends: SMTP not configured, automatic emails off, worker without email", async () => {
    const { job } = await challanWithReturn();
    setTransport(null);
    const a: SubBillWithEmail = (await api.post("/sub-bills").send({ jobId: job.id, date: "2026-10-03", amountPaise: 1000, method: "CASH" }).expect(201)).body;
    expect(a.email).toMatchObject({ status: "skipped", message: "Email is not set up on the server (SMTP settings in .env)" });
    expect(a.notifications[0]).toMatchObject({ status: "skipped", error: "Email is not set up on the server (SMTP settings in .env)" });

    okTransport();
    await api.put("/settings").send({ businessName: "AV Creation", emailBills: false, defaultPaymentPolicy: "MANUAL" }).expect(200);
    const b: SubBillWithEmail = (await api.post("/sub-bills").send({ jobId: job.id, date: "2026-10-03", amountPaise: 1000, method: "CASH" }).expect(201)).body;
    expect(b.email.status).toBe("skipped");
    expect(b.notifications[0]).toMatchObject({ status: "skipped", auto: true, error: "Automatic payment voucher emails are turned off in Settings" });
    expect(sent).toHaveLength(0);
    // Manual send still works while automatic emails are off.
    expect((await api.post(`/sub-bills/${b.id}/email`).expect(200)).body.email.status).toBe("sent");
    await api.put("/settings").send({ businessName: "AV Creation", emailBills: true, defaultPaymentPolicy: "MANUAL" }).expect(200);

    const list: NotificationLogRow[] = (await api.get(`/notifications?entity=SubBill&entityId=${b.id}`).expect(200)).body;
    expect(list.map((r) => r.status)).toEqual(["sent", "skipped"]); // newest first
  });

  it("WhatsApp, SMS and in-app are stubs that log skipped", async () => {
    for (const channel of ["whatsapp", "sms", "in_app"] as const) {
      const r = await notify({ channel, kind: "payment_voucher", entity: "SubBill", entityId: `x-${channel}`, recipient: "9811111111", auto: false, render: () => ({ text: "hello" }) });
      expect(r.status).toBe("skipped");
      expect(r.error).toMatch(/not configured yet/);
    }
    const row = await prisma.notificationLog.findFirstOrThrow({ where: { channel: "whatsapp", entityId: "x-whatsapp" } });
    expect(row).toMatchObject({ status: "skipped", error: "WhatsApp is not configured yet", recipient: "9811111111" });
  });

  it("never throws when rendering fails – logs failed instead", async () => {
    const r = await notify({ channel: "email", kind: "test", entity: "Test", entityId: "t1", recipient: "a@example.com", auto: false, render: () => Promise.reject(new Error("template broke")) });
    expect(r).toMatchObject({ status: "failed", error: "template broke" });
    expect(await prisma.notificationLog.count({ where: { entity: "Test", entityId: "t1", status: "failed" } })).toBe(1);
  });
});
