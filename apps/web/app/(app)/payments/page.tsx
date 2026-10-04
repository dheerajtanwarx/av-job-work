"use client";

import { formatDate, formatINR, PAYMENT_METHOD_LABEL, type InvoiceListRow, type PaymentRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { PaymentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Section, TableWrap } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip, PageHeader } from "@/components/ui/misc";
import { DateRange, Toolbar } from "@/components/ui/toolbar";
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
      <PageHeader title="Payments" subtitle="Money received against invoices. Voided payments stay in the record." />
      <Toolbar>
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full sm:w-48" aria-label="Client">
          <option value="">All clients</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {(clientId || from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setClientId("");
              setFrom("");
              setTo("");
            }}
          >
            <X /> Clear
          </Button>
        )}
      </Toolbar>
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <MetricStrip className="grid-cols-2">
            <Metric label="Received (shown)" value={formatINR(received)} />
            <Metric label="Still outstanding" value={formatINR(due)} tone={due ? "danger" : "fg"} />
          </MetricStrip>
          <Card className="overflow-hidden">
            {payments.isPending ? (
              <LoadingBlock />
            ) : payments.isError ? (
              <div className="p-4">
                <ErrorBlock error={payments.error} onRetry={() => payments.refetch()} />
              </div>
            ) : payments.data.length === 0 ? (
              <EmptyState icon={Wallet} title="No payments">
                Record a payment from an invoice, or from the list of invoices awaiting payment.
              </EmptyState>
            ) : (
              <TableWrap>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Invoice</th>
                      <th>Method</th>
                      <th className="r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.data.map((p) => (
                      <tr key={p.id} className={cn(p.voidedAt && "text-fg-muted")}>
                        <td className="num whitespace-nowrap text-fg-2">{formatDate(p.date)}</td>
                        <td className="max-w-48 truncate">{p.client.name}</td>
                        <td>
                          <Link className="font-medium hover:text-accent" href={`/invoices/${p.invoice.id}`}>
                            {p.invoice.invoiceNumber}
                          </Link>
                        </td>
                        <td className="text-fg-muted">
                          {PAYMENT_METHOD_LABEL[p.method]}
                          {p.reference && ` · ${p.reference}`}
                          {p.voidedAt && <div className="text-xs text-danger">Voided: {p.voidReason}</div>}
                        </td>
                        <td className={cn("r font-medium", p.voidedAt && "text-fg-faint line-through")}>{formatINR(p.amountPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>
        <Section title="Awaiting payment" description={open.data && open.data.length > 0 ? `${open.data.length} invoice${open.data.length === 1 ? "" : "s"}` : undefined}>
          {open.isPending ? (
            <Card className="overflow-hidden">
              <LoadingBlock rows={3} />
            </Card>
          ) : open.data?.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-4 text-[13px] text-fg-muted">Nothing outstanding.</p>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {open.data?.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/invoices/${i.id}`} className="text-[13px] font-medium whitespace-nowrap hover:text-accent">
                          {i.invoiceNumber}
                        </Link>
                        <PaymentStatusBadge status={i.status} />
                      </div>
                      <div className="num truncate text-xs text-fg-muted">{i.client.name} · {formatDate(i.date)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="num text-[13px] font-medium text-danger">{formatINR(i.outstandingPaise)}</div>
                      <Button size="sm" variant="secondary" onClick={() => setPaying(i)}>
                        Receive
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>
      </div>
      {paying && <PaymentDialog invoice={paying} open={!!paying} onOpenChange={(o) => !o && setPaying(null)} />}
    </>
  );
}
