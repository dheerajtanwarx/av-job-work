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
import { Select } from "@/components/ui/input";
import { DateRange, SearchInput, Toolbar } from "@/components/ui/toolbar";
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

  const clear = () => {
    setQ("");
    router.replace(path);
  };

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Every lot of material sent out for work."
        actions={
          <Button asChild>
            <Link href="/jobs/new">
              <Plus /> New job
            </Link>
          </Button>
        }
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Job no., client, design…" label="Search jobs" />
        <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="w-[calc(50%-4px)] sm:w-44" aria-label="Status">
          <option value="">All statuses</option>
          <option value="open">Open (not completed)</option>
          <option value="active">Active (sent, not complete)</option>
          <option value="overdue">Overdue</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_LABEL[s]}
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
        {list.data && list.data.length > 0 && <span className="num ml-auto hidden text-xs text-fg-muted sm:inline">{list.data.length} jobs</span>}
      </Toolbar>
      {(design || product) && (
        <div className="mb-3 flex items-center gap-2 text-[13px] text-fg-muted">
          Showing jobs with
          <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface pr-1 pl-2 font-medium text-fg">
            {design ? design.name : product!.name}
            <button
              className="grid size-4 place-items-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Remove filter"
              onClick={() => setFilter(design ? { designId: "" } : { productId: "" })}
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}
      <Card className="overflow-hidden">
        {list.isPending ? (
          <LoadingBlock rows={8} />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : list.data.length === 0 ? (
          anyFilter ? (
            <EmptyState
              icon={Search}
              title="No matching jobs"
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No jobs yet"
              action={
                <Button asChild>
                  <Link href="/jobs/new">
                    <Plus /> New job
                  </Link>
                </Button>
              }
            >
              A job is one lot of material sent to a client, split into designs with their own quantity and rate.
            </EmptyState>
          )
        ) : (
          <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <JobsTable rows={list.data} />
          </div>
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
