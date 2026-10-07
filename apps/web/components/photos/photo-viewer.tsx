"use client";

import { formatDate, formatDateTime, formatINR, formatQty, L, photoUrls, type PhotoView } from "@av/shared";
import { Ban, ChevronLeft, ChevronRight, Download, ExternalLink, ImageOff, RotateCcw, Share2, X } from "lucide-react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBlock, Notice } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { cn } from "@/lib/utils";
import { usePhoto, usePhotoAction, usePhotoRole } from "./photo-queries";

/** "₹80 / PCS", or "Mixed rates" when a whole-return photo covers lines at different rates. */
export const photoRate = (p: Pick<PhotoView, "ratePaise" | "unit">) => (p.ratePaise === null ? "Mixed rates" : `${formatINR(p.ratePaise)} / ${p.unit}`);

/** Fetches the watermarked copy and hands it to the phone's share sheet, or downloads it. */
async function shareWatermarked(p: PhotoView) {
  const res = await fetch(photoUrls(p.id).share, { credentials: "include" });
  if (!res.ok) throw new Error(res.status === 404 ? "This photo is no longer available" : "Could not prepare the photo");
  const blob = await res.blob();
  const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `${p.job.jobNumber}_${p.returnNumber}.jpg`;
  const file = new File([blob], name, { type: "image/jpeg" });
  const text = `${L.job} ${p.job.jobNumber} · ${p.returnNumber} · ${formatQty(p.qty)} ${p.unit} @ ${photoRate(p)}`;
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name, text });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast.success("Watermarked copy downloaded");
}

/**
 * Full-screen photo viewer with the §20 "Photo Details" panel. Pass the list being browsed and the open id;
 * an id that isn't in the list (a deep link) is fetched on its own.
 */
export function PhotoViewer({
  photos,
  openId,
  onOpenChange,
}: {
  photos: PhotoView[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}) {
  const index = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const single = usePhoto(openId, !!openId && index < 0);
  const photo = index >= 0 ? photos[index] : single.data;
  const prev = index > 0 ? photos[index - 1] : null;
  const next = index >= 0 && index < photos.length - 1 ? photos[index + 1] : null;
  const go = useCallback((p: PhotoView | null) => p && onOpenChange(p.id), [onOpenChange]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") go(prev);
      if (e.key === "ArrowRight") go(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, prev, next, go]);

  const touchX = useRef<number | null>(null);

  return (
    <D.Root open={!!openId} onOpenChange={(o) => !o && onOpenChange(null)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/80 data-[state=open]:animate-[overlay-in_150ms_ease-out]" />
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-neutral-950 text-white focus:outline-none md:flex-row md:overflow-hidden"
        >
          <D.Title className="sr-only">{photo ? `Photo – ${photo.returnNumber}` : "Photo"}</D.Title>

          {/* Image area */}
          <div
            className="relative flex min-h-[55dvh] shrink-0 items-center justify-center md:min-h-0 md:flex-1"
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (dx > 60) go(prev);
              else if (dx < -60) go(next);
            }}
          >
            {photo ? (
              <DisplayImage key={photo.id} photo={photo} />
            ) : single.isError ? (
              <div className="w-full max-w-sm p-6">
                <ErrorBlock error={single.error} onRetry={() => single.refetch()} />
              </div>
            ) : (
              <span className="size-6 animate-spin rounded-full border-2 border-white/70 border-r-transparent" aria-label="Loading" />
            )}

            {photo && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/65 px-3 py-1.5 backdrop-blur-sm">
                <div className="text-[11px] text-white/70">Rate</div>
                <div className="num text-xl leading-6 font-semibold">{photoRate(photo)}</div>
              </div>
            )}

            <D.Close
              className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 grid size-11 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
              aria-label="Close"
            >
              <X className="size-5" />
            </D.Close>
            {index >= 0 && photos.length > 1 && (
              <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white/90">
                {index + 1} / {photos.length}
              </div>
            )}
            <NavButton side="left" disabled={!prev} onClick={() => go(prev)} />
            <NavButton side="right" disabled={!next} onClick={() => go(next)} />
          </div>

          {/* Details panel */}
          {photo && <DetailsPanel photo={photo} onClose={() => onOpenChange(null)} />}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function NavButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  if (disabled) return null;
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn("absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75", side === "left" ? "left-3" : "right-3")}
    >
      <Icon className="size-6" />
    </button>
  );
}

function DisplayImage({ photo }: { photo: PhotoView }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <>
      {state === "loading" && <span className="absolute size-6 animate-spin rounded-full border-2 border-white/70 border-r-transparent" aria-hidden />}
      {state === "error" ? (
        <div className="flex flex-col items-center gap-2 text-sm text-white/70">
          <ImageOff className="size-6" />
          Photo could not be loaded
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-only file served by the API
        <img
          src={photoUrls(photo.id).display}
          alt={`${photo.design?.name ?? "Design"} – ${photo.client.name}, ${photo.returnNumber}`}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={cn("max-h-[55dvh] max-w-full object-contain md:max-h-dvh", state === "loading" && "opacity-0", photo.voidedAt && "opacity-60 grayscale")}
        />
      )}
    </>
  );
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <dt className="shrink-0 text-[13px] text-fg-muted">{label}</dt>
      <dd className={cn("num min-w-0 text-right text-[13px] break-words text-fg", strong && "font-semibold")}>{children}</dd>
    </div>
  );
}

