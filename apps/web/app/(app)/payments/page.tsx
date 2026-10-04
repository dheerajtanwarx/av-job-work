"use client";

import { formatDate, formatINR, PAYMENT_METHOD_LABEL, type InvoiceListRow, type PaymentRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { PaymentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, TableWrap } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, LoadingBlock, PageHeader, Stat } from "@/components/ui/misc";
import { api, qs } from "@/lib/api";
import { useClients } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function PaymentsPage() {
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [paying, setPaying] = useState<InvoiceListRow | null>(null);
  const clients = useClients(false);
  const payments = useQuery({ queryKey: ["payments", clientId, from, to], queryFn: () => api.get<PaymentRow[]>(`/payments${qs({ clientId, from, to })}`) });
  const open = useQuery({ queryKey: ["invoices", "open", clientId], queryFn: () => api.get<InvoiceListRow[]>(`/invoices${qs({ status: "OPEN", clientId })}`) });
  const received = (payments.data ?? []).filter((p) => !p.voidedAt).reduce((s, p) => s + p.amountPaise, 0);
  const due = (open.data ?? []).reduce((s, i) => s + i.outstandingPaise, 0);

  return (
    <>
      <PageHeader title="Payments" subtitle="Money received against invoices. Every payment is kept, even if voided." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-52" aria-label="Client">
          <option value="">All clients</option>
          {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <Card>
          <div className="grid grid-cols-2 gap-4 border-b border-line p-5">
            <Stat label="Received (shown)" value={formatINR(received)} tone="leaf" />
            <Stat label="Still outstanding" value={formatINR(due)} tone={due ? "madder" : "muted"} />
          </div>
          {payments.isPending ? (
            <LoadingBlock />
          ) : payments.data!.length === 0 ? (
            <EmptyState icon={Wallet} title="No payments recorded">Open an invoice and use “Record payment”, or pick one from the list on the right.</EmptyState>
          ) : (
            <TableWrap>
              <table className="ledger">
                <thead><tr><th>Date</th><th>Client</th><th>Invoice</th><th>Method</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {payments.data!.map((p) => (
                    <tr key={p.id} className={cn(p.voidedAt && "opacity-55")}>
                      <td className="whitespace-nowrap">{formatDate(p.date)}</td>
                      <td>{p.client.name}</td>
                      <td><Link className="font-semibold text-indigo hover:underline" href={`/invoices/${p.invoice.id}`}>{p.invoice.invoiceNumber}</Link></td>
                      <td className="text-muted">{PAYMENT_METHOD_LABEL[p.method]}{p.reference && ` · ${p.reference}`}{p.voidedAt && <div className="text-xs text-madder">Voided: {p.voidReason}</div>}</td>
                      <td className={cn("r num font-semibold", p.voidedAt ? "line-through" : "text-leaf")}>{formatINR(p.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
        <Card className="lg:self-start">
          <CardHeader title="Awaiting payment" description="Unpaid and partially paid invoices" />
          {open.data?.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">Nothing outstanding. 🎉</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {open.data?.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/invoices/${i.id}`} className="font-semibold text-indigo hover:underline">{i.invoiceNumber}</Link>
                    <div className="truncate text-sm text-muted">{i.client.name} · {formatDate(i.date)}</div>
                    <PaymentStatusBadge status={i.status} />
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold text-madder">{formatINR(i.outstandingPaise)}</div>
                    <Button size="sm" variant="secondary" className="mt-1" onClick={() => setPaying(i)}>Receive</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {paying && <PaymentDialog invoice={paying} open={!!paying} onOpenChange={(o) => !o && setPaying(null)} />}
    </>
  );
}
