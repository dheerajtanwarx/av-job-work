"use client";

export type WorkerDocSlot = "photo" | "aadhaar-front" | "aadhaar-back";

export const WORKER_DOC_FIELD = { photo: "photoId", "aadhaar-front": "aadhaarFrontId", "aadhaar-back": "aadhaarBackId" } as const;
export const WORKER_DOC_LABEL: Record<WorkerDocSlot, string> = { photo: "Worker photo", "aadhaar-front": "Aadhaar front", "aadhaar-back": "Aadhaar back" };

export const workerDocThumb = (id: string) => `/api/worker-documents/${id}/thumb`;
export const workerDocDisplay = (id: string) => `/api/worker-documents/${id}/display`;

async function send(path: string, init: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...init });
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new Error(body?.message ?? `Request failed (${res.status})`);
  return body;
}

export const uploadWorkerDoc = (clientId: string, slot: WorkerDocSlot, file: File) => {
  const fd = new FormData();
  fd.append("photo", file, file.name);
  return send(`/clients/${clientId}/documents/${slot}`, { method: "POST", body: fd });
};

export const removeWorkerDoc = (clientId: string, slot: WorkerDocSlot) =>
  send(`/clients/${clientId}/documents/${slot}/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
