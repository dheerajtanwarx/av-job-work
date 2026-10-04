"use client";

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
      <PageHeader eyebrow="Jobs" title="New job" subtitle="Choose who is doing the work, what you're sending, and the designs." />
      <Suspense>
        <NewJob />
      </Suspense>
    </>
  );
}
