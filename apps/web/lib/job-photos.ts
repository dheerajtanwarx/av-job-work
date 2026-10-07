"use client";

import type { JobItemPhotoKind, JobItemPhotoView } from "@av/shared";
import { PHOTO_MAX_FILES } from "./returns";

export const jobPhotoThumb = (id: string) => `/api/job-photos/${id}/thumb`;
export const jobPhotoDisplay = (id: string) => `/api/job-photos/${id}/display`;

/** Uploads reference photos to a saved challan line, at most PHOTO_MAX_FILES per request. */
export async function uploadJobItemPhotos(jobItemId: string, kind: JobItemPhotoKind, files: File[]): Promise<JobItemPhotoView[]> {
  const out: JobItemPhotoView[] = [];
  for (let i = 0; i < files.length; i += PHOTO_MAX_FILES) {
    const fd = new FormData();
    fd.append("kind", kind);
    for (const f of files.slice(i, i + PHOTO_MAX_FILES)) fd.append("photos", f, f.name);
    const res = await fetch(`/api/job-items/${jobItemId}/photos`, { method: "POST", credentials: "include", body: fd });
    const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    if (!res.ok && res.status !== 404) throw new Error(body?.message ?? `Upload failed (${res.status})`);
    out.push(...(body as JobItemPhotoView[]));
  }
  return out;
}

/** A 404 means the photo is already gone (e.g. its draft line was deleted), which is the goal. */
export async function removeJobItemPhoto(id: string) {
  const res = await fetch(`/api/job-photos/${id}/remove`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!res.ok && res.status !== 404) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? "Couldn't remove the photo");
}
