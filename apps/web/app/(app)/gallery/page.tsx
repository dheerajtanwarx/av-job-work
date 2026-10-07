"use client";

import { formatDate, formatINR, formatQty, formatTime, L, photoUrls, rupeesToPaise, type JobListRow, type PhotoFilter, type PhotoView } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Images, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PhotoViewer } from "@/components/photos/photo-viewer";
import { usePhotoPages, usePhotoRole } from "@/components/photos/photo-queries";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Field, MoneyInput } from "@/components/ui/input";
import { EmptyState, ErrorBlock, PageHeader, Skeleton } from "@/components/ui/misc";
import { DateRange } from "@/components/ui/toolbar";
import { api, qs } from "@/lib/api";
import { useClients, useDesigns, useJobWorkTypes, useProducts } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * URL-driven filters, so other pages can link here: /gallery?clientId=…, ?jobId=…, ?returnId=…, ?photo=<id>.
 * minRate / maxRate in the URL are rupees (the API takes paise).
 */
const KEYS = ["clientId", "jobId", "designId", "productId", "jobWorkTypeId", "returnId", "from", "to", "minRate", "maxRate", "voided"] as const;
type Key = (typeof KEYS)[number];
type Filters = Partial<Record<Key, string>>;

export default function GalleryPage() {
  return (
    <Suspense fallback={<GridSkeleton />}>
      <Gallery />
    </Suspense>
  );
}