const linkCls = "text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent";

function DetailsPanel({ photo, onClose }: { photo: PhotoView; onClose: () => void }) {
  const { isManager, isOwner } = usePhotoRole();
  const voidM = usePhotoAction("void");
  const restoreM = usePhotoAction("restore");
  const [voiding, setVoiding] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <aside className="flex w-full flex-col bg-surface text-fg md:h-dvh md:w-[380px] md:shrink-0 md:overflow-y-auto">
      <div className="space-y-4 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Photo Details</h2>
            <p className="text-xs text-fg-muted">
              {photo.productName}
              {photo.jobWorkType ? ` · ${photo.jobWorkType}` : ""}
            </p>
          </div>
          {photo.voidedAt && <StatusBadge tone="neutral">Voided</StatusBadge>}
        </div>

        {photo.returnVoided && (
          <Notice tone="danger" icon={Ban}>
            Return voided. This return no longer counts in any total.
          </Notice>
        )}
        {photo.voidedAt && (
          <Notice tone="warning" icon={Ban}>
            Photo voided {formatDateTime(photo.voidedAt)}. Reason: {photo.voidReason}
          </Notice>
        )}

        {/* Rate – always prominent */}
        <div className="rounded-lg border border-accent/25 bg-accent-subtle px-4 py-3">
          <div className="text-xs text-fg-muted">Rate</div>
          <div className="num text-2xl leading-8 font-semibold tracking-[-0.01em] text-fg">{photoRate(photo)}</div>
          <div className="num mt-0.5 text-[13px] text-fg-2">
            {formatQty(photo.qty)} {photo.unit} · Amount {formatINR(photo.valuePaise)}
          </div>
        </div>

        <dl>
          <Row label={L.worker}>
            <Link className={linkCls} href={`/clients/${photo.client.id}`} onClick={onClose}>
              {photo.client.name}
            </Link>
          </Row>
          <Row label={L.job}>
            <Link className={linkCls} href={`/jobs/${photo.job.id}`} onClick={onClose}>
              {photo.job.jobNumber}
            </Link>
          </Row>
          <Row label="Return #">
            <Link className={linkCls} href={`/returns/${photo.returnId}`} onClick={onClose}>
              {photo.returnNumber}
            </Link>
          </Row>
          <Row label="Design">{photo.design?.name ?? "Whole return"}</Row>
          <Row label="Quantity" strong>
            {formatQty(photo.qty)} {photo.unit}
          </Row>
          <Row label="Rate" strong>
            {photoRate(photo)}
          </Row>
          <Row label="Amount" strong>
            {formatINR(photo.valuePaise)}
          </Row>
          <Row label="Return date">{formatDate(photo.receivedDate)}</Row>
          <Row label="Received">{formatDateTime(photo.receivedAt)}</Row>
          <Row label="Entered by">{photo.enteredBy ?? "—"}</Row>
          <Row label="Photo uploaded">
            {formatDateTime(photo.uploadedAt)}
            {photo.uploadedBy ? ` by ${photo.uploadedBy}` : ""}
          </Row>
          {photo.originalName && <Row label="File">{photo.originalName}</Row>}
        </dl>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" asChild>
            <a href={photoUrls(photo.id).original} target="_blank" rel="noopener">
              <ExternalLink /> Open original
            </a>
          </Button>
          <Button
            size="lg"
            loading={sharing}
            onClick={async () => {
              setSharing(true);
              try {
                await shareWatermarked(photo);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not share the photo");
              } finally {
                setSharing(false);
              }
            }}
          >
            {canShare ? <Share2 /> : <Download />} {canShare ? "Share" : "Download"}
          </Button>
        </div>
        <p className="text-xs text-fg-muted">Shared copies carry the {L.job.toLowerCase()}, return, quantity, rate, date and time. The original is never changed.</p>

        {isManager && !photo.voidedAt && (
          <Button variant="danger-ghost" className="w-full" size="lg" onClick={() => setVoiding(true)}>
            <Ban /> Void photo
          </Button>
        )}
        {isOwner && photo.voidedAt && (
          <Button variant="secondary" className="w-full" size="lg" onClick={() => setRestoring(true)}>
            <RotateCcw /> Restore photo
          </Button>
        )}
      </div>

      <ReasonDialog
        open={voiding}
        onOpenChange={setVoiding}
        title="Void this photo?"
        description="It stays in the records with your reason and can be restored by the owner."
        confirmLabel="Void photo"
        loading={voidM.isPending}
        onConfirm={(reason) =>
          voidM.mutate(
            { id: photo.id, reason },
            {
              onSuccess: () => {
                setVoiding(false);
                toast.success("Photo voided");
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
      <ReasonDialog
        open={restoring}
        onOpenChange={setRestoring}
        title="Restore this photo?"
        confirmLabel="Restore"
        loading={restoreM.isPending}
        onConfirm={(reason) =>
          restoreM.mutate(
            { id: photo.id, reason },
            {
              onSuccess: () => {
                setRestoring(false);
                toast.success("Photo restored");
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </aside>
  );
}
