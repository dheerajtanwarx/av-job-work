"use client";

import { Camera, Check, ImageOff, ImagePlus, RotateCcw, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHOTO_MAX_FILES, photoProblem, uploadReturnPhoto } from "@/lib/returns";
import { cn } from "@/lib/utils";

export type PhotoStatus = "ready" | "uploading" | "done" | "error";

export interface QueuedPhoto {
  key: string;
  file: File;
  url: string;
  /** Design tag: a jobItemId (Record Return) or returnLineId (return detail). null = whole return. */
  tag: string | null;
  status: PhotoStatus;
  progress: number;
  error: string | null;
}

let seq = 0;

/**
 * Photos picked on the device and uploaded after the return is saved.
 * Failed uploads stay in the queue with a Retry so a saved return never loses its photos silently.
 */
export function usePhotoQueue() {
  const [items, setItems] = useState<QueuedPhoto[]>([]);
  const ref = useRef(items);
  ref.current = items;

  useEffect(() => () => ref.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const patch = useCallback((key: string, p: Partial<QueuedPhoto>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x))), []);

  const add = useCallback((files: FileList | File[], tag: string | null) => {
    const list = [...files];
    const room = PHOTO_MAX_FILES * 3 - ref.current.length; // a generous local cap; the server takes 10 per request and we send one at a time
    const rejected: string[] = [];
    const next: QueuedPhoto[] = [];
    for (const file of list.slice(0, Math.max(0, room))) {
      const problem = photoProblem(file);
      if (problem) {
        rejected.push(`${file.name}: ${problem}`);
        continue;
      }
      next.push({ key: `p${++seq}`, file, url: URL.createObjectURL(file), tag, status: "ready", progress: 0, error: null });
    }
    if (list.length > room) rejected.push(`Only ${PHOTO_MAX_FILES * 3} photos can be added at once`);
    if (rejected.length) toast.error(rejected.join("\n"));
    if (next.length) setItems((xs) => [...xs, ...next]);
  }, []);

  const remove = useCallback((key: string) => {
    setItems((xs) => {
      const p = xs.find((x) => x.key === key);
      if (p) URL.revokeObjectURL(p.url);
      return xs.filter((x) => x.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    ref.current.forEach((p) => URL.revokeObjectURL(p.url));
    setItems([]);
  }, []);

  const setTag = useCallback((key: string, tag: string | null) => patch(key, { tag }), [patch]);

  /** Uploads every photo that isn't done yet, one at a time. Returns how many failed. */
  const uploadAll = useCallback(
    async (returnId: string, lineIdFor: (tag: string | null) => string | null, only?: string) => {
      let failed = 0;
      const todo = ref.current.filter((p) => p.status !== "done" && (!only || p.key === only));
      for (const p of todo) {
        patch(p.key, { status: "uploading", progress: 0, error: null });
        try {
          await uploadReturnPhoto(returnId, p.file, lineIdFor(p.tag), (progress) => patch(p.key, { progress }));
          patch(p.key, { status: "done", progress: 100 });
        } catch (e) {
          failed++;
          patch(p.key, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
        }
      }
      return failed;
    },
    [patch],
  );

  return { items, add, remove, clear, setTag, uploadAll };
}

export type PhotoQueue = ReturnType<typeof usePhotoQueue>;

/** Large camera / gallery buttons. `capture` opens the rear camera directly on phones. */
export function PhotoButtons({ onFiles, hasPhotos, disabled }: { onFiles: (files: FileList) => void; hasPhotos: boolean; disabled?: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const take = (input: HTMLInputElement | null) => {
    if (!input?.files?.length) return;
    onFiles(input.files);
    input.value = "";
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => take(e.currentTarget)} />
      <input ref={gallery} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => take(e.currentTarget)} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => camera.current?.click()}
        className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-accent-solid px-3 text-sm font-semibold text-on-accent shadow-xs transition-colors hover:bg-accent-solid-hover active:opacity-85 disabled:opacity-45"
      >
        <Camera className="size-5 shrink-0" /> {hasPhotos ? "Take another" : "Take Photo"}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => gallery.current?.click()}
        className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg shadow-xs transition-colors hover:bg-surface-2 active:opacity-85 disabled:opacity-45"
      >
        {hasPhotos ? <ImagePlus className="size-5 shrink-0" /> : <Upload className="size-5 shrink-0" />} {hasPhotos ? "Add More Photos" : "Upload Photo"}
      </button>
    </div>
  );
}

