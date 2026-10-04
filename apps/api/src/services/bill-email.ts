import { prisma } from "@av/db";
import { amountInWords, formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type BillEmailResult, type MainBillDetail, type Settings, type SubBillDetail } from "@av/shared";
import type { Attachment } from "nodemailer/lib/mailer/index.js";
import { audit } from "../lib/audit.js";
import { notify } from "../notifications/index.js";
import { getMainBill, getSubBill } from "./billing.js";

// ───────────────────────── Sending ─────────────────────────

/**
 * Emails a payment voucher to its job worker through the notification service (every attempt is logged in
 * NotificationLog). When the challan has an active final settlement (this payment settled it), the settlement is
 * included in the same email. Never throws: the result says whether it was sent.
 *
 * - `auto: true` (on save): only when Settings → "Email payment vouchers" is on, and at most once per voucher –
 *   a repeated or concurrent automatic call is reported as skipped and sends nothing.
 * - Manual (resend): always attempted, even when automatic emails are off.
 */
export async function emailSubBill(id: string, userId?: string, opts: { auto?: boolean } = {}): Promise<BillEmailResult> {
  let bill: SubBillDetail;
  try {
    bill = await getSubBill(id);
  } catch (e) {
    return { status: "failed", to: null, message: e instanceof Error ? e.message : String(e) };
  }
  const to = bill.client.email?.trim() || null;
  const auto = !!opts.auto;

  let skipReason: string | null = null;
  if (auto && !bill.business.emailBills) skipReason = "Automatic payment voucher emails are turned off in Settings";
  else if (bill.voidedAt) skipReason = "Voided payment vouchers are not emailed";
  else if (!to) skipReason = `${bill.client.name} has no email address`;

  let mainBill: MainBillDetail | null = null;
  const r = await notify({
    channel: "email",
    kind: "payment_voucher",
    entity: "SubBill",
    entityId: id,
    recipient: to,
    auto,
    userId,
    skipReason,
    render: async () => {
      mainBill = bill.mainBill && !bill.mainBill.cancelled ? await getMainBill(bill.mainBill.id) : null;
      const { subject, html, text, attachments } = renderSubBillEmail(bill, mainBill);
      return { replyTo: bill.business.email ?? undefined, subject, html, text, attachments };
    },
  });

  if (r.status === "duplicate") return { status: "skipped", to, message: `${bill.billNumber} was already emailed automatically. Use Resend to send it again.` };
  if (r.status === "skipped") return { status: "skipped", to, message: r.error ?? "Not sent" };
  if (r.status === "failed") {
    await audit(prisma, { entity: "SubBill", entityId: id, action: "email_failed", summary: `${bill.billNumber} could not be emailed to ${to}: ${r.error}`, userId }).catch(() => undefined);
    return { status: "failed", to, message: `Could not email ${to}: ${r.error}` };
  }
  const settled = mainBill as MainBillDetail | null;
  try {
    await prisma.subBill.update({ where: { id }, data: { emailedAt: new Date(), emailedTo: to } });
    await audit(prisma, { entity: "SubBill", entityId: id, action: "email", summary: `${bill.billNumber}${settled ? ` and ${settled.billNumber}` : ""} emailed to ${to}${auto ? "" : " (sent manually)"}`, userId });
  } catch (e) {
    console.error("could not record email", e);
  }
  return { status: "sent", to, message: `Emailed to ${to}` };
}

// ───────────────────────── Rendering ─────────────────────────

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nl2br = (s: string | null | undefined) => esc(s).replace(/\r?\n/g, "<br>");

/** "We have made a payment of ₹500 to you via UPI on …" */
const PAID_HOW: Record<SubBillDetail["method"], string> = { CASH: " in cash", UPI: " via UPI", BANK: " by bank transfer", NEFT: " by NEFT", RTGS: " by RTGS", CHEQUE: " by cheque", OTHER: "" };

