"use client";

import { formatDate, formatINR, formatQty, type JobDetail, type TimelineEvent } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Ban, PackageCheck, Pencil, ReceiptText, Truck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DispatchDialog } from "@/components/jobs/dispatch-dialog";
import { Timeline } from "@/components/jobs/timeline";
import { JobStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Section, TableWrap } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ErrorBlock, FlowBar, LoadingBlock, Notice, Stat } from "@/components/ui/misc";
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

  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={8} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const job = q.data;
  const t = job.totals;
  const cancelled = job.status === "CANCELLED";
  const canReturn = t.pending > 0;
  const canSend = !cancelled && (t.notYetSent > 0 || job.items.some((i) => i.rejected + i.damaged - i.reworkSent > 0));

  const billLink = t.unbilledQty > 0 && (
    <Button asChild variant={canReturn ? "secondary" : "primary"}>
      <Link href={`/invoices/new?clientId=${job.client.id}&jobId=${job.id}`}>
        <ReceiptText /> Bill {formatINR(t.unbilledValuePaise)}
      </Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/jobs" className="hover:text-fg">
              Jobs
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{job.jobNumber}</h1>
            <JobStatusBadge status={job.status} overdue={job.overdue} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-muted">
            <Link href={`/clients/${job.client.id}`} className="font-medium text-fg-2 hover:text-accent">
              {job.client.name}
            </Link>
            <span aria-hidden>·</span>
            <span>{job.product.name}</span>
            <span aria-hidden>·</span>
            <span className="num">{formatDate(job.jobDate)}</span>
            {job.expectedReturnDate && (
              <>
                <span aria-hidden>·</span>
                <span className={cn("num", job.overdue && "font-medium text-danger")}>Back by {formatDate(job.expectedReturnDate)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSend && (
            <Button variant="ghost" onClick={() => setDispatchOpen(true)}>
              <Truck /> Send
            </Button>
          )}
          {!cancelled && (
            <Button asChild variant="ghost">
              <Link href={`/jobs/${job.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          {billLink}
          {canReturn && (
            <Button asChild>
              <Link href={`/returns/new?job=${job.id}`}>
                <PackageCheck /> Record return
              </Link>
            </Button>
          )}
          {!cancelled && (
            <Menu>
              <MenuItem danger icon={<Ban />} onSelect={() => setCancelOpen(true)}>
                Cancel job
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {cancelled && (
        <Notice tone="danger" icon={Ban}>
          <span className="font-medium text-fg">Cancelled on {formatDate(job.cancelledAt)}.</span>
          {job.cancelReason && <span className="text-fg-muted"> {job.cancelReason}</span>}
          {t.pending > 0 && <div className="mt-0.5 text-fg-muted">{formatQty(t.pending)} pieces are still with the client. You can still record their return.</div>}
        </Notice>
      )}
      {job.status === "DRAFT" && (
        <Notice
          tone="accent"
          icon={Truck}
          action={
            <Button size="sm" onClick={() => setDispatchOpen(true)}>
              Mark {formatQty(t.notYetSent)} pieces as sent
            </Button>
          }
        >
          <span className="font-medium text-fg">Draft</span>
          <span className="text-fg-muted"> · Material not sent yet. Mark it as sent when you hand it over.</span>
        </Notice>
      )}

      {/* Summary */}
      <Card className="grid lg:grid-cols-[1.2fr_1fr]">
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Sent" value={formatQty(t.sent)} size="lg" sub={t.notYetSent > 0 ? `${formatQty(t.notYetSent)} not sent yet` : `of ${formatQty(t.quantity)} ordered`} />
            <Stat label="Received" value={formatQty(t.ok)} size="lg" sub={t.exceptions > 0 ? <span className="text-danger">+{formatQty(t.exceptions)} damaged/rejected/lost</span> : "Good pieces"} />
            <Stat label="Pending" value={formatQty(t.pending)} tone={t.pending > 0 ? "warning" : "fg"} size="lg" sub={t.pending > 0 ? "Still with client" : "Nothing outside"} />
          </div>
          <FlowBar className="mt-4 h-1.5" sent={t.sent} ok={t.ok} exceptions={t.exceptions} pending={t.pending} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" />Received</span>
            {t.exceptions > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-danger/70" />Damaged / rejected / lost</span>}
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning-solid" />Pending</span>
          </div>
          {t.excess > 0 && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="size-3.5" /> {formatQty(t.excess)} more pieces recorded than sent (approved exception).
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 border-t border-border lg:border-t-0 lg:border-l">
          {[
            { label: "Total work value", value: formatINR(t.expectedValuePaise) },
            { label: "Completed value", value: formatINR(t.completedValuePaise) },
            { label: "Pending value", value: formatINR(t.pendingValuePaise), cls: t.pendingValuePaise ? "text-warning" : "" },
            { label: "Billed", value: formatINR(t.billedValuePaise), sub: t.unbilledValuePaise > 0 ? `${formatINR(t.unbilledValuePaise)} not billed` : t.billedValuePaise ? "All completed work billed" : undefined },
          ].map((m, i) => (
            <div key={m.label} className={cn("px-4 py-3.5 sm:px-5", i % 2 === 1 && "border-l border-border", i > 1 && "border-t border-border")}>
              <dt className="text-xs text-fg-muted">{m.label}</dt>
              <dd className={cn("num mt-1 text-[15px] font-semibold", m.cls)}>{m.value}</dd>
              {m.sub && <dd className="num mt-0.5 text-xs text-fg-muted">{m.sub}</dd>}
            </div>
          ))}
        </dl>
      </Card>

      {/* Design-wise table */}
      <Section title="Designs" description="Each design is tracked separately">
        <Card className="overflow-hidden">
          {/* Phones: one compact block per design so Pending is always visible */}
          <ul className="divide-y divide-border sm:hidden">
            {job.items.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">{i.designName}</span>
                  <span className="num text-xs text-fg-muted">
                    {formatINR(i.ratePaise)} × {formatQty(i.quantity)} = <span className="text-fg-2">{formatINR(i.expectedValuePaise)}</span>
                  </span>
                </div>
                <div className="num mt-2 grid grid-cols-3">
                  <div><div className="text-[11px] text-fg-muted">Sent</div><div className="text-[15px] font-medium">{formatQty(i.sent)}</div></div>
                  <div><div className="text-[11px] text-fg-muted">Received</div><div className="text-[15px] font-medium">{formatQty(i.ok)}</div></div>
                  <div><div className="text-[11px] text-fg-muted">Pending</div><div className={cn("text-[15px] font-medium", i.pending ? "text-warning" : "text-fg-muted")}>{i.pending ? formatQty(i.pending) : "0 ✓"}</div></div>
                </div>
                <FlowBar className="mt-2" sent={i.sent} ok={i.ok} exceptions={i.exceptions} pending={i.pending} />
                {i.exceptions > 0 && <div className="mt-1 text-xs text-danger">{i.damaged} damaged · {i.rejected} rejected · {i.lost} lost</div>}
              </li>
            ))}
            <li className="num grid grid-cols-3 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold">
              <span>{formatQty(t.sent)}</span>
              <span>{formatQty(t.ok)}</span>
              <span className={t.pending ? "text-warning" : ""}>{formatQty(t.pending)}</span>
            </li>
          </ul>
          <TableWrap className="max-sm:hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Design</th>
                  <th className="r">Rate</th>
                  <th className="r">Sent</th>
                  <th className="r">Received</th>
                  <th className="r" title="Damaged / Rejected / Lost">Dmg / Rej / Lost</th>
                  <th className="r">Pending</th>
                  <th className="r">Done value</th>
                  <th className="r">Total value</th>
                </tr>
              </thead>
              <tbody>
                {job.items.map((i) => (
                  <tr key={i.id}>
                    <td className="min-w-40">
                      <div className="font-medium">{i.designName}</div>
                      <FlowBar className="mt-1.5 max-w-32" sent={i.sent} ok={i.ok} exceptions={i.exceptions} pending={i.pending} />
                    </td>
                    <td className="r text-fg-muted">{formatINR(i.ratePaise)}</td>
                    <td className="r">
                      {formatQty(i.sent)}
                      {i.reworkSent > 0 && <div className="text-xs text-fg-muted">incl. {i.reworkSent} rework</div>}
                      {i.notYetSent > 0 && <div className="text-xs text-accent">{i.notYetSent} not sent</div>}
                    </td>
                    <td className="r">{formatQty(i.ok)}</td>
                    <td className="r">
                      {i.exceptions > 0 ? (
                        <span className="text-danger">
                          {i.damaged} / {i.rejected} / {i.lost}
                        </span>
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>
                    <td className="r">
                      {i.pending > 0 ? <span className="font-medium text-warning">{formatQty(i.pending)}</span> : <span className="text-fg-muted">0 ✓</span>}
                    </td>
                    <td className="r">{formatINR(i.completedValuePaise)}</td>
                    <td className="r">{formatINR(i.expectedValuePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className="r">{formatQty(t.sent)}</td>
                  <td className="r">{formatQty(t.ok)}</td>
                  <td className="r">{t.exceptions > 0 ? <span className="text-danger">{t.damaged} / {t.rejected} / {t.lost}</span> : <span className="text-fg-faint">—</span>}</td>
                  <td className={cn("r", t.pending > 0 && "text-warning")}>{formatQty(t.pending)}</td>
                  <td className="r">{formatINR(t.completedValuePaise)}</td>
                  <td className="r">{formatINR(t.expectedValuePaise)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </Card>
      </Section>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1.5fr_1fr]">
        <Section title="History">
          <div className="pt-2">
            <Timeline events={job.timeline} onVoid={cancelled ? undefined : setVoiding} />
          </div>
        </Section>
        <div className="space-y-6">
          <Section
            title="Invoices"
            action={
              t.unbilledQty > 0 && (
                <Link href={`/invoices/new?clientId=${job.client.id}&jobId=${job.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
                  Create invoice <ArrowRight className="size-3" />
                </Link>
              )
            }
          >
            {job.invoices.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong px-4 py-4 text-[13px] text-fg-muted">
                {t.unbilledQty > 0 ? `${formatQty(t.unbilledQty)} completed pieces (${formatINR(t.unbilledValuePaise)}) are ready to bill.` : "No invoices yet. Work becomes billable when pieces come back."}
              </p>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {job.invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-100 hover:bg-surface-2">
                        <div>
                          <div className="text-[13px] font-medium">{inv.invoiceNumber}</div>
                          <div className="num text-xs text-fg-muted">{formatDate(inv.date)}</div>
                        </div>
                        <div className="text-right">
                          <div className="num text-[13px] font-medium">{formatINR(inv.totalPaise)}</div>
                          <PaymentStatusBadge status={inv.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Section>
          {job.notes && (
            <Section title="Notes">
              <p className="text-[13px] whitespace-pre-wrap text-fg-2">{job.notes}</p>
            </Section>
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
          <p className="mb-4 rounded-md bg-warning-subtle px-3 py-2 text-[13px] text-fg-2">
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
