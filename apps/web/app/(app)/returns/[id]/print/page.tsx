"use client";

import { amountInWords, formatDate, formatINR, formatQty, L, PAY_STATUS_LABEL, roundQty } from "@av/shared";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SendWhatsAppButton } from "@/components/whatsapp/send-whatsapp";
import { ErrorBlock, LoadingBlock } from "@/components/ui/misc";
import { formatTime, istDay, useReturn } from "@/lib/returns";

/** A4 "JOB WORK RETURN / RECEIVING VOUCHER". Not a sales or tax invoice. */
export default function ReceivingVoucherPage() {
  const { id } = useParams<{ id: string }>();
  const q = useReturn(id);

  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={8} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const b = r.business;
  const voided = !!r.voidedAt;
  const p = r.payment;
  const t = r.lines.reduce(
    (s, l) => ({ ok: s.ok + l.okQty, damaged: s.damaged + l.damagedQty, rejected: s.rejected + l.rejectedQty, lost: s.lost + l.lostQty }),
    { ok: 0, damaged: 0, rejected: 0, lost: 0 },
  );
  const backDated = r.date.slice(0, 10) !== istDay(r.receivedAt);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href={`/returns/${r.id}`}>
            <ArrowLeft /> {r.returnNumber}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {!voided && <SendWhatsAppButton target={{ kind: "return", id: r.id }} />}
          <Button asChild variant="secondary" title="Download the receiving voucher as a PDF">
            <a href={`/api/returns/${r.id}/pdf`} download>
              <FileDown /> Save PDF
            </a>
          </Button>
          <Button onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      <article className="sheet print-plain mx-auto max-w-3xl overflow-hidden rounded-lg border border-border">
        <div className="h-1 bg-fg print:h-0.5" aria-hidden />
        <div className="p-6 sm:p-10 print:p-0 print:pt-4">
          {/* Letterhead */}
          <header className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.logo && <img src={b.logo} alt="" className="size-14 shrink-0 object-contain" />}
              <div className="min-w-0">
                <div className="text-lg leading-6 font-semibold tracking-[-0.01em]">{b.businessName}</div>
                {b.address && <div className="mt-1 max-w-xs text-xs leading-relaxed whitespace-pre-line text-fg-muted">{b.address}</div>}
                {(b.phone || b.email) && <div className="mt-0.5 text-xs text-fg-muted">{[b.phone, b.email].filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-fg-muted uppercase">Job work return</div>
              <div className="mt-0.5 text-[15px] font-semibold tracking-wide uppercase">Receiving Voucher</div>
              <dl className="num mt-2 grid grid-cols-[auto_auto] justify-start gap-x-3 gap-y-0.5 text-xs sm:justify-end">
                <dt className="text-fg-muted">Return no.</dt>
                <dd className="font-semibold">{r.returnNumber}</dd>
                <dt className="text-fg-muted">Date</dt>
                <dd className="text-fg-2">{formatDate(r.date)}</dd>
                <dt className="text-fg-muted">Time</dt>
                <dd className="text-fg-2">
                  {formatTime(r.receivedAt)}
                  {backDated && ` (entered ${formatDate(istDay(r.receivedAt))})`}
                </dd>
              </dl>
            </div>
          </header>

          {/* Parties */}
          <div className="mt-8 grid gap-6 rounded-md border border-border sm:grid-cols-2 sm:gap-0">
            <div className="px-4 py-3 sm:border-r sm:border-border">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Received from ({L.client})</div>
              <div className="mt-1 text-sm font-semibold">{r.client.name}</div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs sm:border-t-0">
              <dt className="text-fg-muted">{L.jobNumber}</dt>
              <dd className="font-medium text-fg-2">{r.job.jobNumber}</dd>
              <dt className="text-fg-muted">Product</dt>
              <dd className="font-medium text-fg-2">{r.productName}</dd>
              <dt className="text-fg-muted">Photos</dt>
              <dd className="font-medium text-fg-2">{r.photos.length ? `${r.photos.length} attached` : "None attached"}</dd>
              {r.enteredBy && (
                <>
                  <dt className="text-fg-muted">Entered by</dt>
                  <dd className="font-medium text-fg-2">{r.enteredBy}</dd>
                </>
              )}
            </dl>
          </div>

          {voided && (
            <div className="mt-6 rounded-md border-2 border-danger/50 px-4 py-2 text-[13px] font-semibold text-danger">
              VOID · {r.voidReason}
            </div>
          )}

          {/* Lines */}
          <section className="mt-8">
            <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-border pb-1.5">
              <h2 className="text-[10px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Design-wise receipt</h2>
              <span className="text-xs text-fg-muted">Unit: {r.unit}</span>
            </div>
            <div className="-mx-6 overflow-x-auto sm:mx-0">
              <table className="ledger [&_td:first-child]:pl-6 sm:[&_td:first-child]:pl-0 [&_th:first-child]:pl-6 sm:[&_th:first-child]:pl-0 [&_td:last-child]:pr-6 sm:[&_td:last-child]:pr-0 [&_th:last-child]:pr-6 sm:[&_th:last-child]:pr-0">
                <thead>
                  <tr>
                    <th>Design</th>
                    <th className="r">Good</th>
                    <th className="r">Damaged</th>
                    <th className="r">Rejected</th>
                    <th className="r">Lost</th>
                    <th className="r">Rate</th>
                    <th className="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="font-medium">{l.designName}</td>
                      <td className="r">{formatQty(l.okQty)}</td>
                      <td className="r">{formatQty(l.damagedQty)}</td>
                      <td className="r">{formatQty(l.rejectedQty)}</td>
                      <td className="r">{formatQty(l.lostQty)}</td>
                      <td className="r">{formatINR(l.ratePaise)}</td>
                      <td className="r font-medium">{formatINR(l.valuePaise)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="r">{formatQty(roundQty(t.ok))}</td>
                    <td className="r">{formatQty(roundQty(t.damaged))}</td>
                    <td className="r">{formatQty(roundQty(t.rejected))}</td>
                    <td className="r">{formatQty(roundQty(t.lost))}</td>
                    <td />
                    <td className="r">{formatINR(r.valuePaise)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Total + payment */}
          <div className="mt-8 flex break-inside-avoid flex-wrap items-end justify-between gap-4 rounded-md bg-surface-2 px-4 py-3 print:border print:border-border">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Job work value in words</div>
              <div className="mt-0.5 text-[13px] font-medium text-fg-2 italic">{amountInWords(r.valuePaise)}</div>
              {p && !voided && (
                <div className="num mt-2 text-xs text-fg-2">
                  Payment status: <span className="font-semibold">{PAY_STATUS_LABEL[p.status]}</span> · paid {formatINR(p.paidPaise)} · outstanding {formatINR(p.outstandingPaise)}
                  {p.outstandingPaise > 0 && p.dueDate && ` · due ${formatDate(p.dueDate)}`}
                  {p.overdueDays > 0 && ` (${p.overdueDays} days overdue)`}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-fg-muted">Total value</div>
              <div className="num text-2xl leading-8 font-semibold tracking-[-0.01em]">{formatINR(r.valuePaise)}</div>
            </div>
          </div>
          {r.notes && <p className="mt-4 text-xs text-fg-2">Notes: {r.notes}</p>}

          {/* Signatures */}
          <div className="break-inside-avoid">
            <footer className="mt-14 grid grid-cols-2 items-end gap-10 text-xs text-fg-muted print:mt-12">
              <div>
                <div className="border-t border-border-strong pt-1.5">Received by</div>
                <div className="text-[11px] text-fg-faint">For {b.businessName}</div>
              </div>
              <div className="text-right">
                <div className="border-t border-border-strong pt-1.5">Job worker</div>
                <div className="text-[11px] text-fg-faint">{r.client.name}</div>
              </div>
            </footer>
            <p className="mt-6 text-center text-[10px] text-fg-faint">Record of job work material received back. Not a sales or tax invoice.</p>
          </div>
        </div>
      </article>
    </div>
  );
}
