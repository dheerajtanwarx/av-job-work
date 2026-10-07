"use client";

import { formatINR, formatQty, PAYMENT_METHOD_LABEL, roundQty, type ReturnResult } from "@av/shared";
import { CheckCircle2, FileText, Mail, MailWarning, PackageCheck, Printer, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { receivedLabel } from "@/lib/returns";
import { cn } from "@/lib/utils";
import { PhotoGrid, UploadSummary, type PhotoQueue } from "./photo-uploader";
import { PayStatusPill, paymentSummary } from "./status";

export function ReturnSuccess({
  result: r,
  date,
  queue,
  onRetry,
  onRetryAll,
  onAnother,
}: {
  result: ReturnResult;
  date: string;
  queue: PhotoQueue;
  onRetry: (key: string) => void;
  onRetryAll: () => void;
  onAnother: () => void;
}) {
  const job = r.job;
  const unit = job.unit;
  const exceptions = roundQty(r.receivedNow - r.okNow);
  const v = r.voucher;
  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-[pop-in_150ms_ease-out]">
      <Card className="overflow-hidden">
        <div role="status" className="flex items-start gap-3 border-b border-success/20 bg-success-subtle px-4 py-4">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" />
          <div className="min-w-0">
            <div className="text-lg leading-6 font-semibold">{r.returnNumber} saved</div>
            <div className="num mt-0.5 text-[13px] text-fg-2">
              Received {receivedLabel(date, r.receivedAt)} · {job.jobNumber} · {job.client.name}
            </div>
            {r.justCompleted && <div className="mt-1 text-[13px] font-medium text-success">Challan completed. Nothing is pending.</div>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { label: "Received now", value: `${formatQty(r.receivedNow)} ${unit}`, sub: exceptions > 0 ? `${formatQty(r.okNow)} good · ${formatQty(exceptions)} other` : "All good" },
            { label: "Work value", value: formatINR(r.okValueNowPaise) },
            { label: "Still pending", value: `${formatQty(job.totals.pending)} ${unit}`, tone: job.totals.pending > 0 ? "text-warning" : "text-success" },
            { label: "Challan outstanding", value: formatINR(job.money.outstandingPaise), tone: job.money.outstandingPaise > 0 ? "text-orange-700 dark:text-orange-300" : "" },
          ].map((m) => (
            <div key={m.label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-fg-muted">{m.label}</dt>
              <dd className={cn("num mt-1 text-lg leading-6 font-semibold", m.tone)}>{m.value}</dd>
              {m.sub && <dd className="num mt-0.5 text-xs text-fg-muted">{m.sub}</dd>}
            </div>
          ))}
        </dl>
      </Card>

      <Card className="px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold">Payment for this return</h2>
          <PayStatusPill payment={r.payment} />
        </div>
        {r.payment ? (
          <p className="num mt-1 text-[13px] text-fg-2">{r.payment.status === "NOT_PAID" ? `₹0 paid · ${paymentSummary(r.payment)}` : paymentSummary(r.payment)}</p>
        ) : (
          <p className="mt-1 text-[13px] text-fg-muted">No payment information.</p>
        )}
        {v && (
          <div className="mt-3 rounded-md border border-border px-3 py-2.5 text-[13px]">
            <div className="num">
              <Link href={`/bills/sub/${v.id}`} className="font-semibold hover:text-accent">
                {v.billNumber}
              </Link>{" "}
              · {formatINR(v.amountPaise)} by {PAYMENT_METHOD_LABEL[v.method]}
              {v.reference && <span className="text-fg-muted"> · {v.reference}</span>}
            </div>
            <div className={cn("mt-1 flex items-start gap-1.5 text-xs", v.email.status === "sent" ? "text-success" : v.email.status === "failed" ? "text-danger" : "text-fg-muted")}>
              {v.email.status === "sent" ? <Mail className="mt-px size-3.5 shrink-0" /> : <MailWarning className="mt-px size-3.5 shrink-0" />}
              <span>{v.email.message}</span>
            </div>
          </div>
        )}
      </Card>

      {queue.items.length > 0 ? (
        <Card className="space-y-3 px-4 py-3.5">
          <h2 className="text-[13px] font-semibold">Design / job work photos</h2>
          <UploadSummary queue={queue} onRetryAll={onRetryAll} />
          <PhotoGrid queue={queue} onRetry={onRetry} />
        </Card>
      ) : (
        <p className="px-1 text-[13px] text-warning">No photo was attached. You can add photos from the return page.</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {job.totals.pending > 0 && job.status !== "CANCELLED" && (
          <Button size="lg" className="min-h-12 sm:col-span-2" onClick={onAnother}>
            <PackageCheck /> Record another for {job.jobNumber}
          </Button>
        )}
        <Button asChild size="lg" variant="secondary" className="min-h-12">
          <Link href={`/returns/${r.id}`}>
            <FileText /> View return
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="min-h-12">
          <Link href={`/returns/${r.id}/print`}>
            <Printer /> Print receiving voucher
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="min-h-12">
          <Link href={`/jobs/${job.id}`}>View challan</Link>
        </Button>
        {r.payment && r.payment.outstandingPaise > 0 && (
          <Button asChild size="lg" variant="secondary" className="min-h-12">
            <Link href={`/bills/new?jobId=${job.id}&returnId=${r.id}`}>
              <Wallet /> Record payment
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
