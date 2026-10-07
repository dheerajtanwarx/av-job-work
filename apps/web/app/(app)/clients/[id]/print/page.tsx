"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { termsLabel } from "@/components/forms/payment-terms";
import { Button } from "@/components/ui/button";
import { ErrorBlock, PageSkeleton } from "@/components/ui/misc";
import { WorkerSheet } from "@/components/workers/worker-sheet";
import { useClientSummary, useSettings } from "@/lib/queries";
import { useIsManager } from "@/lib/returns";

export default function WorkerPrintPage() {
  const { id } = useParams<{ id: string }>();
  const q = useClientSummary(id);
  const settings = useSettings();
  const isManager = useIsManager();

  if (q.isPending) return <PageSkeleton rows={6} />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data.client;
  const terms = c.paymentPolicy ? termsLabel(c.paymentPolicy, c.paymentDays) : settings.data ? `Default (${termsLabel(settings.data.defaultPaymentPolicy, settings.data.defaultPaymentDays)})` : "Business default";

  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost">
          <Link href={`/clients/${c.id}`}>
            <ArrowLeft /> {c.name}
          </Link>
        </Button>
        <Button className="ml-auto" onClick={() => window.print()} title="Choose “Save as PDF” as the printer for a PDF">
          <Printer /> Print
        </Button>
      </div>
      <WorkerSheet data={q.data} terms={terms} biz={settings.data} showAadhaar={isManager} />
    </div>
  );
}
