"use client";

import { formatDate, formatINR, formatQty, formatTime, photoUrls, type PhotoFilter } from "@av/shared";
import { Camera, Images } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBlock, Skeleton } from "@/components/ui/misc";
import { usePhotos } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Thumbnails of return photos for a challan or job worker, each opening the gallery viewer.
 * `galleryHref` is the "Open in gallery" link (e.g. /gallery?jobId=…).
 */
export function PhotoGrid({ filter, galleryHref, take = 24, emptyText }: { filter: PhotoFilter; galleryHref: string; take?: number; emptyText?: string }) {
  const q = usePhotos({ ...filter, take });
  const rows = q.data?.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">{q.data ? `${rows.length}${q.data.nextCursor ? "+" : ""} photo${rows.length === 1 ? "" : "s"} · newest first` : " "}</p>
        <Button asChild size="sm" variant="secondary">
          <Link href={galleryHref}>
            <Images /> Open in gallery
          </Link>
        </Button>
      </div>
      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Camera} title="No photos yet">
            {emptyText ?? "Photos are added when a job work return is recorded."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/gallery?photo=${p.id}`} className={cn("group block overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-overlay", p.returnVoided && "opacity-60")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrls(p.id).thumb} alt={`${p.design?.name ?? p.productName} – ${p.returnNumber}`} loading="lazy" className="aspect-square w-full bg-surface-2 object-cover" />
                <div className="px-2.5 py-2">
                  <div className="truncate text-[13px] font-medium">{p.design?.name ?? p.productName}</div>
                  <div className="num truncate text-[11px] text-fg-muted">
                    {p.returnNumber} · {p.job.jobNumber}
                  </div>
                  <div className="num truncate text-[11px] text-fg-muted">
                    {formatDate(p.receivedDate)} · {formatTime(p.receivedAt)}
                  </div>
                  <div className="num truncate text-[11px] text-fg-2">
                    {formatQty(p.qty)} {p.unit}
                    {p.ratePaise != null && ` @ ${formatINR(p.ratePaise)}`} · {formatINR(p.valuePaise)}
                  </div>
                  {p.returnVoided && <div className="text-[11px] font-medium text-danger">VOID</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
