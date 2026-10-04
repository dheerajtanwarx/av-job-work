"use client";

import type { PhotoFilter, PhotoPage, PhotoView, SessionUser } from "@av/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";

/** Same cache entry as the app shell; the session user carries the role. */
export function usePhotoRole() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ user: SessionUser }>("/auth/me"), staleTime: Infinity, retry: false });
  const role = me.data?.user?.role;
  return { isManager: role === "OWNER" || role === "MANAGER", isOwner: role === "OWNER" };
}

export const photoQs = (f: PhotoFilter) =>
  qs({
    clientId: f.clientId,
    jobId: f.jobId,
    designId: f.designId,
    productId: f.productId,
    jobWorkTypeId: f.jobWorkTypeId,
    returnId: f.returnId,
    from: f.from,
    to: f.to,
    minRate: f.minRate,
    maxRate: f.maxRate,
    includeVoided: f.includeVoided || undefined,
    cursor: f.cursor,
    take: f.take,
  });

/** Gallery pages, newest first. */
export const usePhotoPages = (f: PhotoFilter, enabled = true) =>
  useInfiniteQuery({
    queryKey: ["photos", "list", { ...f, cursor: undefined }],
    queryFn: ({ pageParam }) => api.get<PhotoPage>(`/photos${photoQs({ ...f, cursor: pageParam ?? undefined })}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });

export const usePhoto = (id: string | null | undefined, enabled = true) =>
  useQuery({ queryKey: ["photos", "one", id], queryFn: () => api.get<PhotoView>(`/photos/${id}`), enabled: !!id && enabled });

/** Void / restore. Refreshes every photo list, the return and challan pages. */
export function usePhotoAction(kind: "void" | "restore") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<PhotoView>(`/photos/${id}/${kind}`, { reason }),
    onSuccess: (p) => {
      qc.setQueryData(["photos", "one", p.id], p);
      void qc.invalidateQueries({ queryKey: ["photos"] });
      void qc.invalidateQueries({ queryKey: ["return", p.returnId] });
      void qc.invalidateQueries({ queryKey: ["returns"] });
      void qc.invalidateQueries({ queryKey: ["job", p.job.id] });
    },
  });
}
