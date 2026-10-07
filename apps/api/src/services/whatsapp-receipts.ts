import { db } from "@av/db";
import { DISPATCH_KIND_LABEL, formatDate, formatINR, formatQty, PAY_STATUS_LABEL, roundQty, type ReturnDetail, type WhatsAppSendResult } from "@av/shared";
import { audit } from "../lib/audit.js";
import { displayWhatsAppNumber, toWhatsAppNumber } from "../lib/phone.js";
import { receiptLink } from "../lib/signed-link.js";
import { env } from "../env.js";
import { channels, notify } from "../notifications/index.js";
import { getDispatch, issuePdfFilename, issueReceiptPdf, returnPdfFilename, returnReceiptPdf, type DispatchDoc } from "./receipt-pdf.js";
import { getReturn } from "./returns.js";

/**
 * "Send on WhatsApp" for a return (Receiving Voucher) or a material issue (Material Issue Slip): a short message
 * plus the PDF, to the job worker's phone. Always a manual action. Every attempt is logged in NotificationLog.
 *
 * When the WhatsApp Business API is not configured (or the send fails) the result carries `share` – the message with
 * a signed link to the PDF – and the app opens the worker's chat (wa.me/<number>) with it ready to send.
 * Never throws for a record that exists.
 */

// ───────────────────────── Return ─────────────────────────

export async function sendReturnWhatsApp(returnId: string, userId?: string): Promise<WhatsAppSendResult> {
  const r = await getReturn(returnId);
  const worker = await db.client.findById(r.client.id, { select: "phone" });
  return send({
    kind: "return_receipt",
    entity: "Return",
    entityId: r.id,
    ref: r.returnNumber,
    worker: r.client,
    phone: worker?.phone ?? null,
    voided: !!r.voidedAt,
    text: returnMessage(r, receiptLink("return", r.id)),
    pdfPath: `/returns/${r.id}/pdf`,
    filename: returnPdfFilename(r.returnNumber),
    template: env.whatsapp.templateReturn,
    params: returnTemplateParams(r),
    pdf: () => returnReceiptPdf(r.id, r),
    userId,
  });
}

const exceptions = (r: ReturnDetail) => roundQty(r.damagedQty + r.rejectedQty + r.lostQty);

/** The chat message. WhatsApp formatting: *bold*. No emoji – WhatsApp's chat links turn them into "�". */
export function returnMessage(r: ReturnDetail, pdfUrl: string) {
  const b = r.business;
  const u = r.unit.toLowerCase();
  const ex = exceptions(r);
  const p = r.payment;
  return [
    `*${b.businessName}*`,
    `Namaste ${r.client.name} ji,`,
    "",
    "We have received your job work. Thank you!",
    "",
    `Return: *${r.returnNumber}* · ${formatDate(r.date)}`,
    `Challan: *${r.job.jobNumber}* (${r.productName})`,
    `Received good: *${formatQty(r.okQty)} ${u}*`,
    ...(ex > 0 ? [`Damaged / rejected / lost: ${formatQty(ex)} ${u}`] : []),
    `Work value: *${formatINR(r.valuePaise)}*`,
    ...(p ? [`Payment: ${PAY_STATUS_LABEL[p.status]}${p.outstandingPaise > 0 ? ` · ${formatINR(p.outstandingPaise)} due${p.dueDate ? ` by ${formatDate(p.dueDate)}` : ""}` : ""}`] : []),
    "",
    "*Receiving voucher (PDF):*",
    pdfUrl,
    ...(b.phone ? [`For any query please call ${b.phone}.`] : []),
    "",
    `– ${b.businessName}`,
  ].join("\n");
}

/**
 * Body parameters of the `return_receipt` template, in order (README → WhatsApp has the template text):
 * {{1}} worker, {{2}} return no., {{3}} date, {{4}} challan no., {{5}} product, {{6}} good qty, {{7}} damaged/rejected/lost,
 * {{8}} work value, {{9}} business.
 */
export function returnTemplateParams(r: ReturnDetail) {
  const u = r.unit.toLowerCase();
  return [r.client.name, r.returnNumber, formatDate(r.date), r.job.jobNumber, r.productName, `${formatQty(r.okQty)} ${u}`, `${formatQty(exceptions(r))} ${u}`, formatINR(r.valuePaise), r.business.businessName];
}

// ───────────────────────── Material issue ─────────────────────────

export async function sendIssueWhatsApp(dispatchId: string, userId?: string): Promise<WhatsAppSendResult> {
  const d = await getDispatch(dispatchId);
  return send({
    kind: "issue_receipt",
    entity: "Dispatch",
    entityId: d.id,
    ref: d.ref,
    worker: { id: d.client.id, name: d.client.name },
    phone: d.client.phone,
    voided: !!d.voidedAt,
    text: issueMessage(d, receiptLink("issue", d.id)),
    pdfPath: `/dispatches/${d.id}/pdf`,
    filename: issuePdfFilename(d.ref),
    template: env.whatsapp.templateIssue,
    params: issueTemplateParams(d),
    pdf: () => issueReceiptPdf(d.id, d),
    userId,
  });
}

