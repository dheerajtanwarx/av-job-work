import { prisma } from "@av/db";
import type { JobDetail, SubBillWithEmail } from "@av/shared";
import type { SendMailOptions, Transporter } from "nodemailer";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setTransport } from "../src/lib/mailer.js";
import { loggedInAgent, resetDb } from "./helpers.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("sub bills are emailed to the job worker", () => {
  let api: TestAgent;
  let sent: SendMailOptions[];
  let clientId: string;
  let productId: string;
  let designId: string;

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    clientId = (await api.post("/clients").send({ name: "Gupta Prints", email: "gupta@example.com" }).expect(201)).body.id;
    productId = (await api.post("/products").send({ name: "Kurta", unit: "pcs" }).expect(201)).body.id;
    designId = (await api.post("/designs").send({ name: "Paisley", code: "PS-1", defaultRatePaise: 1500 }).expect(201)).body.id;
    await api.put("/settings").send({ businessName: "AV Textiles", phone: "9811111111", email: "owner@av.example", logo: PNG, billingPolicy: "MANUAL" }).expect(200);
  });

  beforeEach(() => {
    sent = [];
    setTransport({
      sendMail: async (o: SendMailOptions) => {
        sent.push(o);
        return {};
      },
    } as unknown as Transporter);
  });

  afterAll(async () => {
    setTransport(undefined);
    await prisma.$disconnect();
  });

  const newJob = async (client = clientId, qty = 10) => {
    const job: JobDetail = (
      await api.post("/jobs").send({ clientId: client, productId, jobDate: "2026-10-01", dispatchNow: true, items: [{ designId, quantity: qty, ratePaise: 1500 }] }).expect(201)
    ).body;
    return { job, line: job.items[0].id };
  };
  const ret = (jobId: string, line: string, okQty: number) => api.post(`/jobs/${jobId}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: line, okQty }] }).expect(201);
  const pay = async (jobId: string, line: string, qty: number): Promise<SubBillWithEmail> =>
    (await api.post("/sub-bills").send({ jobId, date: "2026-10-03", method: "UPI", reference: "UPI-778", lines: [{ jobItemId: line, qty }] }).expect(201)).body;

  it("emails a detailed sub bill with the logo inline, then includes the main bill when the job is settled", async () => {
    const { job, line } = await newJob();
    await ret(job.id, line, 4);
    const first = await pay(job.id, line, 4);

    expect(first.email).toEqual({ status: "sent", to: "gupta@example.com", message: "Emailed to gupta@example.com" });
    expect(first.emailedTo).toBe("gupta@example.com");
    expect(first.emailedAt).not.toBeNull();
    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.to).toBe("gupta@example.com");
    expect(mail.replyTo).toBe("owner@av.example");
    expect(mail.subject).toBe(`Payment ${first.billNumber} – ₹60 for job ${job.jobNumber} – AV Textiles`);
    expect(mail.html).toContain('src="cid:business-logo"');
    expect(mail.html).toContain("Dear Gupta Prints");
    expect(mail.html).toContain("Paisley");
    expect(mail.html).toContain("UPI-778");
    expect(mail.html).not.toContain("fully settled");
    expect(mail.text).toContain("Paisley: 4 x ₹15 = ₹60");
    expect(mail.attachments).toEqual([expect.objectContaining({ cid: "business-logo", contentType: "image/png", filename: "logo.png" })]);

    await ret(job.id, line, 6);
    const last = await pay(job.id, line, 6);
    expect(last.mainBill?.cancelled).toBe(false);
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toContain(`fully settled (${last.mainBill!.billNumber})`);
    expect(sent[1].html).toContain(`Job ${job.jobNumber} is fully settled`);
    expect(sent[1].html).toContain(first.billNumber); // every payment on the job is listed

    const log = await prisma.auditLog.findMany({ where: { entity: "SubBill", action: "email" } });
    expect(log).toHaveLength(2);
  });

  it("skips job workers without an email address and when turned off in settings", async () => {
    const noEmail = (await api.post("/clients").send({ name: "Raju Stitching" }).expect(201)).body.id;
    const a = await newJob(noEmail, 2);
    await ret(a.job.id, a.line, 2);
    expect((await pay(a.job.id, a.line, 1)).email).toMatchObject({ status: "skipped", message: "Raju Stitching has no email address" });

    await api.put("/settings").send({ businessName: "AV Textiles", emailBills: false, billingPolicy: "MANUAL" }).expect(200);
    const b = await newJob(clientId, 2);
    await ret(b.job.id, b.line, 2);
    const bill = await pay(b.job.id, b.line, 1);
    expect(bill.email.status).toBe("skipped");
    expect(bill.emailedAt).toBeNull();
    expect(sent).toHaveLength(0);

    // A manual send still works while automatic emails are off.
    const resent: SubBillWithEmail = (await api.post(`/sub-bills/${bill.id}/email`).expect(200)).body;
    expect(resent.email.status).toBe("sent");
    expect(sent).toHaveLength(1);
    await api.put("/settings").send({ businessName: "AV Textiles", emailBills: true, billingPolicy: "MANUAL" }).expect(200);
  });

  it("keeps the bill when SMTP is missing or fails", async () => {
    const { job, line } = await newJob(clientId, 4);
    await ret(job.id, line, 4);

    setTransport(null);
    const a = await pay(job.id, line, 1);
    expect(a.email).toMatchObject({ status: "skipped", message: "Email is not set up on the server (SMTP settings in .env)" });

    setTransport({ sendMail: async () => Promise.reject(new Error("SMTP refused")) } as unknown as Transporter);
    const b = await pay(job.id, line, 1);
    expect(b.email).toMatchObject({ status: "failed", message: "Could not email gupta@example.com: SMTP refused" });
    expect(b.emailedAt).toBeNull();
    expect(await prisma.subBill.count({ where: { jobId: job.id } })).toBe(2);
  });

  it("rejects a logo that is not a small PNG or JPEG", async () => {
    await api.put("/settings").send({ businessName: "AV Textiles", logo: "data:image/svg+xml;base64,PHN2Zy8+", billingPolicy: "MANUAL" }).expect(422);
    await api.put("/settings").send({ businessName: "AV Textiles", logo: `data:image/png;base64,${"A".repeat(300_000)}`, billingPolicy: "MANUAL" }).expect(422);
    const s = (await api.put("/settings").send({ businessName: "AV Textiles", logo: null, billingPolicy: "MANUAL" }).expect(200)).body;
    expect(s.logo).toBeNull();
  });
});
