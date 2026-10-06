import { prisma } from "@av/db";
import { amountInWords, DISPATCH_KIND_LABEL, formatDate, formatINR, formatQty, PAY_STATUS_LABEL, roundQty, type DispatchKind, type ReturnDetail, type Settings, type Unit } from "@av/shared";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import { env } from "../env.js";
import { notFound } from "../lib/http.js";
import { num } from "./ledger.js";
import { getSettings } from "./billing.js";
import { getReturn } from "./returns.js";

/**
 * Server-rendered A4 PDFs of the job work receipts that are sent on WhatsApp (and downloadable from the app):
 * the Receiving Voucher for a return and the Material Issue Slip for a dispatch. Same content as the print pages.
 */

// Noto Sans carries the ₹ glyph (the built-in Helvetica does not).
const FONT_REGULAR = new URL("../../assets/fonts/NotoSans-Regular.ttf", import.meta.url).pathname;
const FONT_BOLD = new URL("../../assets/fonts/NotoSans-Bold.ttf", import.meta.url).pathname;

const C = { fg: "#18181b", fg2: "#3f3f46", muted: "#71717a", faint: "#a1a1aa", border: "#e4e4e7", soft: "#f4f4f5", danger: "#b91c1c" };
const M = 48; // page margin
const PAGE_W = 595.28; // A4
const W = PAGE_W - 2 * M;

type Doc = PDFKit.PDFDocument;

export interface PdfFile {
  filename: string;
  content: Buffer;
}

/** Streams a receipt PDF to the browser (shown inline, saved under its own filename). */
export function sendPdf(res: Response, pdf: PdfFile) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${pdf.filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(pdf.content);
}

function newDoc(title: string) {
  const doc = new PDFDocument({ size: "A4", margin: M, info: { Title: title, Producer: "AV ERP" } });
  doc.registerFont("r", FONT_REGULAR);
  doc.registerFont("b", FONT_BOLD);
  doc.font("r").fillColor(C.fg);
  return doc;
}

function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: env.businessTz });
const formatTime = (iso: string) => timeFmt.format(new Date(iso));

function logoBuffer(logo: string | null): Buffer | null {
  const m = logo?.match(/^data:image\/(?:png|jpeg);base64,(.+)$/);
  return m ? Buffer.from(m[1], "base64") : null;
}

/** Thin dark bar, business letterhead on the left and the document title + facts on the right. Returns the y below it. */
function header(doc: Doc, b: Settings, kicker: string, title: string, facts: [string, string][]) {
  doc.rect(M, M - 16, W, 3).fill(C.fg);
  const top = M;
  let x = M;
  const logo = logoBuffer(b.logo);
  if (logo) {
    try {
      doc.image(logo, M, top, { fit: [46, 46] });
      x = M + 58;
    } catch {
      /* unreadable logo – leave it out */
    }
  }
  const leftW = W * 0.55 - (x - M);
  doc.font("b").fontSize(14).fillColor(C.fg).text(b.businessName, x, top, { width: leftW });
  doc.font("r").fontSize(8.5).fillColor(C.muted);
  if (b.address) doc.text(b.address, x, doc.y + 2, { width: leftW, lineGap: 1 });
  const contact = [b.phone, b.email].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, x, doc.y + 1, { width: leftW });
  const leftBottom = doc.y;

  const rx = M + W * 0.55;
  const rw = W * 0.45;
  doc.font("b").fontSize(7.5).fillColor(C.muted).text(kicker.toUpperCase(), rx, top, { width: rw, align: "right", characterSpacing: 1.2 });
  doc.font("b").fontSize(12).fillColor(C.fg).text(title.toUpperCase(), rx, doc.y + 1, { width: rw, align: "right", characterSpacing: 0.6 });
  let y = doc.y + 6;
  for (const [k, v] of facts) {
    doc.font("b").fontSize(8.5).fillColor(C.fg2);
    const vw = Math.min(doc.widthOfString(v), rw - 70);
    doc.text(v, rx + rw - vw, y, { width: vw, align: "right" });
    doc.font("r").fillColor(C.muted).text(k, rx, y, { width: rw - vw - 10, align: "right" });
    y = doc.y + 1;
  }
  return Math.max(leftBottom, y) + 22;
}