const C = { fg: "#18181b", muted: "#71717a", border: "#e4e4e7", soft: "#f4f4f5", accent: "#166534", accentBg: "#f0fdf4" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const th = (label: string, right = false) =>
  `<th align="${right ? "right" : "left"}" style="padding:8px 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};border-bottom:1px solid ${C.border};">${label}</th>`;
const td = (v: string, right = false, extra = "") =>
  `<td align="${right ? "right" : "left"}" style="padding:8px 10px;font-size:13px;color:${C.fg};border-bottom:1px solid ${C.border};${extra}">${v}</td>`;
const table = (head: string, body: string, foot = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.border};border-radius:6px;"><thead><tr style="background:${C.soft};">${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
const heading = (s: string) => `<h2 style="margin:28px 0 10px;font-size:14px;font-weight:600;color:${C.fg};">${s}</h2>`;

/** Splits a data: URL into an inline (cid) attachment – most mail clients block data: images. */
function logoAttachment(business: Settings): Attachment | null {
  const m = business.logo?.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  if (!m) return null;
  return { filename: m[1] === "image/png" ? "logo.png" : "logo.jpg", content: Buffer.from(m[2], "base64"), contentType: m[1], cid: "business-logo" };
}

function letterhead(b: Settings, hasLogo: boolean) {
  const contact = [b.phone, b.email].filter(Boolean).map(esc).join(" &middot; ");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${hasLogo ? `<td width="72" valign="middle" style="padding-right:14px;"><img src="cid:business-logo" alt="${esc(b.businessName)}" width="64" style="display:block;max-width:64px;height:auto;border:0;"></td>` : ""}
    <td valign="middle">
      <div style="font-size:18px;font-weight:700;color:${C.fg};">${esc(b.businessName)}</div>
      ${b.address ? `<div style="margin-top:2px;font-size:12px;line-height:1.5;color:${C.muted};">${nl2br(b.address)}</div>` : ""}
      ${contact ? `<div style="font-size:12px;color:${C.muted};">${contact}</div>` : ""}
    </td></tr></table>`;
}

function factRows(facts: [string, string][]) {
  return facts
    .map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;font-size:13px;color:${C.muted};white-space:nowrap;">${esc(k)}</td><td style="padding:3px 0;font-size:13px;font-weight:600;color:${C.fg};">${esc(v)}</td></tr>`)
    .join("");
}

