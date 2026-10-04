"use client";

import { formatINR, PAYMENT_STATUS_LABEL, PAYMENT_STATUSES, type InvoiceListRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus, ReceiptText, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { InvoicesTable } from "@/components/billing/invoices-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Stat } from "@/components/ui/misc";
import { api, qs } from "@/lib/api";
import { useClients } from "@/lib/queries";

const KEYS = ["q", "status", "clientId", "from", "to"] as const;

function InvoiceList() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof KEYS)[number], string>;
  const [q, setQ] = useState(filters.q);
  const clients = useClients(false);
  const setFilter = (patch: Partial<typeof filters>) => router.replace(`${path}${qs({ ...filters, ...patch })}`, { scroll: false });
  useEffect(() => {
    const t = setTimeout(() => q !== filters.q && setFilter({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const list = useQuery({ queryKey: ["invoices", filters], queryFn: () => api.get<InvoiceListRow[]>(`/invoices${qs(filters)}`), placeholderData: (p) => p });
  const anyFilter = KEYS.some((k) => filters[k]);
  const active = (list.data ?? []).filter((i) => i.status !== "CANCELLED");
  const sum = (k: "totalPaise" | "paidPaise" | "outstandingPaise") => active.reduce((s, i) => s + i[k], 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle="Bills for completed work." actions={<Button asChild><Link href="/invoices/new"><Plus /> New invoice</Link></Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no., client, job…" className="pl-9" />
        </div>
        <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="w-48" aria-label="Payment status">
          <option value="">All payment statuses</option>
          <option value="OPEN">Unpaid + partially paid</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select value={filters.clientId} onChange={(e) => setFilter({ clientId: e.target.value })} className="w-48" aria-label="Client">
          <option value="">All clients</option>
          {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} className="w-40" aria-label="From date" />
        <Input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} className="w-40" aria-label="To date" />
        {anyFilter && <Button variant="ghost" onClick={() => { setQ(""); router.replace(path); }}><X /> Clear</Button>}
      </div>
      {list.data && list.data.length > 0 && (
        <Card className="mb-4 grid grid-cols-3 gap-4 p-5">
          <Stat label="Billed" value={formatINR(sum("totalPaise"))} />
          <Stat label="Received" value={formatINR(sum("paidPaise"))} tone="leaf" />
          <Stat label="Outstanding" value={formatINR(sum("outstandingPaise"))} tone={sum("outstandingPaise") ? "madder" : "muted"} />
        </Card>
      )}
      <Card>
        {list.isPending ? (
          <LoadingBlock />
        ) : list.isError ? (
          <div className="p-5"><ErrorBlock error={list.error} /></div>
        ) : list.data.length === 0 ? (
          <EmptyState icon={ReceiptText} title={anyFilter ? "No invoices match" : "No invoices yet"} action={!anyFilter && <Button asChild><Link href="/invoices/new"><Plus /> Create an invoice</Link></Button>}>
            {anyFilter ? "Try clearing some filters." : "When pieces come back, their work becomes ready to bill."}
          </EmptyState>
        ) : (
          <InvoicesTable rows={list.data} />
        )}
      </Card>
    </>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <InvoiceList />
    </Suspense>
  );
}