/** Bordered two-column box: party on the left, key facts on the right. */
function partyBox(doc: Doc, y: number, label: string, name: string, sub: string | null, facts: [string, string][]) {
  const half = W / 2;
  const h = Math.max(54, 18 + facts.length * 13);
  doc.roundedRect(M, y, W, h, 4).lineWidth(0.75).stroke(C.border);
  doc.moveTo(M + half, y).lineTo(M + half, y + h).stroke(C.border);
  doc.font("b").fontSize(7).fillColor(C.muted).text(label.toUpperCase(), M + 12, y + 10, { width: half - 24, characterSpacing: 1 });
  doc.font("b").fontSize(11).fillColor(C.fg).text(name, M + 12, doc.y + 2, { width: half - 24 });
  if (sub) doc.font("r").fontSize(8.5).fillColor(C.muted).text(sub, M + 12, doc.y + 1, { width: half - 24 });
  let fy = y + 10;
  for (const [k, v] of facts) {
    doc.font("r").fontSize(8.5).fillColor(C.muted).text(k, M + half + 12, fy, { width: 80 });
    doc.font("b").fillColor(C.fg2).text(v, M + half + 96, fy, { width: half - 108 });
    fy += 13;
  }
  return y + h + 18;
}

function voidBanner(doc: Doc, y: number, reason: string | null) {
  doc.roundedRect(M, y, W, 24, 3).lineWidth(1.5).stroke(C.danger);
  doc.font("b").fontSize(10).fillColor(C.danger).text(`VOID${reason ? ` · ${reason}` : ""}`, M + 12, y + 6, { width: W - 24 });
  // Diagonal watermark
  doc.save();
  doc.rotate(-30, { origin: [PAGE_W / 2, 420] });
  doc.font("b").fontSize(110).fillColor(C.danger).fillOpacity(0.08).text("VOID", 0, 360, { width: PAGE_W, align: "center" });
  doc.restore();
  doc.fillOpacity(1);
  return y + 40;
}

interface Col {
  label: string;
  width: number; // fraction of W
  right?: boolean;
}

/** A ledger table with a header rule, body rows and an optional bold footer row. */
function table(doc: Doc, y: number, caption: string, captionRight: string | null, cols: Col[], rows: string[][], foot: string[] | null) {
  const xs: number[] = [];
  let acc = M;
  for (const c of cols) {
    xs.push(acc);
    acc += c.width * W;
  }
  const cell = (row: string[], cy: number, bold: boolean, color: string) => {
    let h = 0;
    row.forEach((v, i) => {
      const c = cols[i];
      doc.font(bold || i === 0 ? "b" : "r").fontSize(9).fillColor(color);
      const opts = { width: c.width * W - 8, align: c.right ? ("right" as const) : ("left" as const) };
      doc.text(v, xs[i] + (c.right ? 4 : 0), cy, opts);
      h = Math.max(h, doc.heightOfString(v, opts));
    });
    return h;
  };

  doc.font("b").fontSize(7).fillColor(C.muted).text(caption.toUpperCase(), M, y, { width: W, characterSpacing: 1 });
  if (captionRight) doc.font("r").fontSize(8).text(captionRight, M, y, { width: W, align: "right" });
  y = doc.y + 4;
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.75).stroke(C.border);
  y += 7;
  cols.forEach((c, i) => {
    doc.font("b").fontSize(7).fillColor(C.muted).text(c.label.toUpperCase(), xs[i] + (c.right ? 4 : 0), y, { width: c.width * W - 8, align: c.right ? "right" : "left", characterSpacing: 0.6 });
  });
  y += 14;
  doc.moveTo(M, y).lineTo(M + W, y).stroke(C.border);
  y += 6;
  for (const r of rows) {
    if (y > 760) {
      doc.addPage();
      y = M;
    }
    y += cell(r, y, false, C.fg2) + 6;
    doc.moveTo(M, y - 2).lineTo(M + W, y - 2).lineWidth(0.5).stroke(C.soft);
  }
  if (foot) {
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1).stroke(C.fg);
    y += 6;
    y += cell(foot, y, true, C.fg) + 4;
  }
  return y + 14;
}