function Gallery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isManager } = usePhotoRole();
  const filters: Filters = useMemo(() => Object.fromEntries(KEYS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : []))), [params]);
  const openId = params.get("photo");

  const setParams = (patch: Partial<Record<Key | "photo", string | null>>) => {
    const s = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? s.set(k, v) : s.delete(k);
    const str = s.toString();
    router.replace(`${pathname}${str ? `?${str}` : ""}`, { scroll: false });
  };

  const apiFilter: PhotoFilter = {
    clientId: filters.clientId,
    jobId: filters.jobId,
    designId: filters.designId,
    productId: filters.productId,
    jobWorkTypeId: filters.jobWorkTypeId,
    returnId: filters.returnId,
    from: filters.from,
    to: filters.to,
    minRate: filters.minRate ? rupeesToPaise(filters.minRate) : undefined,
    maxRate: filters.maxRate ? rupeesToPaise(filters.maxRate) : undefined,
    includeVoided: isManager && filters.voided === "1",
  };
  const q = usePhotoPages(apiFilter);
  const photos = useMemo(() => q.data?.pages.flatMap((p) => p.rows) ?? [], [q.data]);

  const [drawer, setDrawer] = useState(false);
  const names = useFilterNames(filters, photos);
  const chips = KEYS.filter((k) => filters[k] && k !== "maxRate" && k !== "to");

  // Auto-load the next page when the end of the grid scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !q.hasNextPage) return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && !q.isFetchingNextPage && q.fetchNextPage(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage, photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = KEYS.filter((k) => filters[k]).length;

  return (
    <>
      <PageHeader
        title="Design / Return Gallery"
        subtitle="Every photo of returned work, with its quantity and rate."
        actions={
          <Button variant="secondary" size="lg" onClick={() => setDrawer(true)}>
            <SlidersHorizontal /> Filters
            {activeCount > 0 && <span className="num ml-0.5 rounded-full bg-accent-solid px-1.5 text-[11px] leading-4 text-on-accent">{activeCount}</span>}
          </Button>
        }
      />

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setParams(k === "from" ? { from: null, to: null } : k === "minRate" ? { minRate: null, maxRate: null } : { [k]: null })}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-[13px] text-fg-2 hover:bg-surface-2 pointer-coarse:h-10"
              aria-label={`Remove filter ${names[k]}`}
            >
              {names[k]}
              <X className="size-3.5 text-fg-muted" />
            </button>
          ))}
          {/* "to" / "maxRate" alone still need a chip */}
          {filters.to && !filters.from && (
            <button type="button" onClick={() => setParams({ to: null })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-[13px] text-fg-2 hover:bg-surface-2 pointer-coarse:h-10">
              {names.to}
              <X className="size-3.5 text-fg-muted" />
            </button>
          )}
          {filters.maxRate && !filters.minRate && (
            <button type="button" onClick={() => setParams({ maxRate: null })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-[13px] text-fg-2 hover:bg-surface-2 pointer-coarse:h-10">
              {names.maxRate}
              <X className="size-3.5 text-fg-muted" />
            </button>
          )}
          <Button variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>
            Clear all
          </Button>
        </div>
      )}

      {q.isPending ? (
        <GridSkeleton />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : photos.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Images}
            title={activeCount ? "No photos match these filters" : "No photos yet"}
            action={
              activeCount ? (
                <Button variant="secondary" onClick={() => router.replace(pathname, { scroll: false })}>
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            {activeCount ? "Try a wider date or rate range." : "Photos taken when receiving work back appear here with their rate."}
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {photos.map((p) => (
              <li key={p.id}>
                <PhotoCard photo={p} onOpen={() => setParams({ photo: p.id })} />
              </li>
            ))}
          </ul>
          <div ref={sentinel} className="flex justify-center py-6">
            {q.hasNextPage ? (
              <Button variant="secondary" size="lg" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                Load more
              </Button>
            ) : (
              <p className="text-xs text-fg-muted">
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </>
      )}

      <PhotoViewer photos={photos} openId={openId} onOpenChange={(id) => setParams({ photo: id })} />
      <FilterDrawer open={drawer} onOpenChange={setDrawer} filters={filters} isManager={isManager} onApply={(f) => setParams(Object.fromEntries(KEYS.filter((k) => k !== "returnId").map((k) => [k, f[k] ?? null])))} />
    </>
  );
}

function PhotoCard({ photo: p, onOpen }: { photo: PhotoView; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full overflow-hidden rounded-lg border border-border bg-surface text-left transition-shadow duration-100 hover:shadow-md focus-visible:outline-offset-2"
    >
      <div className="relative aspect-square bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-only file served by the API */}
        <img src={photoUrls(p.id).thumb} alt={`${p.design?.name ?? "Design"} – ${p.client.name}`} loading="lazy" className={cn("size-full object-cover", p.voidedAt && "opacity-50 grayscale")} />
        <span className="num absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[13px] leading-4 font-semibold text-white">{p.ratePaise !== null ? `${formatINR(p.ratePaise)} / ${p.unit}` : "Mixed rates"}</span>
        {(p.voidedAt || p.returnVoided) && (
          <span className="absolute top-2 left-2">
            <StatusBadge tone="neutral" className="bg-surface/90">
              {p.voidedAt ? "Voided" : "Return voided"}
            </StatusBadge>
          </span>
        )}
      </div>
      <div className="space-y-0.5 px-3 py-2.5">
        <div className="truncate text-[13px] font-medium text-fg">{p.client.name}</div>
        <div className="num truncate text-xs text-fg-2">
          {p.job.jobNumber} · {p.returnNumber}
        </div>
        <div className="truncate text-xs text-fg-muted">{p.design?.name ?? "Whole return"}</div>
        <div className="num flex items-baseline justify-between gap-2 pt-1 text-xs">
          <span className="font-medium text-fg">
            {formatQty(p.qty)} {p.unit}
          </span>
          <span className="truncate text-fg-muted">
            {formatDate(p.receivedDate)}, {formatTime(p.receivedAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

function GridSkeleton() {
  return (
    <div aria-busy aria-label="Loading" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-surface">
          <Skeleton className="aspect-square rounded-none" />
          <div className="space-y-1.5 p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-32" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

const useGalleryJobs = (clientId?: string) =>
  useQuery({ queryKey: ["jobs", "gallery", clientId ?? ""], queryFn: () => api.get<JobListRow[]>(`/jobs${qs({ clientId })}`), staleTime: 60_000 });

/** Human labels for the active filter chips. */
function useFilterNames(f: Filters, photos: PhotoView[]): Partial<Record<Key, string>> {
  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);
  const types = useJobWorkTypes(false);
  const jobs = useGalleryJobs();
  const rs = (v?: string) => (v ? formatINR(rupeesToPaise(v)) : "");
  return {
    clientId: `${L.worker}: ${clients.data?.find((c) => c.id === f.clientId)?.name ?? photos[0]?.client.name ?? "…"}`,
    jobId: `${L.job}: ${jobs.data?.find((j) => j.id === f.jobId)?.jobNumber ?? photos[0]?.job.jobNumber ?? "…"}`,
    designId: `Design: ${designs.data?.find((d) => d.id === f.designId)?.name ?? "…"}`,
    productId: `Product: ${products.data?.find((p) => p.id === f.productId)?.name ?? "…"}`,
    jobWorkTypeId: `${L.jobWorkType}: ${types.data?.find((t) => t.id === f.jobWorkTypeId)?.name ?? "…"}`,
    returnId: `Return: ${photos.find((p) => p.returnId === f.returnId)?.returnNumber ?? "…"}`,
    from: f.to ? `${formatDate(f.from)} – ${formatDate(f.to)}` : `From ${formatDate(f.from)}`,
    to: `Until ${formatDate(f.to)}`,
    minRate: f.maxRate ? `Rate ${rs(f.minRate)} – ${rs(f.maxRate)}` : `Rate ≥ ${rs(f.minRate)}`,
    maxRate: `Rate ≤ ${rs(f.maxRate)}`,
    voided: "Including voided",
  };
}

function FilterDrawer({
  open,
  onOpenChange,
  filters,
  isManager,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: Filters;
  isManager: boolean;
  onApply: (f: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Filters) => setDraft((d) => ({ ...d, ...patch }));

  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);
  const types = useJobWorkTypes(false);
  const jobs = useGalleryJobs(draft.clientId);
  const opt = <T extends { id: string; name: string }>(xs: T[] | undefined) => [{ value: "", label: "Any" }, ...(xs ?? []).map((x) => ({ value: x.id, label: x.name }))];
  const rateError = draft.minRate && draft.maxRate && Number(draft.minRate) > Number(draft.maxRate) ? "Minimum is above maximum" : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Filter photos"
      wide
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={() => setDraft({})}>
            Clear
          </Button>
          <Button
            size="lg"
            disabled={!!rateError}
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Show photos
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={L.client}>
          <Combobox options={opt(clients.data)} value={draft.clientId ?? ""} onChange={(v) => set({ clientId: v || undefined, jobId: undefined })} placeholder="Any" />
        </Field>
        <Field label={L.job}>
          <Combobox
            options={[{ value: "", label: "Any" }, ...(jobs.data ?? []).map((j) => ({ value: j.id, label: j.jobNumber, sub: j.client.name, keywords: [j.client.name, ...j.designs] }))]}
            value={draft.jobId ?? ""}
            onChange={(v) => set({ jobId: v || undefined })}
            placeholder="Any"
          />
        </Field>
        <Field label="Design">
          <Combobox options={opt(designs.data)} value={draft.designId ?? ""} onChange={(v) => set({ designId: v || undefined })} placeholder="Any" />
        </Field>
        <Field label="Product">
          <Combobox options={opt(products.data)} value={draft.productId ?? ""} onChange={(v) => set({ productId: v || undefined })} placeholder="Any" />
        </Field>
        <Field label={L.jobWorkType}>
          <Combobox options={opt(types.data)} value={draft.jobWorkTypeId ?? ""} onChange={(v) => set({ jobWorkTypeId: v || undefined })} placeholder="Any" />
        </Field>
        <Field label="Return date">
          <DateRange from={draft.from ?? ""} to={draft.to ?? ""} onFrom={(v) => set({ from: v || undefined })} onTo={(v) => set({ to: v || undefined })} />
        </Field>
        <Field label="Rate from (₹)" error={rateError}>
          <MoneyInput value={draft.minRate ?? ""} onChange={(e) => set({ minRate: e.target.value || undefined })} placeholder="0" />
        </Field>
        <Field label="Rate up to (₹)">
          <MoneyInput value={draft.maxRate ?? ""} onChange={(e) => set({ maxRate: e.target.value || undefined })} placeholder="Any" />
        </Field>
        {isManager && (
          <label className="flex min-h-10 items-center gap-2 text-[13px] text-fg-2 sm:col-span-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft.voided === "1"} onChange={(e) => set({ voided: e.target.checked ? "1" : undefined })} />
            Include voided photos
          </label>
        )}
      </div>
    </Dialog>
  );
}
