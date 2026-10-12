import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type MainBillDetail, type SubBillDetail } from "@av/shared";
import { amountBox, challanAccount, esc, sheetHtml } from "./sheet";

/** Payment voucher (sub bill), as on the web's /bills/sub/[id]. */
export function voucherHtml(b: SubBillDetail) {
  const lines = b.lines.length
    ? `<section><h2>Work paid for</h2><table class="num"><thead><tr><th>Design</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>
      ${b.lines.map((l) => `<tr><td>${esc(l.designName)}</td><td class="r">${formatQty(l.qty)}</td><td class="r">${formatINR(l.ratePaise)}</td><td class="r">${formatINR(l.amountPaise)}</td></tr>`).join("")}
      </tbody></table></section>`
    : "";
  return sheetHtml({
    business: b.business,
    kind: "Job work payment",
    title: "Payment Voucher",
    number: b.billNumber,
    date: formatDate(b.date),
    paidTo: b.client,
    details: [
      ["Challan", `${b.job.jobNumber} · ${b.job.productName}`],
      ...(b.returnNumber ? ([["Return", b.returnNumber]] as [string, string][]) : []),
      ["Paid by", PAYMENT_METHOD_LABEL[b.method]],
      ...(b.reference ? ([["Reference", b.reference]] as [string, string][]) : []),
    ],
    body: `${lines}${amountBox("Amount paid", b.amountPaise, b.advanceReason ? `<div class="muted" style="margin-top:4px">Advance: ${esc(b.advanceReason)}</div>` : "")}${challanAccount(b.challanMoney)}${b.notes ? `<section><h2>Notes</h2><div>${esc(b.notes)}</div></section>` : ""}`,
    stamp: b.voidedAt ? { label: "Void", tone: "danger" } : undefined,
  });
}

/** Final settlement (main bill): design-wise work and every voucher on the challan. */
export function settlementHtml(m: MainBillDetail) {
  const u = m.product.unit;
  const designs = `<section><h2>Work done <span>${esc(m.product.name)} · ${u}</span></h2><table class="num"><thead><tr><th>Design</th><th class="r">Ordered</th><th class="r">Issued</th><th class="r">Good</th><th class="r">Dmg/Rej/Lost</th><th class="r">Rate</th><th class="r">Payable</th><th class="r">Value</th></tr></thead><tbody>
    ${m.designs.map((d) => `<tr><td>${esc(d.designName)}</td><td class="r">${formatQty(d.quantity)}</td><td class="r">${formatQty(d.sent)}</td><td class="r">${formatQty(d.ok)}</td><td class="r">${formatQty(d.damaged)}/${formatQty(d.rejected)}/${formatQty(d.lost)}</td><td class="r">${formatINR(d.ratePaise)}</td><td class="r">${formatQty(d.paidQty)}</td><td class="r">${formatINR(d.paidValuePaise)}</td></tr>`).join("")}
    </tbody></table></section>`;
  const vouchers = `<section><h2>Payments</h2><table class="num"><thead><tr><th>Voucher</th><th>Date</th><th>Method</th><th class="r">Amount</th></tr></thead><tbody>
    ${m.subBills.map((s) => `<tr${s.voidedAt ? ' style="color:#a1a1a8;text-decoration:line-through"' : ""}><td>${esc(s.billNumber)}</td><td>${formatDate(s.date)}</td><td>${PAYMENT_METHOD_LABEL[s.method]}${s.reference ? ` · ${esc(s.reference)}` : ""}</td><td class="r">${formatINR(s.amountPaise)}</td></tr>`).join("")}
    </tbody></table></section>`;
  return sheetHtml({
    business: m.business,
    kind: "Job work settlement",
    title: "Final Settlement",
    number: m.billNumber,
    numberLabel: "Settlement no.",
    date: formatDate(m.date),
    paidTo: m.client,
    details: [
      ["Challan", m.job.jobNumber],
      ["Product", m.product.name],
      ["Challan date", formatDate(m.job.jobDate)],
      ...(m.job.completedAt ? ([["Completed", formatDate(m.job.completedAt)]] as [string, string][]) : []),
    ],
    body: `${designs}${vouchers}${amountBox("Total paid", m.totalPaise)}`,
    stamp: m.cancelledAt ? { label: "Cancelled", tone: "danger" } : { label: "Settled", tone: "success" },
  });
}