/** Preview grid with per-photo progress, remove, retry and an optional design tag. */
export function PhotoGrid({
  queue,
  tags,
  onRetry,
}: {
  queue: PhotoQueue;
  /** Design choices for tagging; hidden when there is only one design. */
  tags?: { value: string; label: string }[];
  onRetry?: (key: string) => void;
}) {
  if (queue.items.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {queue.items.map((p) => (
        <li key={p.key} className="min-w-0">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">
            <Preview url={p.url} name={p.file.name} />
            {p.status === "uploading" && (
              <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1.5 text-[11px] font-medium text-white">
                <div className="mb-1 flex justify-between">
                  <span>Uploading</span>
                  <span className="num">{p.progress}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/30">
                  <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${p.progress}%` }} />
                </div>
              </div>
            )}
            {p.status === "done" && (
              <span className="absolute right-1.5 bottom-1.5 inline-flex h-6 items-center gap-1 rounded-full bg-success px-2 text-[11px] font-semibold text-white">
                <Check className="size-3.5" /> Uploaded
              </span>
            )}
            {p.status === "error" && (
              <div className="absolute inset-x-0 bottom-0 bg-danger-solid/90 p-1.5 text-[11px] text-white">
                <div className="line-clamp-2 leading-tight">{p.error}</div>
                {onRetry && (
                  <button type="button" onClick={() => onRetry(p.key)} className="mt-1 inline-flex h-8 w-full items-center justify-center gap-1 rounded bg-white/95 text-xs font-semibold text-danger">
                    <RotateCcw className="size-3.5" /> Retry
                  </button>
                )}
              </div>
            )}
            {(p.status === "ready" || p.status === "error") && (
              <button
                type="button"
                onClick={() => queue.remove(p.key)}
                aria-label={`Remove ${p.file.name}`}
                className="absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/75"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {tags && tags.length > 1 && (
            <select
              value={p.tag ?? ""}
              disabled={p.status === "uploading" || p.status === "done"}
              onChange={(e) => queue.setTag(p.key, e.target.value || null)}
              aria-label="Design in this photo"
              className="mt-1 h-9 w-full truncate rounded-md border border-border-strong bg-surface px-2 text-xs text-fg-2 disabled:opacity-60"
            >
              <option value="">All designs</option>
              {tags.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </li>
      ))}
    </ul>
  );
}

function Preview({ url, name }: { url: string; name: string }) {
  const [broken, setBroken] = useState(false);
  // HEIC can't be previewed outside Safari; the server converts it.
  if (broken)
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-fg-muted">
        <ImageOff className="size-5" />
        <span className="line-clamp-2 break-all">{name}</span>
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="size-full object-cover" onError={() => setBroken(true)} />;
}

/** Summary line + "Retry all" for the upload phase. */
export function UploadSummary({ queue, onRetryAll }: { queue: PhotoQueue; onRetryAll: () => void }) {
  const total = queue.items.length;
  if (!total) return null;
  const done = queue.items.filter((p) => p.status === "done").length;
  const failed = queue.items.filter((p) => p.status === "error").length;
  const busy = queue.items.some((p) => p.status === "uploading");
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 text-[13px]", failed ? "text-danger" : "text-fg-2")}>
      <span className="num">
        {busy ? `Uploading photos… ${done} of ${total} done` : failed ? `${failed} photo${failed === 1 ? "" : "s"} not uploaded. The return is saved; retry the photos.` : `${done} photo${done === 1 ? "" : "s"} uploaded`}
      </span>
      {failed > 0 && !busy && (
        <Button type="button" size="md" variant="secondary" onClick={onRetryAll} className="min-h-11">
          <RotateCcw /> Retry all
        </Button>
      )}
    </div>
  );
}
