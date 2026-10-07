"use client";

import { AGING_BUCKETS, formatINR, formatQty, JOB_STATUS_LABEL, JOB_STATUSES, L, PAY_STATUS_LABEL, PAY_STATUSES, type JobListRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { JobsTable } from "@/components/jobs/jobs-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterDrawer } from "@/components/ui/filter-drawer";
import { Field, Select } from "@/components/ui/input";
import { CardListSkeleton, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { SearchInput, Toolbar } from "@/components/ui/toolbar";
import { api, qs } from "@/lib/api";
import { useClients, useDesigns, useJobWorkTypes, useProducts } from "@/lib/queries";

/** Server-side filters (sent to GET /jobs) and client-side ones (applied to the returned rows). */
const SERVER_KEYS = ["q", "status", "clientId", "designId", "productId", "from", "to"] as const;
const LOCAL_KEYS = ["type", "pay", "aging", "pending"] as const;
const KEYS = [...SERVER_KEYS, ...LOCAL_KEYS] as const;
type Filters = Record<(typeof KEYS)[number], string>;

function JobsList() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Filters;
  const [q, setQ] = useState(filters.q);
  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);
  const types = useJobWorkTypes(false);

  const setFilter = (patch: Partial<Filters>) => router.replace(`${path}${qs({ ...filters, ...patch })}`, { scroll: false });
  useEffect(() => {
    const t = setTimeout(() => q !== filters.q && setFilter({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const server = Object.fromEntries(SERVER_KEYS.map((k) => [k, filters[k]]));
  const list = useQuery({
    queryKey: ["jobs", server, filters.pending],
    queryFn: () => api.get<JobListRow[]>(`/jobs${qs({ ...server, pending: filters.pending === "1" ? "true" : undefined })}`),
    placeholderData: (p) => p,
  });
  const rows = (list.data ?? []).filter(
    (j) =>
      (!filters.type || j.jobWorkType?.id === filters.type) &&
      (!filters.pay || j.payStatus === filters.pay) &&
      (!filters.aging || (j.totals.pending > 0 && j.aging === filters.aging)),
  );
  const anyFilter = KEYS.some((k) => filters[k]);
  const drawerCount = (["productId", "designId", "type", "pay", "aging", "pending", "from"] as const).filter((k) => filters[k]).length;

  const clear = () => {
    setQ("");
    router.replace(path);
  };

  const totals = rows.reduce(
    (t, j) => {
      t.value += j.money.valuePaise;
      t.paid += j.money.paidPaise;
      t.out += j.money.outstandingPaise;
      if (j.overdue) t.overdue++;
      return t;
    },
    { value: 0, paid: 0, out: 0, overdue: 0 },
  );

  return (
    <>
      <PageHeader
        title={L.jobs}
        subtitle={`Every ${L.jobFull.toLowerCase()} – material issued to ${L.clients.toLowerCase()}.`}
        actions={
          <Button asChild>
            <Link href="/jobs/new">
              <Plus /> New {L.job.toLowerCase()}
            </Link>
          </Button>
        }
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder={`${L.jobNumber}, worker, design…`} label={`Search ${L.jobs.toLowerCase()}`} />
        <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="w-[calc(50%-4px)] sm:w-44" aria-label="Status">
          <option value="">All statuses</option>
          <option value="open">Open (not completed)</option>
          <option value="active">Active (issued, not complete)</option>
          <option value="overdue">Overdue</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={filters.clientId} onChange={(e) => setFilter({ clientId: e.target.value })} className="w-[calc(50%-4px)] sm:w-44" aria-label={L.client}>
          <option value="">All {L.clients.toLowerCase()}</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <FilterDrawer
          count={drawerCount}
          onClear={() => setFilter({ productId: "", designId: "", type: "", pay: "", aging: "", pending: "", from: "", to: "" })}
          className="max-sm:flex-1"
        >
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-fg-2">Challan date</div>
            <DateRangePicker from={filters.from} to={filters.to} onChange={(r) => setFilter(r)} className="flex-col items-stretch [&>div:first-child]:w-full" />
          </div>
          <Field label="Product">
            <Select value={filters.productId} onChange={(e) => setFilter({ productId: e.target.value })}>
              <option value="">Any product</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Design">
            <Select value={filters.designId} onChange={(e) => setFilter({ designId: e.target.value })}>
              <option value="">Any design</option>
              {designs.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={L.jobWorkType}>
            <Select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })}>
              <option value="">Any type</option>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment status">
            <Select value={filters.pay} onChange={(e) => setFilter({ pay: e.target.value })}>
              <option value="">Any</option>
              {PAY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAY_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Material outside for">
            <Select value={filters.aging} onChange={(e) => setFilter({ aging: e.target.value })}>
              <option value="">Any time</option>
              {AGING_BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b === "30+" ? "30+ days" : `${b.replace("-", "–")} days`}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13px]">
            <input type="checkbox" className="size-4 accent-[var(--accent-solid)]" checked={filters.pending === "1"} onChange={(e) => setFilter({ pending: e.target.checked ? "1" : "" })} />
            Only challans with material pending
          </label>
        </FilterDrawer>
        {anyFilter && (
          <Button variant="ghost" onClick={clear}>
            <X /> Clear
          </Button>
        )}
        {rows.length > 0 && <span className="num ml-auto hidden text-xs text-fg-muted sm:inline">{rows.length} {L.jobs.toLowerCase()}</span>}
      </Toolbar>
      {rows.length > 0 && (
        <div className="num mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
          <span>
            Work value <span className="font-medium text-fg">{formatINR(totals.value)}</span>
          </span>
          <span>
            Paid <span className="font-medium text-fg">{formatINR(totals.paid)}</span>
          </span>
          <span>
            Outstanding <span className={totals.out ? "font-medium text-danger" : "font-medium text-fg"}>{formatINR(totals.out)}</span>
          </span>
          {totals.overdue > 0 && (
            <button className="font-medium text-danger hover:underline" onClick={() => setFilter({ status: "overdue" })}>
              {formatQty(totals.overdue)} overdue
            </button>
          )}
        </div>
      )}
      <Card className="overflow-hidden">
        {list.isPending ? (
          <>
            <div className="max-sm:hidden">
              <LoadingBlock rows={8} />
            </div>
            <CardListSkeleton className="sm:hidden" />
          </>
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          anyFilter ? (
            <EmptyState
              icon={Search}
              title={`No matching ${L.jobs.toLowerCase()}`}
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title={`No ${L.jobs.toLowerCase()} yet`}
              action={
                <Button asChild>
                  <Link href="/jobs/new">
                    <Plus /> New {L.job.toLowerCase()}
                  </Link>
                </Button>
              }
            >
              A challan records material issued to a job worker, split into designs with their own quantity and rate.
            </EmptyState>
          )
        ) : (
          <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <JobsTable rows={rows} />
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