export function renderSubBillEmail(b: SubBillDetail, main: MainBillDetail | null) {
  const biz = b.business;
  const logo = logoAttachment(biz);
  const method = PAYMENT_METHOD_LABEL[b.method];
  const m = b.challanMoney;
  const subject = main
    ? `Payment Voucher ${b.billNumber} – ${formatINR(b.amountPaise)} · Challan ${b.job.jobNumber} fully settled (${main.billNumber}) – ${biz.businessName}`
    : `Payment Voucher ${b.billNumber} – ${formatINR(b.amountPaise)} for Challan ${b.job.jobNumber} – ${biz.businessName}`;

  const facts: [string, string][] = [
    ["Voucher no.", b.billNumber],
    ["Date", formatDate(b.date)],
    ["Challan", b.job.jobNumber],
    ["Product", b.job.productName],
    ...(b.returnNumber ? [["Against return", b.returnNumber] as [string, string]] : []),
    ["Payment method", method],
    ...(b.reference ? [["Reference", b.reference] as [string, string]] : []),
    ...(b.advanceReason ? [["Advance", b.advanceReason] as [string, string]] : []),
  ];
  const account: [string, string][] = [
    ["Job work value", formatINR(m.valuePaise)],
    ["Paid to date", formatINR(m.paidPaise)],
    m.advancePaise > 0 ? ["Advance paid", formatINR(m.advancePaise)] : ["Outstanding", formatINR(m.outstandingPaise)],
  ];
  const against = b.returnNumber ? ` against return <b>${esc(b.returnNumber)}</b>` : "";
  const againstText = b.returnNumber ? ` against return ${b.returnNumber}` : "";

  // Legacy vouchers paid by quantity carry design lines; amount-based vouchers have none.
  const hasLines = b.lines.length > 0;
  const lineRows = b.lines
    .map((l, i) => `<tr>${td(String(i + 1), false, `color:${C.muted};`)}${td(esc(l.designName))}${td(formatQty(l.qty), true)}${td(formatINR(l.ratePaise), true)}${td(formatINR(l.amountPaise), true, "font-weight:600;")}</tr>`)
    .join("");
  const linesFoot = `<tfoot><tr style="background:${C.soft};">${td("", false, "border-bottom:0;")}${td("<b>Total</b>", false, "border-bottom:0;")}${td(`<b>${formatQty(b.qty)}</b>`, true, "border-bottom:0;")}${td("", true, "border-bottom:0;")}${td(`<b>${formatINR(b.amountPaise)}</b>`, true, "border-bottom:0;")}</tr></tfoot>`;

  let mainHtml = "";
  let mainText = "";
  if (main) {
    const t = main.totals;
    const designRows = main.designs
      .map(
        (d) =>
          `<tr>${td(`${esc(d.designName)}${d.designCode ? ` <span style="color:${C.muted};">(${esc(d.designCode)})</span>` : ""}`)}${td(formatQty(d.sent), true)}${td(formatQty(d.ok), true)}${td(formatQty(d.damaged + d.rejected + d.lost), true)}${td(formatINR(d.paidValuePaise), true, "font-weight:600;")}</tr>`,
      )
      .join("");
    const subRows = main.subBills
      .map((s) => `<tr>${td(esc(s.billNumber), false, s.id === b.id ? "font-weight:600;" : "")}${td(formatDate(s.date))}${td(esc(PAYMENT_METHOD_LABEL[s.method]))}${td(esc(s.returnNumber ?? "–"))}${td(formatINR(s.amountPaise), true)}</tr>`)
      .join("");
    mainHtml = `
      <div style="margin-top:32px;padding:16px 18px;background:${C.accentBg};border:1px solid #bbf7d0;border-radius:8px;">
        <div style="font-size:14px;font-weight:700;color:${C.accent};">Challan ${esc(main.job.jobNumber)} is fully settled</div>
        <div style="margin-top:4px;font-size:13px;color:${C.fg};">All job work returned on this challan has now been paid. Final Settlement <b>${esc(main.billNumber)}</b> dated ${formatDate(main.date)} totals <b>${formatINR(main.totalPaise)}</b>.</div>
      </div>
      ${heading(`Final Settlement ${esc(main.billNumber)} – design-wise`)}
      ${table(th("Design") + th("Issued", true) + th("Received good", true) + th("Damaged / rejected / lost", true) + th("Value", true), designRows)}
      <div style="margin-top:6px;font-size:12px;color:${C.muted};">Issued ${formatQty(t.sent)} · received good ${formatQty(t.ok)} · damaged ${formatQty(t.damaged)} · rejected ${formatQty(t.rejected)} · lost ${formatQty(t.lost)}</div>
      ${heading("Payment vouchers on this challan")}
      ${table(th("Voucher") + th("Date") + th("Method") + th("Return") + th("Amount", true), subRows)}`;
    mainText = [
      "",
      `CHALLAN ${main.job.jobNumber} IS FULLY SETTLED`,
      `Final Settlement ${main.billNumber} (${formatDate(main.date)}): ${formatINR(main.totalPaise)}.`,
      ...main.designs.map((d) => `  - ${d.designName}: issued ${formatQty(d.sent)}, good ${formatQty(d.ok)}, damaged/rejected/lost ${formatQty(d.damaged + d.rejected + d.lost)}, value ${formatINR(d.paidValuePaise)}`),
      "Payment vouchers:",
      ...main.subBills.map((s) => `  - ${s.billNumber} on ${formatDate(s.date)}: ${formatINR(s.amountPaise)} (${PAYMENT_METHOD_LABEL[s.method]})`),
    ].join("\n");
  }

  const contactLine = biz.phone ? ` or call us on ${esc(biz.phone)}` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.soft};font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid ${C.border};border-radius:10px;">
      <tr><td style="height:4px;background:${C.fg};border-radius:10px 10px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:28px 28px 32px;font-family:${FONT};">
        ${letterhead(biz, !!logo)}
        <div style="margin-top:28px;font-size:14px;line-height:1.6;color:${C.fg};">
          <p style="margin:0 0 12px;">Dear ${esc(b.client.name)},</p>
          <p style="margin:0;">We have made a payment of <b>${formatINR(b.amountPaise)}</b> to you${PAID_HOW[b.method]} on ${formatDate(b.date)} for job work on challan <b>${esc(b.job.jobNumber)}</b> (${esc(b.job.productName)})${against}. The details of this payment voucher are below for your records.</p>
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border:1px solid ${C.border};border-radius:8px;"><tr>
          <td valign="top" style="padding:14px 16px;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:${C.muted};">Payment Voucher</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">${factRows(facts)}</table></td>
          <td valign="top" align="right" style="padding:14px 16px;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:${C.muted};">Amount paid</div>
            <div style="margin-top:6px;font-size:24px;font-weight:700;color:${C.fg};">${formatINR(b.amountPaise)}</div></td>
        </tr></table>
        <div style="margin-top:8px;font-size:12px;font-style:italic;color:${C.muted};">${esc(amountInWords(b.amountPaise))}</div>

        ${heading(`Challan ${esc(b.job.jobNumber)} account after this payment`)}
        <table role="presentation" cellpadding="0" cellspacing="0">${factRows(account)}</table>

        ${hasLines ? `${heading("Work paid for")}${table(th("#") + th("Design") + th("Qty", true) + th("Rate", true) + th("Amount", true), lineRows, linesFoot)}` : ""}
        ${b.notes ? `${heading("Notes")}<div style="font-size:13px;line-height:1.6;color:${C.fg};">${nl2br(b.notes)}</div>` : ""}
        ${mainHtml}

        <div style="margin-top:32px;font-size:13px;line-height:1.6;color:${C.fg};">
          <p style="margin:0 0 12px;">If anything here does not match your records, please reply to this email${contactLine}.</p>
          <p style="margin:0;">Thank you,<br><b>${esc(biz.businessName)}</b></p>
        </div>
      </td></tr>
    </table>
    <div style="max-width:640px;margin-top:12px;font-size:11px;color:${C.muted};">This is a payment voucher from ${esc(biz.businessName)} for job work, not a tax invoice.</div>
  </td></tr></table>
