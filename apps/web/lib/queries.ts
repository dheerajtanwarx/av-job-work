"use client";

import type {
  Client,
  ClientSummary,
  Design,
  JobDetail,
  JobListRow,
  JobWorkType,
  Ledger,
  LedgerRow,
  MaterialMovementRow,
  MaterialRow,
  MoneyPosition,
  PhotoFilter,
  PhotoPage,
  Product,
  Settings,
  WorkerMaterialRow,
  WorkerPerformance,
} from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "./api";

export const useClients = (active = true) =>
  useQuery({ queryKey: ["clients", "simple", active], queryFn: () => api.get<Client[]>(`/clients?simple=true${active ? "&active=true" : ""}`) });

export const useProducts = (active = true) =>
  useQuery({ queryKey: ["products", active], queryFn: () => api.get<Product[]>(`/products${active ? "?active=true" : ""}`) });

export const useDesigns = (active = true) =>
  useQuery({ queryKey: ["designs", active], queryFn: () => api.get<Design[]>(`/designs${active ? "?active=true" : ""}`) });

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });

export const useJobWorkTypes = (active = true) =>
  useQuery({ queryKey: ["job-work-types", active], queryFn: () => api.get<JobWorkType[]>(`/job-work-types${active ? "?active=true" : ""}`) });

/** Materials with stock positions. `active` = only active ones. */
export const useMaterials = (opts: { active?: boolean; q?: string } = {}) =>
  useQuery({
    queryKey: ["materials", opts.active ?? null, opts.q ?? ""],
    queryFn: () => api.get<MaterialRow[]>(`/materials${qs({ active: opts.active === undefined ? undefined : String(opts.active), q: opts.q })}`),
    placeholderData: (p) => p,
  });

export const useMaterialLedger = (materialId: string | undefined, range: { from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: ["materials", "ledger", materialId, range.from ?? "", range.to ?? ""],
    queryFn: () => api.get<MaterialMovementRow[]>(`/materials/${materialId}/ledger${qs(range)}`),
    enabled: !!materialId,
  });

export const useJob = (id: string | undefined) => useQuery({ queryKey: ["job", id], queryFn: () => api.get<JobDetail>(`/jobs/${id}`), enabled: !!id });

export interface ChallanLedger extends Ledger {
  issuedValuePaise: number;
  money: MoneyPosition;
}

export const useJobLedger = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["job", id, "ledger"], queryFn: () => api.get<ChallanLedger>(`/jobs/${id}/ledger`), enabled: !!id && enabled });

export const useClientSummary = (id: string | undefined) =>
  useQuery({ queryKey: ["client", id], queryFn: () => api.get<ClientSummary>(`/clients/${id}`), enabled: !!id });

export const useClientLedger = (id: string | undefined, range: { from?: string; to?: string } = {}, enabled = true) =>
  useQuery({
    queryKey: ["client", id, "ledger", range.from ?? "", range.to ?? ""],
    queryFn: () => api.get<Ledger>(`/clients/${id}/ledger${qs(range)}`),
    enabled: !!id && enabled,
    placeholderData: (p) => p,
  });

export const useClientMaterial = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["client", id, "material"], queryFn: () => api.get<WorkerMaterialRow[]>(`/clients/${id}/material`), enabled: !!id && enabled });

export const useClientPerformance = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["client", id, "performance"], queryFn: () => api.get<WorkerPerformance>(`/clients/${id}/performance`), enabled: !!id && enabled });

export const useClientChallans = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: ["client", id, "challans"], queryFn: () => api.get<JobListRow[]>(`/clients/${id}/challans`), enabled: !!id && enabled });

/** Return photos (newest first). */
export const usePhotos = (filter: PhotoFilter, enabled = true) =>
  useQuery({
    queryKey: ["photos", filter],
    queryFn: () => api.get<PhotoPage>(`/photos${qs(filter as Record<string, string | number | boolean | undefined>)}`),
    enabled,
  });

export type { LedgerRow };
