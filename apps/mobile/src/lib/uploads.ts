import type { JobItemPhotoKind } from "@av/shared";
import { File, UploadType } from "expo-file-system";
import { SaveFormat, ImageManipulator } from "expo-image-manipulator";
import { useSyncExternalStore } from "react";
import { apiUrl, authHeaders } from "./api";
import { queryClient } from "./query";

/**
 * Background photo upload queue. Photos are saved after the record they belong to (a return, a challan line),
 * so the user never waits on uploads: the queue keeps going while they move on, and failed items can be retried.
 */
export type UploadTarget =
  | { kind: "return"; returnId: string; returnLineId: string | null }
  | { kind: "job-item"; jobId: string; jobItemId: string; photoKind: JobItemPhotoKind };

export interface UploadItem {
  key: string;
  uri: string;
  target: UploadTarget;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

let items: UploadItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const update = (key: string, patch: Partial<UploadItem>) => {
  items = items.map((i) => (i.key === key ? { ...i, ...patch } : i));
  emit();
};
let running = false;
let seq = 0;

/** Shrink to 2048 px JPEG before sending: same look on the server's 1600 px display copy, far less mobile data. */
export async function compressPhoto(uri: string): Promise<string> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: 2048 });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    return uri;
  }
}

function endpoint(t: UploadTarget) {
  return t.kind === "return" ? `/returns/${t.returnId}/photos` : `/job-items/${t.jobItemId}/photos`;
}

async function uploadOne(it: UploadItem) {
  update(it.key, { status: "uploading", progress: 0, error: undefined });
  try {
    const t = it.target;
    const parameters: Record<string, string> = t.kind === "return" ? (t.returnLineId ? { returnLineId: t.returnLineId } : {}) : { kind: t.photoKind };
    const res = await new File(it.uri).upload(apiUrl(endpoint(t)), {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "photos",
      mimeType: "image/jpeg",
      parameters,
      headers: authHeaders(),
      onProgress: (p) => p.totalBytes && update(it.key, { progress: p.bytesSent / p.totalBytes }),
    });
    if (res.status < 200 || res.status >= 300) {
      let msg = `Upload failed (${res.status})`;
      try {
        msg = JSON.parse(res.body).message ?? msg;
      } catch {}
      throw new Error(msg);
    }
    update(it.key, { status: "done", progress: 1 });
    queryClient.invalidateQueries({ queryKey: t.kind === "return" ? ["return", t.returnId] : ["job", t.jobId] });
    queryClient.invalidateQueries({ queryKey: ["photos"] });
  } catch (e) {
    update(it.key, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = items.find((i) => i.status === "queued");
      if (!next) break;
      await uploadOne(next);
    }
  } finally {
    running = false;
  }
}

export const uploads = {
  enqueue(photos: { uri: string; target: UploadTarget }[]) {
    items = [...items.filter((i) => i.status !== "done"), ...photos.map((p) => ({ key: `u${++seq}`, uri: p.uri, target: p.target, status: "queued" as const, progress: 0 }))];
    emit();
    pump();
  },
  retry(key?: string) {
    items = items.map((i) => (i.status === "error" && (!key || i.key === key) ? { ...i, status: "queued" as const } : i));
    emit();
    pump();
  },
  clearDone() {
    items = items.filter((i) => i.status !== "done");
    emit();
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useUploads(filter?: (i: UploadItem) => boolean) {
  const all = useSyncExternalStore(subscribe, () => items);
  return filter ? all.filter(filter) : all;
}
