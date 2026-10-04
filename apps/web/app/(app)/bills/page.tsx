"use client";

import { formatINR, type MainBillRow, type MoneySummary, type SubBillRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus, ReceiptText, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { MainBillsTable } from "@/components/billing/main-bills-table";
import { SubBillsTable } from "@/components/billing/sub-bills-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip, PageHeader } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { DateRange, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { api, qs } from "@/lib/api";
import { useClients } from "@/lib/queries";

const KEYS = ["q", "clientId", "from", "to"] as const;
type Tab = "sub" | "main";

function BillList() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "main" ? "main" : "sub";
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof KEYS)[number], string>;
  const [q, setQ] = useState(filters.q);
  const clients = useClients(false);
  const setParams = (patch: Partial<typeof filters> & { tab?: Tab }) => {
    const next = { ...filters, tab, ...patch };
    router.replace(`${path}${qs({ ...next, tab: next.tab === "main" ? "main" : "" })}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => q !== filters.q && setParams({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const subBills = useQuery({
    queryKey: ["sub-bills", filters],
    queryFn: () => api.get<SubBillRow[]>(`/sub-bills${qs(filters)}`),
    placeholderData: (p) => p,
  });
  const mainBills = useQuery({
    queryKey: ["main-bills", filters],
    queryFn: () => api.get<MainBillRow[]>(`/main-bills${qs(filters)}`),
    placeholderData: (p) => p,
  });
  const money = useQuery({
    queryKey: ["money", filters.clientId],
    queryFn: () => (filters.clientId ? api.get<MoneySummary>(`/clients/${filters.clientId}/money`) : api.get<{ money: MoneySummary }>("/dashboard").then((d) => d.money)),
  });

  const anyFilter = KEYS.some((k) => filters[k]);
  const paidInView = (subBills.data ?? []).filter((b) => !b.voidedAt).reduce((s, b) => s + b.amountPaise, 0);
  const settled = (mainBills.data ?? []).filter((m) => !m.cancelledAt).length;
  const list = tab === "sub" ? subBills : mainBills;

  const clear = () => {
    setQ("");
    router.replace(tab === "main" ? `${path}?tab=main` : path);
  };

  return (
    <>
      <PageHeader
        title="Bills"
        subtitle="What you've paid job workers. A sub bill records each payment. The main bill settles a job once every piece is paid."
        actions={
          <Button asChild>
            <Link href="/bills/new">
              <Plus /> New sub bill
            </Link>
          </Button>
        }
      />
      <MetricStrip className="mb-6 grid-cols-3">
        <Metric label={anyFilter ? "Paid (filtered)" : "Total paid"} value={subBills.data ? formatINR(paidInView) : "—"} />
        <Metric label="To pay" value={money.data ? formatINR(money.data.toPayPaise) : "—"} tone={money.data?.toPayPaise ? "danger" : "fg"} sub="Returned, not yet paid" />
        <Metric label="Jobs settled" value={mainBills.data ? settled : "—"} />
      </MetricStrip>

      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        items={[
          { value: "sub", label: "Sub bills", count: subBills.data?.length },
          { value: "main", label: "Main bills", count: mainBills.data?.length },
        ]}
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Bill no., job worker, job…" label="Search bills" />
        <Select value={filters.clientId} onChange={(e) => setParams({ clientId: e.target.value })} className="w-full sm:w-48" aria-label="Job worker">
          <option value="">All job workers</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <DateRange from={filters.from} to={filters.to} onFrom={(from) => setParams({ from })} onTo={(to) => setParams({ to })} />
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
            title={anyFilter ? "No matching bills" : tab === "sub" ? "No sub bills yet" : "No main bills yet"}
            action={
              anyFilter ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : tab === "sub" ? (
                <Button asChild>
                  <Link href="/bills/new">
                    <Plus /> New sub bill
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {!anyFilter && (tab === "sub" ? "Once pieces come back, record what you paid for them here." : "A main bill is issued automatically when a job is complete and fully paid.")}
          </EmptyState>
        ) : (
          <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {tab === "sub" ? <SubBillsTable rows={subBills.data!} /> : <MainBillsTable rows={mainBills.data!} />}
          </div>
        )}
      </Card>
    </>
  );
}

export default function BillsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <BillList />
    </Suspense>
  );
}
