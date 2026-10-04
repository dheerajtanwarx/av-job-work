"use client";

import { L } from "@av/shared";
import { useParams } from "next/navigation";
import { JobForm } from "@/components/forms/job-form";
import { Card } from "@/components/ui/card";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { useJob } from "@/lib/queries";

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const q = useJob(id);
  return (
    <>
      <PageHeader
        eyebrow={L.jobs}
        title={q.data ? `Edit ${L.job.toLowerCase()} ${q.data.jobNumber}` : `Edit ${L.job.toLowerCase()}`}
        subtitle={q.data && q.data.status !== "DRAFT" ? "Material has been issued, so existing lines can't be removed or change material. Changes are recorded." : undefined}
      />
      {q.isPending ? (
        <Card className="overflow-hidden">
          <LoadingBlock />
        </Card>
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.status === "CANCELLED" ? (
        <ErrorBlock error={new Error(`This ${L.job.toLowerCase()} is cancelled and can't be edited.`)} />
      ) : (
        <JobForm job={q.data} />
      )}
    </>
  );
}
