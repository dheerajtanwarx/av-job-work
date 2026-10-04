"use client";

import { formatDate, formatINR, formatQty, type JobDetail, type TimelineEvent } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Ban, CalendarClock, PackageCheck, Pencil, ReceiptText, Truck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DispatchDialog } from "@/components/jobs/dispatch-dialog";
import { Timeline } from "@/components/jobs/timeline";
import { JobStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, TableWrap } from "@/components/ui/card";
import { ErrorBlock, FlowBar, LoadingBlock, Stat } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api.get<JobDetail>(`/jobs/${id}`) });
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [voiding, setVoiding] = useState<Extract<TimelineEvent, { type: "dispatch" | "return" }> | null>(null);

  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/jobs/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Job cancelled. It stays in the history.");
      setCancelOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const voidEntry = useMutation({
    mutationFn: (reason: string) => api.post(`/${voiding!.type === "return" ? "returns" : "dispatches"}/${voiding!.id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Entry voided. Quantities updated.");
      setVoiding(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const job = q.data;
  const t = job.totals;
  const cancelled = job.status === "CANCELLED";
  const canReturn = t.pending > 0;
  const canSend = !cancelled && (t.notYetSent > 0 || job.items.some((i) => i.rejected + i.damaged - i.reworkSent > 0));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-rise">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[2rem] leading-none font-semibold tracking-tight">{job.jobNumber}</h1>
            <JobStatusBadge status={job.status} overdue={job.overdue} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.95rem] text-muted">
            <Link href={`/clients/${job.client.id}`} className="font-semibold text-ink hover:text-indigo hover:underline">
              {job.client.name}
            </Link>
            <span>·</span>
            <span>{job.product.name}</span>
            <span>·</span>
            <span>{formatDate(job.jobDate)}</span>
            {job.expectedReturnDate && (
              <span className={cn("inline-flex items-center gap-1", job.overdue && "font-semibold text-madder")}>
                · <CalendarClock className="size-4" /> back by {formatDate(job.expectedReturnDate)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReturn && (
            <Button asChild variant="accent" size="lg">
              <Link href={`/returns/new?job=${job.id}`}>
                <PackageCheck /> Record return
              </Link>
            </Button>
          )}
          {t.unbilledQty > 0 && (
            <Button asChild variant={canReturn ? "secondary" : "primary"} size="lg">
              <Link href={`/invoices/new?clientId=${job.client.id}&jobId=${job.id}`}>
                <ReceiptText /> Bill {formatINR(t.unbilledValuePaise)}
              </Link>
            </Button>
          )}
          {canSend && (
            <Button variant="secondary" size="lg" onClick={() => setDispatchOpen(true)}>
              <Truck /> Send
            </Button>
          )}
          {!cancelled && (
            <Button asChild variant="ghost" size="lg">
              <Link href={`/jobs/${job.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          {!cancelled && (
            <Button variant="danger-ghost" size="lg" onClick={() => setCancelOpen(true)}>
              <Ban /> Cancel job
            </Button>
          )}
        </div>
      </div>

      {cancelled && (
        <div className="flex items-start gap-3 rounded-xl border border-madder/30 bg-madder-50 p-4 text-madder">
          <Ban className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="font-semibold">This job was cancelled on {formatDate(job.cancelledAt)}.</div>
            {job.cancelReason && <div className="text-sm">Reason: {job.cancelReason}</div>}
            {t.pending > 0 && <div className="mt-1 text-sm">{formatQty(t.pending)} pieces are still with the client. You can still record their return.</div>}
          </div>
        </div>
      )}
      {job.status === "DRAFT" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo/20 bg-indigo-50 p-4">
          <div className="text-indigo">
            <div className="font-semibold">Draft – material not sent yet</div>
            <div className="text-sm">When you hand over the pieces, mark them as sent.</div>
          </div>
          <Button onClick={() => setDispatchOpen(true)}>
            <Truck /> Mark {formatQty(t.notYetSent)} pieces as sent
          </Button>
        </div>
      )}

      {/* Quantity + money strip */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card className="p-5">
          <div className="grid grid-cols-3 items-end gap-2">
            <Stat label="Sent" value={formatQty(t.sent)} size="lg" sub={t.notYetSent > 0 ? `${formatQty(t.notYetSent)} not sent yet` : `of ${formatQty(t.quantity)} ordered`} />
            <Stat label="Received" value={formatQty(t.ok)} tone="leaf" size="lg" sub={t.exceptions > 0 ? <span className="text-madder">+{formatQty(t.exceptions)} damaged/rejected/lost</span> : "good pieces"} />
            <Stat label="Pending" value={formatQty(t.pending)} tone={t.pending > 0 ? "marigold" : "leaf"} size="lg" sub={t.pending > 0 ? "still with client" : "nothing outside"} />
          </div>
          <FlowBar className="mt-4 h-3" sent={t.sent} ok={t.ok} exceptions={t.exceptions} pending={t.pending} />
          {t.excess > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-marigold-700">
              <AlertTriangle className="size-4" /> {formatQty(t.excess)} more pieces were recorded than sent (approved exception).
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Stat label="Total work value" value={formatINR(t.expectedValuePaise)} />
            <Stat label="Completed value" value={formatINR(t.completedValuePaise)} tone="leaf" />
            <Stat label="Pending value" value={formatINR(t.pendingValuePaise)} tone={t.pendingValuePaise ? "marigold" : "muted"} />
            <Stat label="Billed" value={formatINR(t.billedValuePaise)} tone="indigo" sub={t.unbilledValuePaise > 0 ? `${formatINR(t.unbilledValuePaise)} not billed yet` : t.billedValuePaise ? "all completed work billed" : undefined} />
          </div>
        </Card>
      </div>

      {/* Design-wise table */}
      <Card>
        <CardHeader title="Design-wise position" description="Each design is tracked separately." />
        <TableWrap>
          <table className="ledger">
            <thead>
              <tr>
                <th>Design</th>
                <th className="r">Rate</th>
                <th className="r">Sent</th>
                <th className="r">Received</th>
                <th className="r">Damaged / Rejected / Lost</th>
                <th className="r">Pending</th>
                <th className="r">Done value</th>
                <th className="r">Total value</th>
              </tr>
            </thead>
            <tbody>
              {job.items.map((i) => (
                <tr key={i.id}>
                  <td className="min-w-40">
                    <div className="font-semibold">{i.designName}</div>
                    <FlowBar className="mt-1.5 max-w-36" sent={i.sent} ok={i.ok} exceptions={i.exceptions} pending={i.pending} />
                  </td>
                  <td className="r num">{formatINR(i.ratePaise)}</td>
                  <td className="r num">
                    {formatQty(i.sent)}
                    {i.reworkSent > 0 && <div className="text-xs text-muted">incl. {i.reworkSent} rework</div>}
                    {i.notYetSent > 0 && <div className="text-xs text-indigo">{i.notYetSent} not sent</div>}
                  </td>
                  <td className="r num font-semibold text-leaf">{formatQty(i.ok)}</td>
                  <td className="r num">
                    {i.exceptions > 0 ? (
                      <span className="text-madder">
                        {i.damaged} / {i.rejected} / {i.lost}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="r num">
                    {i.pending > 0 ? (
                      <span className="inline-block rounded-md bg-marigold-50 px-2 py-0.5 font-bold text-marigold-700">{formatQty(i.pending)}</span>
                    ) : (
                      <span className="font-semibold text-leaf">0 ✓</span>
                    )}
                  </td>
                  <td className="r num">{formatINR(i.completedValuePaise)}</td>
                  <td className="r num">{formatINR(i.expectedValuePaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td className="r num">{formatQty(t.sent)}</td>
                <td className="r num text-leaf">{formatQty(t.ok)}</td>
                <td className="r num">{t.exceptions > 0 ? <span className="text-madder">{t.damaged} / {t.rejected} / {t.lost}</span> : "—"}</td>
                <td className={cn("r num", t.pending > 0 ? "text-marigold-700" : "text-leaf")}>{formatQty(t.pending)}</td>
                <td className="r num">{formatINR(t.completedValuePaise)}</td>
                <td className="r num">{formatINR(t.expectedValuePaise)}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="History" description="Everything that happened on this job, in order." />
          <div className="px-3 pb-5 sm:px-5">
            <Timeline events={job.timeline} onVoid={cancelled ? undefined : setVoiding} />
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Invoices"
              action={
                t.unbilledQty > 0 && (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/invoices/new?clientId=${job.client.id}&jobId=${job.id}`}>
                      Create invoice <ArrowRight />
                    </Link>
                  </Button>
                )
              }
            />
            {job.invoices.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">
                {t.unbilledQty > 0 ? `${formatQty(t.unbilledQty)} completed pieces (${formatINR(t.unbilledValuePaise)}) are ready to bill.` : "No invoices yet. Work becomes billable when pieces come back."}
              </p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {job.invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-paper">
                      <div>
                        <div className="font-semibold text-indigo">{inv.invoiceNumber}</div>
                        <div className="text-sm text-muted">{formatDate(inv.date)}</div>
                      </div>
                      <div className="text-right">
                        <div className="num font-semibold">{formatINR(inv.totalPaise)}</div>
                        <PaymentStatusBadge status={inv.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {job.notes && (
            <Card className="p-5">
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Notes</div>
              <p className="whitespace-pre-wrap">{job.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <DispatchDialog job={job} open={dispatchOpen} onOpenChange={setDispatchOpen} />
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${job.jobNumber}?`}
        description="The job and its history are kept. It will be marked Cancelled."
        confirmLabel="Cancel job"
        loading={cancel.isPending}
        onConfirm={(r) => cancel.mutate(r)}
      >
        {t.pending > 0 && (
          <p className="mb-4 rounded-lg bg-marigold-50 px-3 py-2 text-sm text-marigold-700">
            {formatQty(t.pending)} pieces are still with {job.client.name}. They will keep showing as pending until you record their return.
          </p>
        )}
      </ReasonDialog>
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title={voiding?.type === "return" ? `Void return ${voiding.returnNumber}?` : "Void this dispatch?"}
        description="The entry stays in history, crossed out. Quantities are recalculated."
        confirmLabel="Void entry"
        loading={voidEntry.isPending}
        onConfirm={(r) => voidEntry.mutate(r)}
      />
    </div>
  );
}
