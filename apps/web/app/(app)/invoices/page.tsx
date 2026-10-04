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
import { Select } from "@/components/ui/input";
import { DateRange, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip, PageHeader } from "@/components/ui/misc";
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

  const clear = () => {
    setQ("");
    router.replace(path);
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Bills for completed work."
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus /> New invoice
            </Link>
          </Button>
        }
      />
      {list.data && list.data.length > 0 && (
        <MetricStrip className="mb-6 grid-cols-3">
          <Metric label="Billed" value={formatINR(sum("totalPaise"))} />
          <Metric label="Received" value={formatINR(sum("paidPaise"))} />
          <Metric label="Outstanding" value={formatINR(sum("outstandingPaise"))} tone={sum("outstandingPaise") ? "danger" : "fg"} />
        </MetricStrip>
      )}
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Invoice no., client, job…" label="Search invoices" />
        <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="w-[calc(50%-4px)] sm:w-44" aria-label="Payment status">
          <option value="">All statuses</option>
          <option value="OPEN">Unpaid + partially paid</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={filters.clientId} onChange={(e) => setFilter({ clientId: e.target.value })} className="w-[calc(50%-4px)] sm:w-44" aria-label="Client">
          <option value="">All clients</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <DateRange from={filters.from} to={filters.to} onFrom={(from) => setFilter({ from })} onTo={(to) => setFilter({ to })} />
        {anyFilter && (
          <Button variant="ghost" onClick={clear}>
            <X /> Clear
          </Button>
        )}
      </Toolbar>
      <Card className="overflow-hidden">
        {list.isPending ? (
          <LoadingBlock rows={6} />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={anyFilter ? Search : ReceiptText}
            title={anyFilter ? "No matching invoices" : "No invoices yet"}
            action={
              anyFilter ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/invoices/new">
                    <Plus /> New invoice
                  </Link>
                </Button>
              )
            }
          >
            {!anyFilter && "Work becomes billable as pieces come back."}
          </EmptyState>
        ) : (
          <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <InvoicesTable rows={list.data} />
          </div>
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