</body></html>`;

  const text = [
    biz.businessName,
    ...(biz.address ? [biz.address] : []),
    [biz.phone, biz.email].filter(Boolean).join(" · "),
    "",
    `Dear ${b.client.name},`,
    "",
    `We have made a payment of ${formatINR(b.amountPaise)} to you${PAID_HOW[b.method]} on ${formatDate(b.date)} for job work on challan ${b.job.jobNumber} (${b.job.productName})${againstText}.`,
    "",
    `PAYMENT VOUCHER ${b.billNumber}`,
    ...facts.map(([k, v]) => `${k}: ${v}`),
    `Amount paid: ${formatINR(b.amountPaise)} (${amountInWords(b.amountPaise)})`,
    "",
    `Challan ${b.job.jobNumber} account after this payment:`,
    ...account.map(([k, v]) => `  ${k}: ${v}`),
    ...(hasLines
      ? ["", "Work paid for:", ...b.lines.map((l, i) => `  ${i + 1}. ${l.designName}: ${formatQty(l.qty)} x ${formatINR(l.ratePaise)} = ${formatINR(l.amountPaise)}`), `Total: ${formatQty(b.qty)}, ${formatINR(b.amountPaise)}`]
      : []),
    ...(b.notes ? ["", `Notes: ${b.notes}`] : []),
    mainText,
    "",
    `If anything here does not match your records, please reply to this email${biz.phone ? ` or call us on ${biz.phone}` : ""}.`,
    "",
    "Thank you,",
    biz.businessName,
  ].join("\n");

  return { subject, html, text, attachments: logo ? [logo] : [] };
}
