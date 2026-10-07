"use client";

import type { DashboardCharts, DashboardV2, ReportResult } from "@av/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "./api";

export interface DateRangeValue {
  from?: string;
  to?: string;
}

/** Filters shared by every report (each report uses the ones it lists in REPORTS[].filters). */
export interface ReportFilterValues {
  from?: string;
  to?: string;
  date?: string;
  clientId?: string;
  designId?: string;
  productId?: string;
  jobWorkTypeId?: string;
  materialId?: string;
  jobId?: string;
  status?: string;
}

export const useDashboard = (range: DateRangeValue = {}) =>
  useQuery({
    queryKey: ["dashboard", range.from ?? "", range.to ?? ""],
    queryFn: () => api.get<DashboardV2>(`/dashboard${qs({ from: range.from, to: range.to })}`),
    placeholderData: keepPreviousData,
  });

export const useDashboardCharts = (range: DateRangeValue, enabled = true) =>
  useQuery({
    queryKey: ["dashboard", "charts", range.from ?? "", range.to ?? ""],
    queryFn: () => api.get<DashboardCharts>(`/dashboard/charts${qs({ from: range.from, to: range.to })}`),
    placeholderData: keepPreviousData,
    enabled,
  });

export function reportPath(id: string, filters: ReportFilterValues, extra: Record<string, string | number | undefined> = {}) {
  return `/reports/${id}${qs({ ...filters, ...extra })}`;
}

export const useReport = (id: string, filters: ReportFilterValues, page: { skip: number; take: number }, enabled = true) =>
  useQuery({
    queryKey: ["report", id, filters, page.skip, page.take],
    queryFn: () => api.get<ReportResult>(reportPath(id, filters, { skip: page.skip, take: page.take })),
    placeholderData: keepPreviousData,
    enabled,
  });

/** Same-origin export link (cookie auth); the browser downloads it. */
export const exportHref = (id: string, filters: ReportFilterValues, format: "csv" | "xlsx") => `/api${reportPath(id, filters, { format })}`;