/** Shaded box: words/notes on the left, big total on the right. */
function totalBox(doc: Doc, y: number, label: string, words: string, extra: string | null, totalLabel: string, total: string) {
  const h = extra ? 58 : 46;
  doc.roundedRect(M, y, W, h, 4).fill(C.soft);
  doc.font("b").fontSize(7).fillColor(C.muted).text(label.toUpperCase(), M + 12, y + 9, { width: W * 0.62, characterSpacing: 1 });
  doc.font("r").fontSize(9).fillColor(C.fg2).text(words, M + 12, doc.y + 2, { width: W * 0.62, oblique: true });
  if (extra) doc.font("r").fontSize(8).fillColor(C.fg2).text(extra, M + 12, doc.y + 3, { width: W * 0.62 });
  doc.font("r").fontSize(8).fillColor(C.muted).text(totalLabel, M + W * 0.62, y + 9, { width: W * 0.38 - 12, align: "right" });
  doc.font("b").fontSize(18).fillColor(C.fg).text(total, M + W * 0.62, doc.y, { width: W * 0.38 - 12, align: "right" });
  return y + h + 12;
}

function signatures(doc: Doc, y: number, left: [string, string], right: [string, string], footnote: string) {
  y = Math.max(y + 40, 690);
  if (y > 760) {
    doc.addPage();
    y = M + 60;
  }
  const w = W * 0.4;
  doc.moveTo(M, y).lineTo(M + w, y).lineWidth(0.75).stroke(C.faint);
  doc.moveTo(M + W - w, y).lineTo(M + W, y).stroke(C.faint);
  doc.font("r").fontSize(8.5).fillColor(C.muted).text(left[0], M, y + 5, { width: w });
  doc.fontSize(7.5).fillColor(C.faint).text(left[1], M, doc.y, { width: w });
  doc.font("r").fontSize(8.5).fillColor(C.muted).text(right[0], M + W - w, y + 5, { width: w, align: "right" });
  doc.fontSize(7.5).fillColor(C.faint).text(right[1], M + W - w, doc.y, { width: w, align: "right" });
  doc.fontSize(7.5).fillColor(C.faint).text(footnote, M, y + 46, { width: W, align: "center" });
}

// ───────────────────────── Receiving Voucher (return) ─────────────────────────

export function returnPdfFilename(returnNumber: string) {
  return `Receiving-Voucher-${returnNumber.replace(/[^\w.-]+/g, "-")}.pdf`;
}

