"use client";

import { formatDate, formatINR, formatQty, L, todayISO, type ReturnRow } from "@av/shared";
import { Camera, ChevronLeft, ChevronRight, ImageOff, PackageCheck, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PayStatusPill, Pill } from "@/components/returns/status";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { DateRange, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { qs } from "@/lib/api";
import { useClients, useDesigns } from "@/lib/queries";
import { formatTime, photoThumb, useAllJobs, useReturns } from "@/lib/returns";
import { cn } from "@/lib/utils";

const KEYS = ["q", "clientId", "jobId", "designId", "from", "to", "voided", "page"] as const;
type Key = (typeof KEYS)[number];
type Tab = "all" | "today";
const TAKE = 50;

function ReturnsList() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "today" ? "today" : "all";
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<Key, string>;
  const page = Math.max(0, Number(f.page) || 0);
  const [q, setQ] = useState(f.q);
  const clients = useClients(false);
  const designs = useDesigns(false);
  const jobs = useAllJobs();
  const today = todayISO();

  const setParams = (patch: Partial<Record<Key, string>> & { tab?: Tab }) => {
    const next = { ...f, tab: tab === "today" ? "today" : "", ...patch };
    if (!("page" in patch)) next.page = "";
    router.replace(`${path}${qs(next)}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => q !== f.q && setParams({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const from = tab === "today" ? today : f.from;
  const to = tab === "today" ? today : f.to;
  const list = useReturns({
    clientId: f.clientId,
    jobId: f.jobId,
    designId: f.designId,
    from,
    to,
    q: f.q,
    voided: f.voided === "true",
    skip: page * TAKE,
    take: TAKE,
  });
  const anyFilter = KEYS.some((k) => k !== "page" && f[k]);
  const clear = () => {
    setQ("");
    router.replace(tab === "today" ? `${path}?tab=today` : path);
  };
  const jobOptions = (jobs.data ?? [])
    .filter((j) => !f.clientId || j.client.id === f.clientId)
    .map((j) => ({ value: j.id, label: `${j.jobNumber} · ${j.client.name}`, sub: j.product.name, keywords: [j.client.name] }));
  const total = list.data?.total ?? 0;
  const rows = list.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil(total / TAKE));
  const sums = rows
    .filter((r) => !r.voidedAt)
    .reduce((s, r) => ({ value: s.value + r.valuePaise, count: s.count + 1 }), { value: 0, count: 0 });

  return (
    <>
      <PageHeader
        title={`${L.return}s`}
        subtitle="Every return from job workers, with time, rate, photo and payment status."
        actions={
          <Button asChild>
            <Link href="/returns/new">
              <Plus /> Record return
            </Link>
          </Button>
        }
      />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={(t) => setParams({ tab: t, from: "", to: "" })}
        items={[
          { value: "all", label: "All returns", count: tab === "all" && list.data ? total : undefined },
          { value: "today", label: "Today's arrivals", count: tab === "today" && list.data ? total : undefined },
        ]}
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Return no., challan, worker, design…" label="Search returns" />
        <Select value={f.clientId} onChange={(e) => setParams({ clientId: e.target.value, jobId: "" })} className="w-full sm:w-44" aria-label={L.client}>
          <option value="">All workers</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="w-full sm:w-52">
          <Combobox options={[{ value: "", label: "All challans" }, ...jobOptions]} value={f.jobId} onChange={(jobId) => setParams({ jobId })} placeholder="All challans" searchPlaceholder="Challan no. or worker" />
        </div>
        <Select value={f.designId} onChange={(e) => setParams({ designId: e.target.value })} className="w-full sm:w-40" aria-label="Design">
          <option value="">All designs</option>
          {designs.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        {tab === "all" && <DateRange from={f.from} to={f.to} onFrom={(v) => setParams({ from: v })} onTo={(v) => setParams({ to: v })} />}
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 px-1 text-[13px] text-fg-2 pointer-coarse:h-10">
          <input type="checkbox" className="size-4" checked={f.voided === "true"} onChange={(e) => setParams({ voided: e.target.checked ? "true" : "" })} />
          Show voided
        </label>
        {anyFilter && (
          <Button variant="ghost" onClick={clear}>
            <X /> Clear
          </Button>
        )}
      </Toolbar>

      {list.data && rows.length > 0 && (
        <p className="num mb-2 text-xs text-fg-muted">
          {tab === "today" ? `${formatQty(total)} return${total === 1 ? "" : "s"} today` : `${formatQty(total)} return${total === 1 ? "" : "s"}`} · work value on this page {formatINR(sums.value)}
        </p>
      )}

      <Card className="overflow-hidden">
        {list.isPending ? (
          <LoadingBlock rows={6} />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={anyFilter ? Search : PackageCheck}
            title={anyFilter ? "No matching returns" : tab === "today" ? "Nothing arrived today yet" : "No returns yet"}
            action={
              anyFilter ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/returns/new">
                    <Plus /> Record return
                  </Link>
                </Button>
              )
            }
          >
            {!anyFilter && "When a job worker brings work back, record it here with a photo."}
          </EmptyState>
        ) : (
          <div className={cn("transition-opacity", list.isPlaceholderData && "opacity-60")}>
            <MobileList rows={rows} />
            <DesktopTable rows={rows} showDate={tab === "all"} onOpen={(id) => router.push(`/returns/${id}`)} />
          </div>
        )}
      </Card>

      {total > TAKE && (
        <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-fg-muted">
          <span className="num">
            {page * TAKE + 1}–{Math.min(total, (page + 1) * TAKE)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page === 0} onClick={() => setParams({ page: page - 1 ? String(page - 1) : "" })}>
              <ChevronLeft /> Newer
            </Button>
            <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setParams({ page: String(page + 1) })}>
              Older <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Thumb({ row, size = "md" }: { row: ReturnRow; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "size-16" : "size-10";
  if (!row.coverPhotoId)
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-md border border-dashed border-border-strong text-fg-faint", cls)} title="No photo uploaded">
        <ImageOff className="size-4" />
      </span>
    );
  return (
    <span className={cn("relative shrink-0 overflow-hidden rounded-md bg-surface-2", cls)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoThumb(row.coverPhotoId)} alt={`${row.returnNumber} photo`} loading="lazy" className="size-full object-cover" />
      {row.photoCount > 1 && <span className="num absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[10px] leading-4 font-medium text-white">{row.photoCount}</span>}
    </span>
  );
}

const qtyText = (r: ReturnRow) => {
  const ex = r.damagedQty + r.rejectedQty + r.lostQty;
  return `${formatQty(r.okQty)} ${r.unit}${ex > 0 ? ` +${formatQty(ex)} other` : ""}`;
};

function MobileList({ rows }: { rows: ReturnRow[] }) {
  return (
    <ul className="divide-y divide-border md:hidden">
      {rows.map((r) => {
        const voided = !!r.voidedAt;
        return (
          <li key={r.id}>
            <Link href={`/returns/${r.id}`} className="flex gap-3 px-4 py-3 active:bg-surface-2">
              <Thumb row={r} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className={cn("min-w-0 truncate text-[14px] font-semibold", voided && "text-fg-muted line-through")}>{r.client.name}</div>
                  <div className={cn("num shrink-0 text-[14px] font-semibold", voided && "text-fg-muted line-through")}>{formatINR(r.valuePaise)}</div>
                </div>
                <div className="num truncate text-xs text-fg-2">
                  {formatTime(r.receivedAt)} · {formatDate(r.date)} · {r.returnNumber} · {r.job.jobNumber}
                </div>
                <div className="num truncate text-xs text-fg-muted">
                  {r.designs.join(", ")} · {qtyText(r)}
                  {r.ratePaise != null ? ` @ ${formatINR(r.ratePaise)}` : " · mixed rates"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <PayStatusPill payment={r.payment} voided={voided} />
                  {voided && r.voidReason && <span className="truncate text-xs text-fg-muted">{r.voidReason}</span>}
                  {r.editedAt && !voided && <Pill tone="grey">Edited</Pill>}
                  {r.photoCount === 0 && !voided && (
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <Camera className="size-3" /> No photo
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DesktopTable({ rows, showDate, onOpen }: { rows: ReturnRow[]; showDate: boolean; onOpen: (id: string) => void }) {
  return (
    <TableWrap className="hidden md:block">
      <table className="ledger ledger-sticky">
        <thead>
          <tr>
            <th>Time</th>
            <th>Worker</th>
            <th>{L.job}</th>
            <th>Design</th>
            <th className="r">Qty</th>
            <th className="r">Rate</th>
            <th className="r">Amount</th>
            <th>Photo</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const voided = !!r.voidedAt;
            return (
              <tr key={r.id} className={cn("row-link", voided && "text-fg-muted")} onClick={() => onOpen(r.id)}>
                <td className="whitespace-nowrap">
                  <Link href={`/returns/${r.id}`} onClick={(e) => e.stopPropagation()} className={cn("font-medium text-fg hover:text-accent", voided && "line-through")}>
                    {r.returnNumber}
                  </Link>
                  <div className="num text-xs text-fg-muted">
                    {showDate ? `${formatDate(r.date)}, ` : ""}
                    {formatTime(r.receivedAt)}
                  </div>
                </td>
                <td className="max-w-44 truncate">{r.client.name}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/jobs/${r.job.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-accent">
                    {r.job.jobNumber}
                  </Link>
                  <div className="max-w-36 truncate text-xs text-fg-muted">{r.productName}</div>
                </td>
                <td className="max-w-48 truncate">{r.designs.join(", ")}</td>
                <td className={cn("r whitespace-nowrap", voided && "line-through")}>
                  {formatQty(r.okQty)} <span className="text-xs text-fg-muted">{r.unit}</span>
                  {r.damagedQty + r.rejectedQty + r.lostQty > 0 && <div className="text-xs text-danger">+{formatQty(r.damagedQty + r.rejectedQty + r.lostQty)} other</div>}
                </td>
                <td className="r whitespace-nowrap">{r.ratePaise != null ? formatINR(r.ratePaise) : <span className="text-xs text-fg-muted">Mixed</span>}</td>
                <td className={cn("r font-medium whitespace-nowrap", voided && "line-through decoration-fg-faint")}>{formatINR(r.valuePaise)}</td>
                <td>
                  <Thumb row={r} />
                </td>
                <td className="whitespace-nowrap">
                  <PayStatusPill payment={r.payment} voided={voided} />
                  {voided && r.voidReason && <div className="max-w-40 truncate text-xs text-fg-muted">{r.voidReason}</div>}
                  {!voided && r.editedAt && <div className="text-xs text-fg-muted">Edited</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ReturnsList />
    </Suspense>
  );
}
