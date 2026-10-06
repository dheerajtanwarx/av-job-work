"use client";

import { ImagePlus, Lock, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { photoProblem } from "@/lib/returns";
import { cn } from "@/lib/utils";
import { workerDocDisplay, workerDocThumb } from "@/lib/worker-docs";

/** Round worker photo, or a person icon when there is none. */
export function WorkerAvatar({ photoId, name, className }: { photoId: string | null | undefined; name: string; className?: string }) {
  if (!photoId)
    return (
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-faint ring-1 ring-border", className)} aria-hidden>
        <User className="size-1/2" />
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={workerDocThumb(photoId)} alt={name} className={cn("size-10 shrink-0 rounded-full bg-surface-2 object-cover ring-1 ring-border", className)} />;
}

/** A saved Aadhaar / photo thumbnail that opens full size, or a locked placeholder. */
export function DocThumb({ id, label, locked }: { id: string | null; label: string; locked?: boolean }) {
  return (
    <figure className="w-36">
      {locked ? (
        <div className="grid aspect-[3/2] place-items-center rounded-md border border-dashed border-border-strong text-fg-faint" title="Only the owner or a manager can see Aadhaar photos">
          <Lock className="size-4" />
        </div>
      ) : id ? (
        <a href={workerDocDisplay(id)} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={workerDocThumb(id)} alt={label} className="aspect-[3/2] w-full rounded-md bg-surface-2 object-cover ring-1 ring-border" />
        </a>
      ) : (
        <div className="grid aspect-[3/2] place-items-center rounded-md border border-dashed border-border-strong text-xs text-fg-faint">Not added</div>
      )}
      <figcaption className="mt-1 text-xs text-fg-muted">{label}</figcaption>
    </figure>
  );
}

/**
 * Picks one image for a worker slot. `value` is the change to apply on save:
 * undefined = keep the saved one, File = replace, null = remove.
 */
export function DocPicker({
  label,
  hint,
  savedId,
  value,
  onChange,
  round,
}: {
  label: string;
  hint?: string;
  savedId: string | null;
  value: File | null | undefined;
  onChange: (v: File | null | undefined) => void;
  round?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!(value instanceof File)) return setUrl(null);
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  const shown = url ?? (value === undefined && savedId ? workerDocThumb(savedId) : null);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[13px] font-medium text-fg-2">{label}</div>
      <div className="flex items-center gap-3">
        <div className={cn("relative size-16 shrink-0 overflow-hidden bg-surface-2 ring-1 ring-border", round ? "rounded-full" : "rounded-md")}>
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={label} className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-fg-faint">{round ? <User className="size-6" /> : <ImagePlus className="size-5" />}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={input}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!f) return;
              const problem = photoProblem(f);
              if (problem) toast.error(`${f.name}: ${problem}`);
              else onChange(f);
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
            <ImagePlus /> {shown ? "Change" : "Choose photo"}
          </Button>
          {shown && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(savedId ? null : undefined)}>
              <X /> Remove
            </Button>
          )}
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}