export async function returnReceiptPdf(returnId: string, r?: ReturnDetail): Promise<PdfFile> {
  r ??= await getReturn(returnId);
  const b = r.business;
  const doc = newDoc(`Receiving Voucher ${r.returnNumber}`);
  const backDated = r.date.slice(0, 10) !== new Date(r.receivedAt).toLocaleDateString("en-CA", { timeZone: env.businessTz });

  let y = header(doc, b, "Job work return", "Receiving Voucher", [
    ["Return no.", r.returnNumber],
    ["Date", formatDate(r.date)],
    ["Time", `${formatTime(r.receivedAt)}${backDated ? ` (entered ${formatDate(r.receivedAt)})` : ""}`],
  ]);
  y = partyBox(doc, y, "Received from (Job worker)", r.client.name, null, [
    ["Challan no.", r.job.jobNumber],
    ["Product", r.productName],
    ["Photos", r.photos.length ? `${r.photos.length} attached` : "None attached"],
    ...(r.enteredBy ? [["Entered by", r.enteredBy] as [string, string]] : []),
  ]);
  if (r.voidedAt) y = voidBanner(doc, y, r.voidReason);

  const t = r.lines.reduce((s, l) => ({ ok: s.ok + l.okQty, damaged: s.damaged + l.damagedQty, rejected: s.rejected + l.rejectedQty, lost: s.lost + l.lostQty }), { ok: 0, damaged: 0, rejected: 0, lost: 0 });
  y = table(
    doc,
    y,
    "Design-wise receipt",
    `Unit: ${r.unit}`,
    [
      { label: "Design", width: 0.28 },
      { label: "Good", width: 0.11, right: true },
      { label: "Damaged", width: 0.12, right: true },
      { label: "Rejected", width: 0.12, right: true },
      { label: "Lost", width: 0.09, right: true },
      { label: "Rate", width: 0.13, right: true },
      { label: "Amount", width: 0.15, right: true },
    ],
    r.lines.map((l) => [l.designName, formatQty(l.okQty), formatQty(l.damagedQty), formatQty(l.rejectedQty), formatQty(l.lostQty), formatINR(l.ratePaise), formatINR(l.valuePaise)]),
    ["Total", formatQty(roundQty(t.ok)), formatQty(roundQty(t.damaged)), formatQty(roundQty(t.rejected)), formatQty(roundQty(t.lost)), "", formatINR(r.valuePaise)],
  );

  const p = r.payment;
  const payLine =
    p && !r.voidedAt
      ? `Payment status: ${PAY_STATUS_LABEL[p.status]} · paid ${formatINR(p.paidPaise)} · outstanding ${formatINR(p.outstandingPaise)}${p.outstandingPaise > 0 && p.dueDate ? ` · due ${formatDate(p.dueDate)}` : ""}${p.overdueDays > 0 ? ` (${p.overdueDays} days overdue)` : ""}`
      : null;
  y = totalBox(doc, y, "Job work value in words", amountInWords(r.valuePaise), payLine, "Total value", formatINR(r.valuePaise));
  if (r.notes) doc.font("r").fontSize(8.5).fillColor(C.fg2).text(`Notes: ${r.notes}`, M, y, { width: W });

  signatures(doc, doc.y, ["Received by", `For ${b.businessName}`], ["Job worker", r.client.name], "Record of job work material received back. Not a sales or tax invoice.");
  return { filename: returnPdfFilename(r.returnNumber), content: await toBuffer(doc) };
}

// ───────────────────────── Material Issue Slip (dispatch) ─────────────────────────

export interface DispatchDoc {
  id: string;
  /** "JW-045/I2" – the challan number plus the issue's position on the challan. */
  ref: string;
  date: string;
  createdAt: string;
  kind: DispatchKind;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  enteredBy: string | null;
  job: { id: string; jobNumber: string; productName: string; dueDate: string | null };
  client: { id: string; name: string; phone: string | null; workerCode: string };
  unit: Unit;
  lines: { designName: string; materialName: string | null; unit: Unit; qty: number }[];
  total: number;
  business: Settings;
}

