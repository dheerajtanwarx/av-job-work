"use client";

import { JOB_STATUS_LABEL, JOB_STATUSES, type JobListRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { JobsTable } from "@/components/jobs/jobs-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api, qs } from "@/lib/api";
import { useClients, useDesigns, useProducts } from "@/lib/queries";

const KEYS = ["q", "status", "clientId", "designId", "productId", "from", "to"] as const;

function JobsList() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof KEYS)[number], string>;
  const [q, setQ] = useState(filters.q);
  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);

  const setFilter = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    router.replace(`${path}${qs(next)}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => q !== filters.q && setFilter({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = useQuery({ queryKey: ["jobs", filters], queryFn: () => api.get<JobListRow[]>(`/jobs${qs(filters)}`), placeholderData: (p) => p });
  const anyFilter = KEYS.some((k) => filters[k]);
  const design = designs.data?.find((d) => d.id === filters.designId);
  const product = products.data?.find((p) => p.id === filters.productId);

  return (
    <>
      <PageHeader title="Jobs" subtitle="Every lot of material sent out for work." actions={<Button asChild><Link href="/jobs/new"><Plus /> New job</Link></Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job no., client, design…" className="pl-9" />
        </div>
        <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="w-48" aria-label="Status">
          <option value="">All statuses</option>
          <option value="open">Open (not completed)</option>
          <option value="overdue">Overdue</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>
          ))}
        </Select>
        <Select value={filters.clientId} onChange={(e) => setFilter({ clientId: e.target.value })} className="w-48" aria-label="Client">
          <option value="">All clients</option>
          {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} className="w-40" aria-label="From date" title="From" />
        <Input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} className="w-40" aria-label="To date" title="To" />
        {anyFilter && (
          <Button variant="ghost" onClick={() => { setQ(""); router.replace(path); }}>
            <X /> Clear
          </Button>
        )}
      </div>
      {(design || product) && (
        <p className="mb-3 text-sm text-muted">
          Showing jobs with {design ? <b className="text-ink">{design.name}</b> : <b className="text-ink">{product!.name}</b>}
        </p>
      )}
      <Card>
        {list.isPending ? (
          <LoadingBlock rows={6} />
        ) : list.isError ? (
          <div className="p-5"><ErrorBlock error={list.error} onRetry={() => list.refetch()} /></div>
        ) : list.data.length === 0 ? (
          anyFilter ? (
            <EmptyState icon={Search} title="No jobs match these filters" action={<Button variant="secondary" onClick={() => { setQ(""); router.replace(path); }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Briefcase} title="No jobs yet" action={<Button asChild><Link href="/jobs/new"><Plus /> Create your first job</Link></Button>}>
              A job is one lot of material you send to a client, split into designs with their own quantity and rate.
            </EmptyState>
          )
        ) : (
          <JobsTable rows={list.data} />
        )}
      </Card>
    </>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <JobsList />
    </Suspense>
  );
}
