"use client";

import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type InvoiceDetail, type PaymentRow } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { PaymentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}`) });
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [voidPay, setVoidPay] = useState<PaymentRow | null>(null);
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/invoices/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Invoice cancelled. Its pieces can be billed again.");
      setCancelOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const voidPayment = useMutation({
    mutationFn: (reason: string) => api.post(`/payments/${voidPay!.id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Payment voided");
      setVoidPay(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={8} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const inv = q.data;
  const b = inv.business;
  const cancelled = inv.status === "CANCELLED";
  const activePayments = inv.payments.filter((p) => !p.voidedAt);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/invoices" className="hover:text-fg">
              Invoices
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            <h1 className="num text-xl leading-7 font-semibold tracking-[-0.01em]">{inv.invoiceNumber}</h1>
            <PaymentStatusBadge status={inv.status} />
          </div>
          <div className="num mt-0.5 text-[13px] text-fg-muted">
            <Link href={`/clients/${inv.client.id}`} className="font-medium text-fg-2 hover:text-accent">
              {inv.client.name}
            </Link>{" "}
            · {formatDate(inv.date)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer /> Print / Save PDF
          </Button>
          {!cancelled && inv.outstandingPaise > 0 && (
            <Button onClick={() => setPayOpen(true)}>
              <Wallet /> Record payment
            </Button>
          )}
          {!cancelled && (
            <Menu>
              <MenuItem danger icon={<Ban />} onSelect={() => setCancelOpen(true)}>
                Cancel invoice
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {cancelled && (
        <Notice tone="danger" icon={Ban} className="no-print">
          <span className="font-medium text-fg">Cancelled on {formatDate(inv.cancelledAt)}.</span> <span className="text-fg-muted">{inv.cancelReason}</span>
        </Notice>
      )}

      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem] print:block">
        {/* Printable invoice */}
        <article className="sheet print-plain relative min-w-0 overflow-hidden rounded-lg border border-border p-6 sm:p-10">
          {cancelled && (
            <div className="pointer-events-none absolute top-8 right-8 rounded border border-danger/40 px-2 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-danger uppercase">Cancelled</div>
          )}
          <div className="flex flex-wrap justify-between gap-6">
            <div>
              <div className="text-[15px] font-semibold">{b.businessName}</div>
              {b.address && <div className="mt-1 max-w-xs text-xs leading-relaxed whitespace-pre-line text-fg-muted">{b.address}</div>}
              <div className="text-xs text-fg-muted">{[b.phone, b.email].filter(Boolean).join(" · ")}</div>
              {b.gstin && <div className="num text-xs text-fg-muted">GSTIN {b.gstin}</div>}
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted">INVOICE</div>
              <div className="num mt-1 text-xl leading-7 font-semibold">{inv.invoiceNumber}</div>
              <dl className="num mt-1 text-xs text-fg-muted">
                <div>
                  <dt className="inline">Date </dt>
                  <dd className="inline text-fg-2">{formatDate(inv.date)}</dd>
                </div>
                {inv.dueDate && (
                  <div>
                    <dt className="inline">Due </dt>
                    <dd className="inline text-fg-2">{formatDate(inv.dueDate)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          <div className="my-8 border-t border-border" />
          <div className="mb-8">
            <div className="text-[11px] font-medium text-fg-muted">Billed to</div>
            <div className="mt-1 text-sm font-semibold">{inv.client.name}</div>
            {inv.client.businessName && <div className="text-xs text-fg-2">{inv.client.businessName}</div>}
            {inv.client.address && <div className="text-xs whitespace-pre-line text-fg-muted">{inv.client.address}</div>}
            {inv.client.gstin && <div className="num text-xs text-fg-muted">GSTIN {inv.client.gstin}</div>}
          </div>
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="ledger [&_td:first-child]:pl-4 sm:[&_td:first-child]:pl-0 sm:[&_th:first-child]:pl-0 [&_td:last-child]:pr-4 sm:[&_td:last-child]:pr-0 sm:[&_th:last-child]:pr-0">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Design / work</th>
                  <th>Job</th>
                  <th className="r">Qty</th>
                  <th className="r">Rate</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="num text-fg-faint">{i + 1}</td>
                    <td>
                      <div className="font-medium">{l.designName}</div>
                      <div className="text-xs text-fg-muted">{l.productName}</div>
                    </td>
                    <td>
                      <Link href={`/jobs/${l.jobId}`} className="num text-fg-2 hover:text-accent">
                        {l.jobNumber}
                      </Link>
                    </td>
                    <td className="r">{formatQty(l.qty)}</td>
                    <td className="r">{formatINR(l.ratePaise)}</td>
                    <td className="r font-medium">{formatINR(l.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{inv.taxPaise > 0 ? "Subtotal" : "Total"}</td>
                  <td className="r">{formatQty(inv.qty)}</td>
                  <td />
                  <td className="r">{formatINR(inv.subtotalPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="num mt-4 ml-auto max-w-[16rem] text-[13px]">
            {inv.taxPaise > 0 && (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-fg-muted">Tax ({inv.taxPercent}%)</span>
                  <span>{formatINR(inv.taxPaise)}</span>
                </div>
                <div className="flex justify-between border-t border-border py-1.5 font-semibold">
                  <span>Total</span>
                  <span>{formatINR(inv.totalPaise)}</span>
                </div>
              </>
            )}
            {inv.paidPaise > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-fg-muted">Paid</span>
                <span>− {formatINR(inv.paidPaise)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border-strong pt-2 text-sm font-semibold">
              <span>Balance due</span>
              <span>{formatINR(inv.outstandingPaise)}</span>
            </div>
          </div>
          {(inv.notes || b.invoiceFooter) && (
            <div className="mt-10 border-t border-border pt-4 text-xs leading-relaxed text-fg-muted">
              {inv.notes && <p className="whitespace-pre-line">{inv.notes}</p>}
              {b.invoiceFooter && <p className="mt-2 whitespace-pre-line">{b.invoiceFooter}</p>}
            </div>
          )}
        </article>

        {/* Side panel */}
        <aside className="no-print space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <dl className="num space-y-1.5 px-4 py-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Total</dt>
                <dd className="font-medium">{formatINR(inv.totalPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Paid</dt>
                <dd className="font-medium">{formatINR(inv.paidPaise)}</dd>
              </div>
            </dl>
            <div className="border-t border-border px-4 py-3">
              <div className="text-xs text-fg-muted">Outstanding</div>
              <div className={cn("num mt-0.5 text-2xl leading-8 font-semibold tracking-[-0.01em]", inv.outstandingPaise > 0 && !cancelled ? "text-danger" : "text-fg")}>{formatINR(inv.outstandingPaise)}</div>
            </div>
          </Card>
          <Section title="Payments" description={activePayments.length ? `${activePayments.length}` : undefined}>
            {inv.payments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong px-4 py-4 text-[13px] text-fg-muted">No payments yet.</p>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {inv.payments.map((p) => (
                    <li key={p.id} className={cn("group flex items-start justify-between gap-3 px-4 py-2.5", p.voidedAt && "text-fg-muted")}>
                      <div className="min-w-0">
                        <div className={cn("num text-[13px] font-medium", p.voidedAt && "text-fg-faint line-through")}>{formatINR(p.amountPaise)}</div>
                        <div className="num truncate text-xs text-fg-muted">
                          {formatDate(p.date)} · {PAYMENT_METHOD_LABEL[p.method]}
                          {p.reference && ` · ${p.reference}`}
                        </div>
                        {p.voidedAt && <div className="text-xs text-danger">Voided: {p.voidReason}</div>}
                      </div>
                      {!p.voidedAt && (
                        <button className="rounded px-1 text-xs font-medium text-fg-faint transition-colors group-hover:text-fg-muted hover:!text-danger" onClick={() => setVoidPay(p)}>
                          Void
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Section>
        </aside>
      </div>

      <PaymentDialog invoice={inv} open={payOpen} onOpenChange={setPayOpen} />
      <ReasonDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${inv.invoiceNumber}?`} description="The invoice stays in history. Its pieces become billable again." confirmLabel="Cancel invoice" loading={cancel.isPending} onConfirm={(r) => cancel.mutate(r)} />
      <ReasonDialog open={!!voidPay} onOpenChange={(o) => !o && setVoidPay(null)} title={`Void payment of ${voidPay ? formatINR(voidPay.amountPaise) : ""}?`} description="It stays listed, crossed out, and the outstanding amount goes back up." confirmLabel="Void payment" loading={voidPayment.isPending} onConfirm={(r) => voidPayment.mutate(r)} />
    </div>
  );
}