export async function getDispatch(dispatchId: string): Promise<DispatchDoc> {
  const d = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: {
      lines: { include: { jobItem: { select: { designName: true, unit: true, sortOrder: true, material: { select: { name: true } } } } } },
      job: { select: { id: true, jobNumber: true, expectedReturnDate: true, product: { select: { name: true, unit: true } }, client: { select: { id: true, name: true, phone: true, workerCode: true } } } },
    },
  });
  if (!d) throw notFound("Material issue");
  const [position, business, user] = await Promise.all([
    prisma.dispatch.count({ where: { jobId: d.jobId, createdAt: { lte: d.createdAt } } }),
    getSettings(),
    d.enteredById ? prisma.user.findUnique({ where: { id: d.enteredById }, select: { name: true } }) : null,
  ]);
  const lines = [...d.lines]
    .sort((a, b) => a.jobItem.sortOrder - b.jobItem.sortOrder)
    .map((l) => ({ designName: l.jobItem.designName, materialName: l.jobItem.material?.name ?? null, unit: l.jobItem.unit as Unit, qty: num(l.qty) }));
  return {
    id: d.id,
    ref: `${d.job.jobNumber}/I${position}`,
    date: d.date.toISOString(),
    createdAt: d.createdAt.toISOString(),
    kind: d.kind,
    notes: d.notes,
    voidedAt: d.voidedAt?.toISOString() ?? null,
    voidReason: d.voidReason,
    enteredBy: user?.name ?? null,
    job: { id: d.job.id, jobNumber: d.job.jobNumber, productName: d.job.product.name, dueDate: d.job.expectedReturnDate?.toISOString() ?? null },
    client: d.job.client,
    unit: d.job.product.unit as Unit,
    lines,
    total: roundQty(lines.reduce((s, l) => s + l.qty, 0)),
    business,
  };
}

export function issuePdfFilename(ref: string) {
  return `Material-Issue-${ref.replace(/[^\w.-]+/g, "-")}.pdf`;
}

export async function issueReceiptPdf(dispatchId: string, d?: DispatchDoc): Promise<PdfFile> {
  d ??= await getDispatch(dispatchId);
  const b = d.business;
  const doc = newDoc(`Material Issue ${d.ref}`);

  let y = header(doc, b, "Job work material", "Material Issue Slip", [
    ["Slip no.", d.ref],
    ["Date", formatDate(d.date)],
    ["Time", formatTime(d.createdAt)],
  ]);
  y = partyBox(doc, y, "Issued to (Job worker)", d.client.name, d.client.phone, [
    ["Challan no.", d.job.jobNumber],
    ["Product", d.job.productName],
    ["Issue type", DISPATCH_KIND_LABEL[d.kind]],
    ...(d.job.dueDate ? [["Return by", formatDate(d.job.dueDate)] as [string, string]] : []),
    ...(d.enteredBy ? [["Issued by", d.enteredBy] as [string, string]] : []),
  ]);
  if (d.voidedAt) y = voidBanner(doc, y, d.voidReason);

  const showMaterial = d.lines.some((l) => l.materialName);
  y = table(
    doc,
    y,
    "Material issued",
    `Unit: ${d.unit}`,
    showMaterial
      ? [
          { label: "#", width: 0.06 },
          { label: "Design", width: 0.38 },
          { label: "Material", width: 0.36 },
          { label: "Qty", width: 0.2, right: true },
        ]
      : [
          { label: "#", width: 0.08 },
          { label: "Design", width: 0.64 },
          { label: "Qty", width: 0.28, right: true },
        ],
    d.lines.map((l, i) => [String(i + 1), l.designName, ...(showMaterial ? [l.materialName ?? "–"] : []), `${formatQty(l.qty)} ${l.unit}`]),
    ["", "Total", ...(showMaterial ? [""] : []), `${formatQty(d.total)} ${d.unit}`],
  );
  if (d.notes) {
    doc.font("r").fontSize(8.5).fillColor(C.fg2).text(`Notes: ${d.notes}`, M, y, { width: W });
    y = doc.y + 10;
  }
  doc.font("r").fontSize(8.5).fillColor(C.fg2).text("Please check the material on receipt and return the finished work with this challan number.", M, y, { width: W });

  signatures(doc, doc.y, ["Issued by", `For ${b.businessName}`], ["Received by (job worker)", d.client.name], "Record of job work material issued. Not a sales or tax invoice.");
  return { filename: issuePdfFilename(d.ref), content: await toBuffer(doc) };
}