const designSummary = (d: DispatchDoc) => d.lines.map((l) => `${l.designName} – ${formatQty(l.qty)} ${l.unit.toLowerCase()}`);

export function issueMessage(d: DispatchDoc, pdfUrl: string) {
  const b = d.business;
  return [
    `*${b.businessName}*`,
    `Namaste ${d.client.name} ji,`,
    "",
    "Material has been issued to you for job work.",
    "",
    `Issue slip: *${d.ref}* · ${formatDate(d.date)}`,
    `Challan: *${d.job.jobNumber}* (${d.job.productName})`,
    `Type: ${DISPATCH_KIND_LABEL[d.kind]}`,
    "",
    ...designSummary(d).map((s) => `• ${s}`),
    `*Total: ${formatQty(d.total)} ${d.unit.toLowerCase()}*`,
    ...(d.job.dueDate ? ["", `Please return by *${formatDate(d.job.dueDate)}*`] : []),
    ...(d.notes ? ["", `Note: ${d.notes}`] : []),
    "",
    "Please check the material on receipt.",
    "*Material issue slip (PDF):*",
    pdfUrl,
    ...(b.phone ? [`For any query please call ${b.phone}.`] : []),
    "",
    `– ${b.businessName}`,
  ].join("\n");
}

/**
 * Body parameters of the `material_issue` template, in order:
 * {{1}} worker, {{2}} slip no., {{3}} date, {{4}} challan no., {{5}} product, {{6}} designs, {{7}} total qty,
 * {{8}} return by, {{9}} business.
 */
export function issueTemplateParams(d: DispatchDoc) {
  return [
    d.client.name,
    d.ref,
    formatDate(d.date),
    d.job.jobNumber,
    d.job.productName,
    designSummary(d).join(", "),
    `${formatQty(d.total)} ${d.unit.toLowerCase()}`,
    d.job.dueDate ? formatDate(d.job.dueDate) : "as agreed",
    d.business.businessName,
  ];
}

// ───────────────────────── Shared ─────────────────────────

interface SendInput {
  kind: "return_receipt" | "issue_receipt";
  entity: "Return" | "Dispatch";
  entityId: string;
  ref: string;
  worker: { id: string; name: string };
  phone: string | null;
  voided: boolean;
  text: string;
  pdfPath: string;
  filename: string;
  template: string;
  params: string[];
  pdf: () => Promise<{ filename: string; content: Buffer }>;
  userId?: string;
}

async function send(i: SendInput): Promise<WhatsAppSendResult> {
  const to = toWhatsAppNumber(i.phone);
  const share = { phone: to, text: i.text, pdfPath: i.pdfPath, filename: i.filename };
  const what = i.kind === "return_receipt" ? "Voided returns" : "Voided material issues";

  let reason: WhatsAppSendResult["reason"] = null;
  let skipReason: string | null = null;
  if (i.voided) [reason, skipReason] = ["voided", `${what} are not sent`];
  else if (!i.phone?.trim()) [reason, skipReason] = ["no_phone", `${i.worker.name} has no phone number`];
  else if (!to) [reason, skipReason] = ["invalid_phone", `${i.worker.name}'s phone number "${i.phone}" is not a valid WhatsApp number`];
  const worker = { id: i.worker.id, name: i.worker.name };
  const shown = to ? displayWhatsAppNumber(to) : null;

  // No WhatsApp Business API: the app opens the worker's chat (wa.me) with this message and the PDF link.
  // Nothing is sent from here, so nothing goes in the notification log – just note it on the record.
  if (!channels.whatsapp.isConfigured()) {
    if (reason) return { status: "skipped", reason, to, message: skipReason!, worker, share };
    await audit(db, { entity: i.entity, entityId: i.entityId, action: "whatsapp", summary: `${i.ref} WhatsApp chat opened for ${shown}`, userId: i.userId }).catch((e) => console.error("could not record WhatsApp share", e));
    return { status: "skipped", reason: "not_configured", to, message: `Opening WhatsApp chat with ${shown}`, worker, share };
  }

  const r = await notify({
    channel: "whatsapp",
    kind: i.kind,
    entity: i.entity,
    entityId: i.entityId,
    recipient: to,
    auto: false,
    userId: i.userId,
    skipReason,
    render: async () => {
      const pdf = await i.pdf();
      return { text: i.text, whatsapp: { template: i.template, params: i.params, document: pdf } };
    },
  });

  if (r.status === "sent") {
    await audit(db, { entity: i.entity, entityId: i.entityId, action: "whatsapp", summary: `${i.ref} sent on WhatsApp to ${shown}`, userId: i.userId }).catch((e) => console.error("could not record WhatsApp send", e));
    return { status: "sent", reason: null, to, message: `Sent on WhatsApp to ${shown}`, worker, share };
  }
  if (r.status === "failed") return { status: "failed", reason: null, to, message: r.error ?? "WhatsApp send failed", worker, share };
  return { status: "skipped", reason, to, message: r.error ?? "Not sent", worker, share };
}
