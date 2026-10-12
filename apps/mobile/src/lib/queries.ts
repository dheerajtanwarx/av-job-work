import type { Client, ClientListRow, Design, JobWorkType, MaterialRow, Product, ClientSummary, Ledger, WorkerMaterialRow, WorkerPerformance, DashboardV2, JobDetail, JobListRow, MainBillDetail, PhotoView, ReturnDetail, ReturnRow, Settings, SubBillDetail } from "@av/shared";
import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { api, qs } from "./api";

/** Query keys match apps/web/lib/queries.ts so invalidation rules read the same in both apps. */
export const useDashboard = (range: { from?: string; to?: string }) =>
  useQuery({
    queryKey: ["dashboard", range.from ?? "", range.to ?? ""],
    queryFn: () => api.get<DashboardV2>(`/dashboard${qs(range)}`),
    placeholderData: (p) => p,
  });

export const useJobs = (filters: Record<string, string | undefined>) =>
  useQuery({
    queryKey: ["jobs", filters],
    queryFn: () => api.get<JobListRow[]>(`/jobs${qs(filters)}`),
    placeholderData: (p) => p,
  });

export interface ReturnFilters {
  clientId?: string;
  jobId?: string;
  designId?: string;
  from?: string;
  to?: string;
  q?: string;
  voided?: boolean;
}

const RETURNS_PAGE = 30;

/** Returns, paged 30 at a time for infinite scroll. */
export const useReturnsInfinite = (f: ReturnFilters) =>
  useInfiniteQuery({
    queryKey: ["returns", "infinite", f],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<{ total: number; rows: ReturnRow[] }>(`/returns${qs({ ...f, voided: f.voided ? "true" : undefined, skip: pageParam, take: RETURNS_PAGE })}`),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

export const useJob = (id: string | undefined) => useQuery({ queryKey: ["job", id], queryFn: () => api.get<JobDetail>(`/jobs/${id}`), enabled: !!id });

export const useClientSummary = (id: string | undefined) =>
  useQuery({ queryKey: ["client", id], queryFn: () => api.get<ClientSummary>(`/clients/${id}`), enabled: !!id });

/** After any write that moves material or money, refresh everything that shows it. */
export function invalidateWork(qc: QueryClient, jobId?: string) {
  for (const key of [["jobs"], ["returns"], ["dashboard"], ["sub-bills"], ["main-bills"], ["money"], ["clients"], ["client"], ["materials"]])
    qc.invalidateQueries({ queryKey: key });
  if (jobId) qc.invalidateQueries({ queryKey: ["job", jobId] });
}

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings"), staleTime: 5 * 60_000 });

/** Challans with material still outside (Record Return step 1). */
export const useOpenJobs = () => useQuery({ queryKey: ["jobs", "pending"], queryFn: () => api.get<JobListRow[]>("/jobs?pending=true") });

export const useReturn = (id: string | undefined) => useQuery({ queryKey: ["return", id], queryFn: () => api.get<ReturnDetail>(`/returns/${id}`), enabled: !!id });

export const useClients = (active = true) =>
  useQuery({ queryKey: ["clients", "simple", active], queryFn: () => api.get<Client[]>(`/clients?simple=true${active ? "&active=true" : ""}`) });

export const useJobsFor = (clientId: string | undefined) =>
  useQuery({ queryKey: ["jobs", "client", clientId], queryFn: () => api.get<JobListRow[]>(`/jobs${qs({ clientId })}`), enabled: !!clientId });

export const useSubBill = (id: string | undefined) => useQuery({ queryKey: ["sub-bill", id], queryFn: () => api.get<SubBillDetail>(`/sub-bills/${id}`), enabled: !!id });
export const useMainBill = (id: string | undefined) => useQuery({ queryKey: ["main-bill", id], queryFn: () => api.get<MainBillDetail>(`/main-bills/${id}`), enabled: !!id });

export const useClientList = (f: { q?: string; active?: string }) =>
  useQuery({ queryKey: ["clients", "list", f], queryFn: () => api.get<ClientListRow[]>(`/clients${qs(f)}`), placeholderData: (p) => p });

export const useClientLedger = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["client", id, "ledger"], queryFn: () => api.get<Ledger>(`/clients/${id}/ledger`), enabled: !!id && enabled });

export const useClientMaterial = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["client", id, "material"], queryFn: () => api.get<WorkerMaterialRow[]>(`/clients/${id}/material`), enabled: !!id && enabled });

export const useClientPerformance = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["client", id, "performance"], queryFn: () => api.get<WorkerPerformance>(`/clients/${id}/performance`), enabled: !!id && enabled });

export const usePhoto = (id: string | undefined) => useQuery({ queryKey: ["photo", id], queryFn: () => api.get<PhotoView>(`/photos/${id}`), enabled: !!id });

export const useProducts = (active = true) => useQuery({ queryKey: ["products", active], queryFn: () => api.get<Product[]>(`/products${active ? "?active=true" : ""}`) });
export const useDesigns = (active = true) => useQuery({ queryKey: ["designs", active], queryFn: () => api.get<Design[]>(`/designs${active ? "?active=true" : ""}`) });
export const useJobWorkTypes = (active = true) => useQuery({ queryKey: ["job-work-types", active], queryFn: () => api.get<JobWorkType[]>(`/job-work-types${active ? "?active=true" : ""}`) });
export const useMaterials = (opts: { active?: boolean; q?: string } = {}) =>
  useQuery({
    queryKey: ["materials", opts.active ?? null, opts.q ?? ""],
    queryFn: () => api.get<MaterialRow[]>(`/materials${qs({ active: opts.active === undefined ? undefined : String(opts.active), q: opts.q })}`),
    placeholderData: (p) => p,
  });
