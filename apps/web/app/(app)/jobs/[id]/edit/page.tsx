"use client";

import type { JobDetail } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { JobForm } from "@/components/forms/job-form";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api } from "@/lib/api";

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api.get<JobDetail>(`/jobs/${id}`) });
  return (
    <>
      <PageHeader eyebrow="Jobs" title={q.data ? `Edit ${q.data.jobNumber}` : "Edit job"} subtitle={q.data && q.data.status !== "DRAFT" ? "Material has been sent, so lines can't be removed. Quantity and rate changes are recorded." : undefined} />
      {q.isPending ? <LoadingBlock /> : q.isError ? <ErrorBlock error={q.error} /> : <JobForm job={q.data} />}
    </>
  );
}
