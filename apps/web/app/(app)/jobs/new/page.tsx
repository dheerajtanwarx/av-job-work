"use client";

import { L } from "@av/shared";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { JobForm } from "@/components/forms/job-form";
import { PageHeader } from "@/components/ui/misc";

function NewJob() {
  const params = useSearchParams();
  return <JobForm defaultClientId={params.get("clientId") ?? undefined} />;
}

export default function NewJobPage() {
  return (
    <>
      <PageHeader eyebrow={L.jobs} title={`New ${L.jobFull}`} subtitle="Who is doing the work, which material you're issuing, and the designs with their rates." />
      <Suspense>
        <NewJob />
      </Suspense>
    </>
  );
}
