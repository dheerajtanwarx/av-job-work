"use client";

import { formatINR, photoUrls, type PhotoFilter, type PhotoView } from "@av/shared";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { photoQs, usePhotoPages } from "./photo-queries";
import { PhotoViewer } from "./photo-viewer";

/** Gallery link for the same filter ("See all"). */
export const galleryHref = (f: PhotoFilter) => `/gallery${photoQs({ ...f, cursor: undefined, take: undefined, minRate: undefined, maxRate: undefined })}`;

/**
 * A small strip of thumbnails that opens the full-screen viewer. Give it `photos` you already have
 * (e.g. ReturnDetail.photos) or a `filter` ({ returnId } / { jobId } / { clientId } …) to load them.
 */
export function PhotoThumbs({
  photos: given,
  filter,
  max = 12,
  size = "md",
  emptyText = "No photo uploaded",
  className,
}: {
  photos?: PhotoView[];
  filter?: PhotoFilter;
  max?: number;
  size?: "sm" | "md";
  emptyText?: string | null;
  className?: string;
}) {
  const q = usePhotoPages({ ...filter, take: max }, !given && !!filter);
  const [openId, setOpenId] = useState<string | null>(null);
  const loaded = given ?? q.data?.pages[0]?.rows ?? [];
  const photos = loaded.slice(0, max);
  const more = given ? Math.max(0, given.length - max) : q.data?.pages[0]?.nextCursor ? 1 : 0;
  const box = size === "sm" ? "size-14" : "size-20";

  if (!given && q.isPending)
    return (
      <div className={cn("flex gap-2", className)} aria-busy aria-label="Loading photos">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={cn(box, "rounded-md")} />
        ))}
      </div>
    );
  if (!given && q.isError) return <p className={cn("text-xs text-danger", className)}>Photos could not be loaded.</p>;
  if (!photos.length)
    return emptyText ? (
      <p className={cn("flex items-center gap-1.5 text-xs text-fg-muted", className)}>
        <ImageOff className="size-3.5" /> {emptyText}
      </p>
    ) : null;

  return (
    <>
      <ul className={cn("flex gap-2 overflow-x-auto overscroll-x-contain pb-1", className)}>
        {photos.map((p) => (
          <li key={p.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setOpenId(p.id)}
              className={cn("group relative block overflow-hidden rounded-md border border-border bg-surface-2", box)}
              title={`${p.returnNumber} · ${p.design?.name ?? "Whole return"}${p.ratePaise !== null ? ` · ${formatINR(p.ratePaise)}/${p.unit}` : ""}`}
              aria-label={`Open photo ${p.returnNumber}${p.design ? `, ${p.design.name}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-only file served by the API */}
              <img src={photoUrls(p.id).thumb} alt="" loading="lazy" className={cn("size-full object-cover transition-transform duration-150 group-hover:scale-105", p.voidedAt && "opacity-50 grayscale")} />
              {p.ratePaise !== null && size === "md" && (
                <span className="num absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] font-medium text-white">
                  {formatINR(p.ratePaise)}/{p.unit}
                </span>
              )}
            </button>
          </li>
        ))}
        {more > 0 && filter && (
          <li className="shrink-0">
            <Link href={galleryHref(filter)} className={cn("grid place-items-center rounded-md border border-dashed border-border-strong text-xs font-medium text-fg-2 hover:bg-surface-2", box)}>
              See all
            </Link>
          </li>
        )}
      </ul>
      <PhotoViewer photos={photos} openId={openId} onOpenChange={setOpenId} />
    </>
  );
}
