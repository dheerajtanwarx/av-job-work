import { prisma } from "@av/db";
import type { JobDetail, NotificationLogRow, WhatsAppSendResult } from "@av/shared";
import type TestAgent from "supertest/lib/agent.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../src/env.js";
import { toWhatsAppNumber } from "../src/lib/phone.js";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loggedInAgent, resetDb, stockedMaterial } from "./helpers.js";

describe("toWhatsAppNumber", () => {
  it("normalises Indian and international numbers", () => {
    expect(toWhatsAppNumber("98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("098765-43210")).toBe("919876543210");
    expect(toWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("919876543210")).toBe("919876543210");
    expect(toWhatsAppNumber("0091 98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("+44 7700 900123")).toBe("447700900123");
  });
  it("rejects what cannot be a WhatsApp number", () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber("  ")).toBeNull();
    expect(toWhatsAppNumber("12345")).toBeNull();
    expect(toWhatsAppNumber("0261 2345678")).toBeNull(); // Indian landline
    expect(toWhatsAppNumber("1234567890")).toBeNull();
  });
});

describe("receipt PDFs and Send on WhatsApp", () => {
  let api: TestAgent;
  const app = createApp();
  let clientId: string;
  let noPhoneClientId: string;
  let productId: string;
  let designId: string;
  let materialId: string;
  const saved = { ...env.whatsapp };

  beforeAll(async () => {
    await resetDb();
    api = await loggedInAgent();
    clientId = (await api.post("/clients").send({ name: "Ramesh Embroidery", phone: "98765 43210" }).expect(201)).body.id;
    noPhoneClientId = (await api.post("/clients").send({ name: "Suresh Works" }).expect(201)).body.id;
    productId = (await api.post("/products").send({ name: "Saree", unit: "PCS" }).expect(201)).body.id;
    designId = (await api.post("/designs").send({ name: "Zari Butti", defaultRatePaise: 1500 }).expect(201)).body.id;
    materialId = await stockedMaterial(api, "Saree lot");
    await api.put("/settings").send({ businessName: "AV Creation", phone: "+91 98250 12345", defaultPaymentPolicy: "MANUAL" }).expect(200);
  });

  afterEach(() => {
    Object.assign(env.whatsapp, saved);
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A challan issued (10 pcs) with 8 returned good + 2 damaged at ₹15. */
  const challanWithReturn = async (forClient = clientId) => {
    const job: JobDetail = (
      await api.post("/jobs").send({ clientId: forClient, productId, jobDate: "2026-10-01", dispatchNow: true, items: [{ designId, materialId, quantity: 10, ratePaise: 1500 }] }).expect(201)
    ).body;
    const ret = (await api.post(`/jobs/${job.id}/returns`).send({ date: "2026-10-02", lines: [{ jobItemId: job.items[0].id, okQty: 8, damagedQty: 2, exceptionReason: "Torn" }] }).expect(201)).body;
    const dispatch = job.timeline.find((e) => e.type === "dispatch")!;
    return { job, returnId: ret.id as string, returnNumber: ret.returnNumber as string, dispatchId: (dispatch as { id: string }).id };
  };

  it("serves the receiving voucher and the material issue slip as PDFs", async () => {
    const { returnId, returnNumber, dispatchId, job } = await challanWithReturn();
    const ret = await api.get(`/returns/${returnId}/pdf`).responseType("blob").expect(200);
    expect(ret.headers["content-type"]).toBe("application/pdf");
    expect(ret.headers["content-disposition"]).toContain(`Receiving-Voucher-${returnNumber}.pdf`);
    expect((ret.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    const issue = await api.get(`/dispatches/${dispatchId}/pdf`).responseType("blob").expect(200);
    expect(issue.headers["content-disposition"]).toContain(`Material-Issue-${job.jobNumber}-I1.pdf`);
    expect((issue.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    await api.get(`/returns/nope/pdf`).expect(404);
  });

  it("without the WhatsApp API: returns the chat message with a signed PDF link, audits it, logs no notification", async () => {
    env.whatsapp.token = undefined;
    const { returnId, returnNumber, job, dispatchId } = await challanWithReturn();
    const r: WhatsAppSendResult = (await api.post(`/returns/${returnId}/whatsapp`).expect(200)).body;
    expect(r).toMatchObject({ status: "skipped", reason: "not_configured", to: "919876543210", message: "Opening WhatsApp chat with +91 98765 43210", worker: { id: clientId, name: "Ramesh Embroidery" } });
    expect(r.share.phone).toBe("919876543210");
    expect(r.share.text).toContain(`*${returnNumber}*`);
    expect(r.share.text).toContain(`*${job.jobNumber}* (Saree)`);
    expect(r.share.text).toContain("Received good: *8 pcs*");
    expect(r.share.text).toContain("Damaged / rejected / lost: 2 pcs");
    expect(r.share.text).toContain("Work value: *₹120*");
    expect(r.share.text).toContain("call +91 98250 12345");

    // The message carries a public link to the PDF that opens without logging in.
    const link = r.share.text.match(/https?:\/\/\S+\/api(\/public\/receipts\/return\/(\S+))/);
    expect(link).not.toBeNull();
    const [, publicPath, token] = link!;
    expect(r.share.text).toContain(`${env.publicWebUrl}/api/public/receipts/return/`);
    const pdf = await request(app).get(publicPath).responseType("blob").expect(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    // Tampered, wrong-kind and malformed links are refused.
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    await request(app).get(`/public/receipts/return/${tampered}`).expect(404);
    await request(app).get(`/public/receipts/issue/${token}`).expect(404);
    await request(app).get(`/public/receipts/return/${returnId}`).expect(404);

    // The material issue message links to its own slip.
    const issue: WhatsAppSendResult = (await api.post(`/dispatches/${dispatchId}/whatsapp`).expect(200)).body;
    const issuePath = issue.share.text.match(/\/api(\/public\/receipts\/issue\/\S+)/)![1];
    await request(app).get(issuePath).responseType("blob").expect(200);

    expect(await prisma.notificationLog.count({ where: { entityId: { in: [returnId, dispatchId] } } })).toBe(0);
    const audits = await prisma.auditLog.findMany({ where: { entity: "Return", entityId: returnId, action: "whatsapp" } });
    expect(audits.map((a) => a.summary)).toEqual([`${returnNumber} WhatsApp chat opened for +91 98765 43210`]);
  });

  it("with the WhatsApp API: uploads the PDF, sends the template with it as the document header, and audits", async () => {
    Object.assign(env.whatsapp, { token: "test-token", phoneNumberId: "PN1", apiVersion: "v21.0", templateReturn: "return_receipt", templateIssue: "material_issue", templateLang: "en" });
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Response.json(url.endsWith("/media") ? { id: "MEDIA-1" } : { messages: [{ id: "wamid.1" }] });
      }),
    );
    const { returnId, returnNumber, dispatchId, job } = await challanWithReturn();
    const r: WhatsAppSendResult = (await api.post(`/returns/${returnId}/whatsapp`).expect(200)).body;
    expect(r).toMatchObject({ status: "sent", to: "919876543210", message: "Sent on WhatsApp to +91 98765 43210" });

    expect(calls.map((c) => c.url)).toEqual(["https://graph.facebook.com/v21.0/PN1/media", "https://graph.facebook.com/v21.0/PN1/messages"]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const upload = calls[0].init.body as FormData;
    expect(upload.get("type")).toBe("application/pdf");
    const file = upload.get("file") as File;
    expect(file.name).toBe(`Receiving-Voucher-${returnNumber}.pdf`);
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    const msg = JSON.parse(calls[1].init.body as string);
    expect(msg).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "template", template: { name: "return_receipt", language: { code: "en" } } });
    expect(msg.template.components[0]).toEqual({ type: "header", parameters: [{ type: "document", document: { id: "MEDIA-1", filename: `Receiving-Voucher-${returnNumber}.pdf` } }] });
    expect(msg.template.components[1].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Ramesh Embroidery",
      returnNumber,
      "02 Oct 2026",
      job.jobNumber,
      "Saree",
      "8 pcs",
      "2 pcs",
      "₹120",
      "AV Creation",
    ]);

    const audits = await prisma.auditLog.findMany({ where: { entity: "Return", entityId: returnId, action: "whatsapp" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].summary).toBe(`${returnNumber} sent on WhatsApp to +91 98765 43210`);

    // Material issue uses its own template.
    calls.length = 0;
    const issue: WhatsAppSendResult = (await api.post(`/dispatches/${dispatchId}/whatsapp`).expect(200)).body;
    expect(issue.status).toBe("sent");
    const issueMsg = JSON.parse(calls[1].init.body as string);
    expect(issueMsg.template.name).toBe("material_issue");
    expect(issueMsg.template.components[1].parameters[1].text).toBe(`${job.jobNumber}/I1`);
    expect(issueMsg.template.components[1].parameters[5].text).toBe("Zari Butti – 10 pcs");
    const log: NotificationLogRow[] = (await api.get(`/notifications?entityId=${dispatchId}`).expect(200)).body;
    expect(log[0]).toMatchObject({ kind: "issue_receipt", status: "sent", href: `/jobs/${job.id}` });
  });

  it("reports a WhatsApp API error as failed, still offering the share fallback", async () => {
    Object.assign(env.whatsapp, { token: "test-token", phoneNumberId: "PN1" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "Template name does not exist in the translation" } }, { status: 404 })),
    );
    const { returnId } = await challanWithReturn();
    const r: WhatsAppSendResult = (await api.post(`/returns/${returnId}/whatsapp`).expect(200)).body;
    expect(r.status).toBe("failed");
    expect(r.message).toBe("WhatsApp: Template name does not exist in the translation");
    expect(r.share.text).toContain("Namaste Ramesh Embroidery ji,");
    const logs = await prisma.notificationLog.findMany({ where: { entityId: returnId } });
    expect(logs).toEqual([expect.objectContaining({ status: "failed", error: "WhatsApp: Template name does not exist in the translation" })]);
  });

  it("skips voided records and workers without a usable phone number", async () => {
    Object.assign(env.whatsapp, { token: "test-token", phoneNumberId: "PN1" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const noPhone = await challanWithReturn(noPhoneClientId);
    let r: WhatsAppSendResult = (await api.post(`/returns/${noPhone.returnId}/whatsapp`).expect(200)).body;
    expect(r).toMatchObject({ status: "skipped", reason: "no_phone", to: null, message: "Suresh Works has no phone number", worker: { id: noPhoneClientId } });

    await api.put(`/clients/${noPhoneClientId}`).send({ name: "Suresh Works", phone: "0261 2345678" }).expect(200);
    r = (await api.post(`/dispatches/${noPhone.dispatchId}/whatsapp`).expect(200)).body;
    expect(r).toMatchObject({ status: "skipped", reason: "invalid_phone" });

    const { returnId } = await challanWithReturn();
    await api.post(`/returns/${returnId}/void`).send({ reason: "Entered twice" }).expect(200);
    r = (await api.post(`/returns/${returnId}/whatsapp`).expect(200)).body;
    expect(r).toMatchObject({ status: "skipped", reason: "voided", message: "Voided returns are not sent" });
    // A voided record still has a PDF (marked VOID).
    await api.get(`/returns/${returnId}/pdf`).expect(200);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
