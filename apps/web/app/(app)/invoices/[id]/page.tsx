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
import { Card, CardHeader } from "@/components/ui/card";
import { ErrorBlock, LoadingBlock, Stat } from "@/components/ui/misc";
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
    onSuccess: () => { qc.invalidateQueries(); toast.success("Invoice cancelled. Its pieces can be billed again."); setCancelOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const voidPayment = useMutation({
    mutationFn: (reason: string) => api.post(`/payments/${voidPay!.id}/void`, { reason }),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Payment voided"); setVoidPay(null); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <ErrorBlock error={q.error} />;
  const inv = q.data;
  const b = inv.business;
  const cancelled = inv.status === "CANCELLED";
  const activePayments = inv.payments.filter((p) => !p.voidedAt);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      {/* Printable invoice */}
      <Card className="print-plain relative overflow-hidden p-6 sm:p-10">
        {cancelled && <div className="pointer-events-none absolute top-16 right-[-3rem] rotate-12 border-4 border-madder/50 px-6 py-1 font-display text-3xl font-bold tracking-widest text-madder/50 uppercase">Cancelled</div>}
        <div className="flex flex-wrap justify-between gap-6">
          <div>
            <div className="font-display text-2xl font-semibold text-ink">{b.businessName}</div>
            {b.address && <div className="mt-1 max-w-xs text-sm whitespace-pre-line text-muted">{b.address}</div>}
            <div className="text-sm text-muted">{[b.phone, b.email].filter(Boolean).join(" · ")}</div>
            {b.gstin && <div className="text-sm text-muted">GSTIN: {b.gstin}</div>}
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-semibold tracking-tight text-indigo">INVOICE</div>
            <div className="mt-1 font-semibold">{inv.invoiceNumber}</div>
            <div className="text-sm text-muted">Date: {formatDate(inv.date)}</div>
            {inv.dueDate && <div className="text-sm text-muted">Due: {formatDate(inv.dueDate)}</div>}
          </div>
        </div>
        <div className="stitch my-6" />
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-wide text-muted uppercase">Billed to</div>
          <div className="mt-1 text-lg font-semibold">{inv.client.name}</div>
          {inv.client.businessName && <div className="text-sm">{inv.client.businessName}</div>}
          {inv.client.address && <div className="text-sm whitespace-pre-line text-muted">{inv.client.address}</div>}
          {inv.client.gstin && <div className="text-sm text-muted">GSTIN: {inv.client.gstin}</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr><th>#</th><th>Design / Work</th><th>Job</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="text-muted">{i + 1}</td>
                  <td><div className="font-semibold">{l.designName}</div><div className="text-sm text-muted">{l.productName}</div></td>
                  <td><Link href={`/jobs/${l.jobId}`} className="text-indigo hover:underline">{l.jobNumber}</Link></td>
                  <td className="r num">{formatQty(l.qty)}</td>
                  <td className="r num">{formatINR(l.ratePaise)}</td>
                  <td className="r num font-semibold">{formatINR(l.amountPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{inv.taxPaise > 0 ? "Subtotal" : "Total"}</td>
                <td className="r num">{formatQty(inv.qty)}</td>
                <td />
                <td className="r num">{formatINR(inv.subtotalPaise)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          {inv.taxPaise > 0 && (
            <>
              <div className="flex justify-between"><span className="text-muted">Tax ({inv.taxPercent}%)</span><span className="num">{formatINR(inv.taxPaise)}</span></div>
              <div className="flex justify-between border-t border-ink pt-1 text-base font-bold"><span>Total</span><span className="num">{formatINR(inv.totalPaise)}</span></div>
            </>
          )}
          {inv.paidPaise > 0 && <div className="flex justify-between"><span className="text-muted">Paid</span><span className="num text-leaf">− {formatINR(inv.paidPaise)}</span></div>}
          <div className="flex justify-between rounded-lg bg-paper px-3 py-2 text-base font-bold"><span>Balance due</span><span className="num">{formatINR(inv.outstandingPaise)}</span></div>
        </div>
        {(inv.notes || b.invoiceFooter) && (
          <div className="mt-8 text-sm text-muted">
            {inv.notes && <p className="whitespace-pre-line">{inv.notes}</p>}
            {b.invoiceFooter && <p className="mt-2 whitespace-pre-line">{b.invoiceFooter}</p>}
          </div>
        )}
      </Card>

      {/* Side panel */}
      <div className="no-print space-y-5 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <PaymentStatusBadge status={inv.status} />
            <Link href={`/clients/${inv.client.id}`} className="text-sm font-semibold text-indigo hover:underline">{inv.client.name}</Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Total" value={formatINR(inv.totalPaise)} />
            <Stat label="Paid" value={formatINR(inv.paidPaise)} tone="leaf" />
          </div>
          <div className="stitch my-4" />
          <Stat label="Outstanding" value={formatINR(inv.outstandingPaise)} tone={inv.outstandingPaise > 0 ? "madder" : "leaf"} size="lg" />
          <div className="mt-5 grid gap-2">
            {!cancelled && inv.outstandingPaise > 0 && (
              <Button size="lg" variant="accent" onClick={() => setPayOpen(true)}><Wallet /> Record payment</Button>
            )}
            <Button variant="secondary" onClick={() => window.print()}><Printer /> Print / Save PDF</Button>
            {!cancelled && (
              <Button variant="danger-ghost" onClick={() => setCancelOpen(true)}><Ban /> Cancel invoice</Button>
            )}
          </div>
          {cancelled && <p className="mt-3 text-sm text-madder">Cancelled on {formatDate(inv.cancelledAt)}: {inv.cancelReason}</p>}
        </Card>
        <Card>
          <CardHeader title="Payments" description={activePayments.length ? `${activePayments.length} payment${activePayments.length > 1 ? "s" : ""}` : undefined} />
          {inv.payments.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {inv.payments.map((p) => (
                <li key={p.id} className={cn("flex items-start justify-between gap-3 px-5 py-3", p.voidedAt && "opacity-60")}>
                  <div>
                    <div className={cn("num font-semibold", p.voidedAt ? "line-through" : "text-leaf")}>{formatINR(p.amountPaise)}</div>
                    <div className="text-sm text-muted">{formatDate(p.date)} · {PAYMENT_METHOD_LABEL[p.method]}{p.reference && ` · ${p.reference}`}</div>
                    {p.voidedAt && <div className="text-xs text-madder">Voided: {p.voidReason}</div>}
                  </div>
                  {!p.voidedAt && <button className="text-xs font-semibold text-muted hover:text-madder" onClick={() => setVoidPay(p)}>Void</button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <PaymentDialog invoice={inv} open={payOpen} onOpenChange={setPayOpen} />
      <ReasonDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${inv.invoiceNumber}?`} description="The invoice stays in history. Its pieces become billable again." confirmLabel="Cancel invoice" loading={cancel.isPending} onConfirm={(r) => cancel.mutate(r)} />
      <ReasonDialog open={!!voidPay} onOpenChange={(o) => !o && setVoidPay(null)} title={`Void payment of ${voidPay ? formatINR(voidPay.amountPaise) : ""}?`} description="It stays listed, crossed out, and the outstanding amount goes back up." confirmLabel="Void payment" loading={voidPayment.isPending} onConfirm={(r) => voidPayment.mutate(r)} />
    </div>
  );
}
