import { amountInWords, formatINR, type Client, type MoneyPosition, type Settings } from "@av/shared";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { toast } from "@/components/ui/toast";

/**
 * A4 paper documents (payment voucher, final settlement, challan, worker sheet) rendered from HTML with
 * expo-print. The layout mirrors apps/web/components/billing/bill-sheet.tsx so a printout looks the same
 * whichever app made it.
 */
export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Segoe UI", Arial, sans-serif; color: #18181b; font-size: 12px; line-height: 1.45; margin: 0; }
  .num { font-variant-numeric: tabular-nums; }
  .bar { height: 3px; background: #18181b; margin-bottom: 16px; }
  header { display: flex; justify-content: space-between; gap: 24px; }
  .biz { display: flex; gap: 14px; }
  .biz img { width: 52px; height: 52px; object-fit: contain; }
  .biz .name { font-size: 17px; font-weight: 600; }
  .muted { color: #6e6e76; } .faint { color: #a1a1a8; }
  .kind { font-size: 9px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: #6e6e76; }
  .title { font-size: 15px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .right { text-align: right; }
  dl.kv { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 8px 0 0; justify-content: end; }
  dl.kv dt { color: #6e6e76; } dl.kv dd { margin: 0; font-weight: 600; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #e4e4e0; border-radius: 6px; margin-top: 24px; }
  .parties > div { padding: 10px 14px; } .parties > div:first-child { border-right: 1px solid #e4e4e0; }
  .label { font-size: 9px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #6e6e76; }
  dl.details { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; margin: 0; }
  dl.details dt { color: #6e6e76; } dl.details dd { margin: 0; font-weight: 500; }
  section { margin-top: 24px; break-inside: avoid; }
  section h2 { font-size: 9px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #6e6e76; border-bottom: 1px solid #e4e4e0; padding-bottom: 5px; margin: 0 0 6px; display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 10px; font-weight: 500; color: #6e6e76; text-align: left; padding: 5px 6px; border-bottom: 1px solid #e4e4e0; }
  td { padding: 6px; border-bottom: 1px solid #f0f0ee; vertical-align: top; }
  th.r, td.r { text-align: right; } tfoot td { font-weight: 600; border-top: 1px solid #c8c8c4; border-bottom: 0; }
  .amount { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; background: #f4f4f2; border-radius: 6px; padding: 12px 14px; margin-top: 24px; }
  .amount .words { font-style: italic; font-weight: 500; color: #3f3f46; margin-top: 2px; }
  .amount .big { font-size: 22px; font-weight: 600; }
  footer { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; align-items: end; color: #6e6e76; font-size: 11px; }
  footer .line { border-top: 1px solid #c8c8c4; padding-top: 5px; }
  .stamp { display: inline-block; transform: rotate(-4deg); border: 2px solid; border-radius: 4px; padding: 3px 12px; font-weight: 700; letter-spacing: .18em; font-size: 11px; text-transform: uppercase; margin-bottom: 10px; }
  .stamp.danger { color: #c0352a; border-color: rgba(192,53,42,.5); } .stamp.success { color: #1d7a4b; border-color: rgba(29,122,75,.5); }
  .note { text-align: center; font-size: 9px; color: #a1a1a8; margin-top: 22px; }
`;

export function sheetHtml(o: {
  business: Settings;
  kind: string;
  title: string;
  number: string;
  numberLabel?: string;
  date: string;
  paidTo: Client;
  details: [string, string][];
  body: string;
  stamp?: { label: string; tone: "danger" | "success" };
  signatures?: { worker: string; business: string };
}) {
  const b = o.business;
  const sig = o.signatures ?? { worker: "Received by", business: "Paid by" };
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <div class="bar"></div>
  <header>
    <div class="biz">${b.logo ? `<img src="${b.logo}">` : ""}<div><div class="name">${esc(b.businessName)}</div>
      ${b.address ? `<div class="muted" style="white-space:pre-line">${esc(b.address)}</div>` : ""}
      ${b.phone || b.email ? `<div class="muted">${esc([b.phone, b.email].filter(Boolean).join(" · "))}</div>` : ""}</div></div>
    <div class="right"><div class="kind">${esc(o.kind)}</div><div class="title">${esc(o.title)}</div>
      <dl class="kv num"><dt>${esc(o.numberLabel ?? "Voucher no.")}</dt><dd>${esc(o.number)}</dd><dt>Date</dt><dd>${esc(o.date)}</dd></dl></div>
  </header>
  <div class="parties">
    <div><div class="label">Paid to (job worker)</div>
      <div style="font-weight:600;margin-top:3px">${esc(o.paidTo.name)} <span class="muted num" style="font-weight:400">${esc(o.paidTo.workerCode)}</span></div>
      ${o.paidTo.businessName ? `<div>${esc(o.paidTo.businessName)}</div>` : ""}
      ${o.paidTo.address ? `<div class="muted" style="white-space:pre-line">${esc(o.paidTo.address)}</div>` : ""}
      ${o.paidTo.phone ? `<div class="muted num">${esc(o.paidTo.phone)}</div>` : ""}</div>
    <div><dl class="details">${o.details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
  </div>
  ${o.body}
  <footer>
    <div><div class="line">${esc(sig.worker)}</div><div class="faint">${esc(o.paidTo.name)}</div></div>
    <div class="right">${o.stamp ? `<div class="stamp ${o.stamp.tone}">${esc(o.stamp.label)}</div>` : ""}<div class="line">${esc(sig.business)}</div><div class="faint">For ${esc(b.businessName)}</div></div>
  </footer>
  <p class="note">Payment record for job work charges. This is not a sales or tax invoice; no GST is charged.</p>
  </body></html>`;
}

export const amountBox = (label: string, paise: number, extra = "") =>
  `<div class="amount"><div><div class="label">Amount in words</div><div class="words">${esc(amountInWords(paise))}</div>${extra}</div><div class="right"><div class="muted">${esc(label)}</div><div class="big num">${esc(formatINR(paise))}</div></div></div>`;

export const challanAccount = (m: MoneyPosition) =>
  `<section><h2>Challan account</h2><table class="num"><tbody>
    <tr><td>Job work value</td><td class="r">${formatINR(m.valuePaise)}</td></tr>
    <tr><td>Paid to date</td><td class="r">${formatINR(m.paidPaise)}</td></tr>
    ${m.advancePaise > 0 ? `<tr><td>Advance (paid over value)</td><td class="r">${formatINR(m.advancePaise)}</td></tr>` : `<tr><td>Outstanding</td><td class="r">${formatINR(m.outstandingPaise)}</td></tr>`}
  </tbody></table></section>`;

/** Render to a PDF named after the document and open the share sheet (WhatsApp, Drive, print apps…). */
export async function sharePdf(html: string, filename: string) {
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const named = new File(Paths.cache, filename);
    if (named.exists) named.delete();
    new File(uri).move(named);
    await Sharing.shareAsync(named.uri, { mimeType: "application/pdf", dialogTitle: filename, UTI: "com.adobe.pdf" });
  } catch (e) {
    toast.error(`Couldn't make the PDF: ${e instanceof Error ? e.message : e}`);
  }
}

/** Send straight to the Android print service (a Wi-Fi printer, or Save as PDF). */
export async function printHtml(html: string) {
  try {
    await Print.printAsync({ html });
  } catch {
    /* cancelled */
  }
}
