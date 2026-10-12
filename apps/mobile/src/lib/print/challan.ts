import { formatDate, formatINR, formatQty, roundQty, type JobDetail, type Settings, type Unit } from "@av/shared";
import { qrSvg } from "@/lib/qr";
import { termsLabel } from "@/lib/terms";
import { esc } from "./sheet";

/** The printed Job Work Challan with its QR code, as apps/web/components/jobs/challan-sheet.tsx. */
export function challanHtml(job: JobDetail, biz: Settings | undefined, worker: { workerCode?: string | null; phone?: string | null; address?: string | null } | undefined, publicUrl: string | undefined) {
  const byUnit = new Map<Unit, number>();
  let total = 0;
  for (const i of job.items) {
    byUnit.set(i.unit, roundQty((byUnit.get(i.unit) ?? 0) + i.quantity));
    total += i.expectedValuePaise;
  }
  const row = (k: string, v: string) => `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>`;
  const blanks = Array.from({ length: Math.max(0, 5 - job.items.length) }, () => "<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>").join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; } body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #18181b; font-size: 12.5px; margin: 0; }
    .num { font-variant-numeric: tabular-nums; } .muted { color: #6e6e76; }
    header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #18181b; padding-bottom: 12px; }
    .biz { display: flex; gap: 14px; } .biz img { width: 60px; height: 60px; object-fit: contain; } .biz .name { font-size: 22px; font-weight: 700; }
    .qr { text-align: center; font-size: 8px; letter-spacing: .06em; text-transform: uppercase; color: #6e6e76; } .qr svg { width: 92px; height: 92px; display: block; }
    h1 { text-align: center; font-size: 17px; letter-spacing: .2em; text-transform: uppercase; margin: 14px 0 2px; }
    .cancel { text-align: center; color: #c0352a; font-weight: 600; letter-spacing: .15em; text-transform: uppercase; }
    .parts { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid rgba(24,24,27,.4); margin-top: 12px; }
    .parts table { width: 100%; border-collapse: collapse; } .parts td { padding: 5px 8px; border-bottom: 1px solid rgba(24,24,27,.15); vertical-align: top; } .parts td.k { color: #6e6e76; width: 38%; }
    .parts > div:first-child { border-right: 1px solid rgba(24,24,27,.4); }
    table.items { width: 100%; border-collapse: collapse; margin-top: 14px; }
    table.items th, table.items td { border: 1px solid rgba(24,24,27,.3); padding: 5px 7px; } table.items th { background: #f4f4f2; font-size: 10.5px; text-transform: uppercase; text-align: left; }
    .r { text-align: right !important; } tfoot td { font-weight: 600; }
    .fine { font-size: 10.5px; color: #6e6e76; margin-top: 5px; }
    footer { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; font-size: 11px; color: #6e6e76; } footer div { border-top: 1px solid #18181b; padding-top: 4px; } footer div:last-child { text-align: right; }
  </style></head><body>
  <header>
    <div class="biz">${biz?.logo ? `<img src="${biz.logo}">` : ""}<div><div class="name">${esc(biz?.businessName ?? "AV Creation")}</div>
      ${biz?.address ? `<div class="muted" style="white-space:pre-line">${esc(biz.address)}</div>` : ""}
      ${biz?.phone || biz?.email ? `<div class="muted">${esc([biz?.phone && `Mob: ${biz.phone}`, biz?.email].filter(Boolean).join(" · "))}</div>` : ""}</div></div>
    ${publicUrl ? `<div class="qr">${qrSvg(publicUrl, 92)}Scan to view status</div>` : ""}
  </header>
  <h1>Job Work Challan</h1>
  ${job.status === "CANCELLED" ? `<div class="cancel">Cancelled</div>` : ""}
  <div class="parts">
    <div><table>${row("Challan No.", `<b>${esc(job.jobNumber)}</b>`)}${row("Date", formatDate(job.jobDate))}${row("Job worker", `<b>${esc(job.client.name)}${worker?.workerCode ? ` (${esc(worker.workerCode)})` : ""}</b>`)}${row("Mobile", esc(worker?.phone ?? "—"))}${worker?.address ? row("Address", `<span style="white-space:pre-line">${esc(worker.address)}</span>`) : ""}</table></div>
    <div><table>${row("Product", esc(job.product.name))}${row("Job work type", esc(job.jobWorkType?.name ?? "—"))}${row("Expected return", job.expectedReturnDate ? formatDate(job.expectedReturnDate) : "—")}${row("Payment terms", esc(termsLabel(job.terms.policy, job.terms.days)))}</table></div>
  </div>
  <table class="items num"><thead><tr><th style="width:24px">#</th><th>Design</th><th>Material</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Value</th></tr></thead><tbody>
    ${job.items.map((i, n) => `<tr><td class="muted">${n + 1}</td><td><b>${esc(i.designName)}</b>${i.designCode ? `<div class="muted">${esc(i.designCode)}</div>` : ""}${i.notes ? `<div class="muted">${esc(i.notes)}</div>` : ""}</td><td>${esc(i.material ? `${i.material.code} · ${i.material.name}` : "—")}</td><td class="r">${formatQty(i.quantity)}</td><td>${i.unit}</td><td class="r">${formatINR(i.ratePaise)}</td><td class="r">${formatINR(i.expectedValuePaise)}</td></tr>`).join("")}
    ${blanks}
  </tbody><tfoot><tr><td colspan="3" class="r">Total</td><td colspan="2" class="r">${[...byUnit].map(([u, q]) => `${formatQty(q)} ${u}`).join(" · ")}</td><td></td><td class="r">${formatINR(total)}</td></tr></tfoot></table>
  <p class="fine">Value = quantity × agreed job work rate. Final payment is on the work actually returned. This is a job work challan, not a sale.</p>
  ${job.notes ? `<p><b>Notes:</b> ${esc(job.notes)}</p>` : ""}
  <footer><div>Received by (job worker)</div><div>For ${esc(biz?.businessName ?? "AV Creation")}</div></footer>
  ${publicUrl ? `<p class="fine num" style="text-align:center;word-break:break-all">${esc(publicUrl)}</p>` : ""}
  </body></html>`;
}
