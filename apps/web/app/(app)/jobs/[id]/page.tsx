"use client";

import { formatDate, formatINR, formatQty, L, type JobDetail, type ReturnRow, type TimelineEvent } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Ban, Camera, FileCheck2, Images, PackageCheck, Pencil, Printer, ReceiptText, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { termsLabel } from "@/components/forms/payment-terms";
import { DispatchDialog } from "@/components/jobs/dispatch-dialog";
import { LedgerTable } from "@/components/jobs/ledger-table";
import { PhotoGrid } from "@/components/jobs/photo-grid";
import { formatTime, Timeline } from "@/components/jobs/timeline";
import { BillStatusBadge, JobStatusBadge, PayStatusBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, Section, TableWrap } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { EmptyState, ErrorBlock, FlowBar, KeyValues, LoadingBlock, Metric, MetricStrip, Notice, PageSkeleton } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useJob, useJobLedger } from "@/lib/queries";
import { cn } from "@/lib/utils";

const TABS = ["overview", "returns", "ledger", "photos", "timeline"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", returns: "Returns", ledger: "Ledger", photos: "Photos", timeline: "Timeline" };

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useJob(id);
  const [tab, setTab] = useState<Tab>("overview");
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [voiding, setVoiding] = useState<{ type: "return" | "dispatch"; id: string; label: string } | null>(null);

  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/jobs/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${L.job} cancelled. It stays in the history.`);
      setCancelOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const voidEntry = useMutation({
    mutationFn: (reason: string) => api.post(`/${voiding!.type === "return" ? "returns" : "dispatches"}/${voiding!.id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Entry voided. Quantities and values updated.");
      setVoiding(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <PageSkeleton rows={6} />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const job = q.data;
  const t = job.totals;
  const m = job.money;
  const u = job.unit;
  const cancelled = job.status === "CANCELLED";
  const canReturn = t.pending > 0;
  const canIssue = !cancelled;
  const liveReturns = job.returns.filter((r) => !r.voidedAt);
  const photoCount = liveReturns.reduce((s, r) => s + r.photoCount, 0);
  const payHref = `/bills/new?jobId=${job.id}`;

  const onVoidEvent = (e: Extract<TimelineEvent, { type: "dispatch" | "return" }>) =>
    setVoiding({ type: e.type, id: e.id, label: e.type === "return" ? `return ${e.returnNumber}` : "this material issue" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/jobs" className="hover:text-fg">
              {L.jobs}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">
              <span className="sr-only">{L.jobNumber} </span>
              {job.jobNumber}
            </h1>
            <JobStatusBadge status={job.status} overdue={job.overdue} />
            {!cancelled && m.valuePaise > 0 && <PayStatusBadge status={job.payStatus} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-fg-muted">
            <Link href={`/clients/${job.client.id}`} className="font-medium text-fg-2 hover:text-accent">
              {job.client.name}
            </Link>
            <span aria-hidden>·</span>
            <span>{job.product.name}</span>
            {job.jobWorkType && (
              <>
                <span aria-hidden>·</span>
                <span>{job.jobWorkType.name}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="num">{formatDate(job.jobDate)}</span>
            {job.expectedReturnDate && (
              <>
                <span aria-hidden>·</span>
                <span className={cn("num", job.overdue && "font-medium text-danger")}>Return by {formatDate(job.expectedReturnDate)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {canReturn && (
            <Button asChild className="max-sm:flex-1">
              <Link href={`/returns/new?job=${job.id}`}>
                <PackageCheck /> Record return
              </Link>
            </Button>
          )}
          {!cancelled && (m.outstandingPaise > 0 || liveReturns.length > 0) && (
            <Button asChild variant={canReturn ? "secondary" : "primary"} className="max-sm:flex-1">
              <Link href={payHref}>
                <Wallet /> Record payment{m.outstandingPaise > 0 ? ` · ${formatINR(m.outstandingPaise)}` : ""}
              </Link>
            </Button>
          )}
          {canIssue && (
            <Button variant="secondary" onClick={() => setDispatchOpen(true)}>
              <Truck /> Issue material
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href={`/jobs/${job.id}/print`}>
              <Printer /> Print
            </Link>
          </Button>
          {!cancelled && (
            <Button asChild variant="ghost">
              <Link href={`/jobs/${job.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          {!cancelled && (
            <Menu>
              <MenuItem icon={<Images />} onSelect={() => setTab("photos")}>
                Design photos
              </MenuItem>
              <MenuItem icon={<ReceiptText />} onSelect={() => setTab("ledger")}>
                Challan ledger
              </MenuItem>
              <MenuItem danger icon={<Ban />} onSelect={() => setCancelOpen(true)}>
                Cancel {L.job.toLowerCase()}
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {cancelled && (
        <Notice tone="danger" icon={Ban}>
          <span className="font-medium text-fg">Cancelled on {formatDate(job.cancelledAt)}.</span>
          {job.cancelReason && <span className="text-fg-muted"> {job.cancelReason}</span>}
          {t.pending > 0 && (
            <div className="mt-0.5 text-fg-muted">
              {formatQty(t.pending)} {u} still with the worker. You can still record its return.
            </div>
          )}
        </Notice>
      )}
      {job.status === "DRAFT" && (
        <Notice
          tone="accent"
          icon={Truck}
          action={
            <Button size="sm" onClick={() => setDispatchOpen(true)}>
              Issue {formatQty(t.notYetSent)} {u}
            </Button>
          }
        >
          <span className="font-medium text-fg">Draft</span>
          <span className="text-fg-muted"> · Material not issued yet. Issue it when you hand it over.</span>
        </Notice>
      )}
      {t.excess > 0 && (
        <Notice tone="danger" icon={AlertTriangle}>
          <span className="font-medium text-fg">
            {formatQty(t.excess)} {u} more accounted for than issued.
          </span>
          <span className="text-fg-muted"> Check the returns below – this was recorded as an approved exception.</span>
        </Notice>
      )}

      <MetricStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Issued" value={`${formatQty(t.sent)} ${u}`} sub={t.notYetSent > 0 ? `${formatQty(t.notYetSent)} not issued yet` : `of ${formatQty(t.quantity)} ordered`} />
        <Metric label="Good returned" value={`${formatQty(t.ok)} ${u}`} sub={t.exceptions > 0 ? <span className="text-danger">+{formatQty(t.exceptions)} dmg/rej/lost</span> : `${liveReturns.length} return${liveReturns.length === 1 ? "" : "s"}`} />
        <Metric label="Pending" value={`${formatQty(t.pending)} ${u}`} tone={t.pending > 0 ? "warning" : "fg"} sub={t.pending > 0 ? `${job.daysOut} days outside` : "Nothing outside"} />
        <Metric label="Work value" value={formatINR(m.valuePaise)} sub={`of ${formatINR(t.expectedValuePaise)} issued`} />
        <Metric label="Paid" value={formatINR(m.paidPaise)} tone={m.paidPaise > 0 ? "success" : "fg"} sub={`${job.subBills.filter((b) => !b.voidedAt).length} voucher(s)`} />
        {m.advancePaise > 0 ? (
          <Metric label="Advance" value={formatINR(m.advancePaise)} sub="Paid more than work value" />
        ) : (
          <Metric label="Outstanding" value={formatINR(m.outstandingPaise)} tone={m.outstandingPaise > 0 ? "danger" : "fg"} sub={termsLabel(job.terms.policy, job.terms.days)} />
        )}
      </MetricStrip>

      <div>
        <Tabs
          className="mb-4"
          value={tab}
          onChange={setTab}
          items={TABS.map((x) => ({ value: x, label: TAB_LABEL[x], count: x === "returns" ? liveReturns.length : x === "photos" ? photoCount || undefined : undefined }))}
        />
        {tab === "overview" && <Overview job={job} />}
        {tab === "returns" && <ReturnsTab job={job} onVoid={(r) => setVoiding({ type: "return", id: r.id, label: `return ${r.returnNumber}` })} />}
        {tab === "ledger" && <LedgerTab job={job} />}
        {tab === "photos" && <PhotosTab job={job} />}
        {tab === "timeline" && <TimelineTab job={job} onVoid={cancelled ? undefined : onVoidEvent} />}
      </div>

      <DispatchDialog job={job} open={dispatchOpen} onOpenChange={setDispatchOpen} />
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${job.jobNumber}?`}
        description={`The ${L.job.toLowerCase()} and its history are kept. It will be marked Cancelled.`}
        confirmLabel={`Cancel ${L.job.toLowerCase()}`}
        loading={cancel.isPending}
        onConfirm={(r) => cancel.mutate(r)}
      >
        {t.pending > 0 && (
          <p className="mb-4 rounded-md bg-warning-subtle px-3 py-2 text-[13px] text-fg-2">
            {formatQty(t.pending)} {u} is still with {job.client.name}. It keeps showing as pending until you record its return.
          </p>
        )}
      </ReasonDialog>
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title={`Void ${voiding?.label ?? "entry"}?`}
        description="The entry stays in history marked VOID. Quantities, values and payment status are recalculated."
        confirmLabel="Void entry"
        loading={voidEntry.isPending}
        onConfirm={(r) => voidEntry.mutate(r)}
      />
    </div>
  );
}

// ───────────────────────── Overview ─────────────────────────

function Overview({ job }: { job: JobDetail }) {
  const t = job.totals;
  const m = job.money;
  const termsSource = job.paymentPolicy ? "Set on this challan" : "Worker’s / business terms";
  return (
    <div className="space-y-6">
      <Section title="Material reconciliation" description="Issued − Good − Damaged − Rejected − Lost = Pending">
        <Card className="overflow-hidden">
          <TableWrap className="max-sm:hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Design / material</th>
                  <th className="r">Rate</th>
                  <th className="r">Issued</th>
                  <th className="r">Good</th>
                  <th className="r">Damaged</th>
                  <th className="r">Rejected</th>
                  <th className="r">Lost</th>
                  <th className="r">Pending</th>
                  <th className="r">Returned value</th>
                </tr>
              </thead>
              <tbody>
                {job.items.map((i) => (
                  <tr key={i.id} className={cn(i.excess > 0 && "bg-danger-subtle")}>
                    <td className="min-w-44">
                      <div className="font-medium">{i.designName}</div>
                      <div className="text-xs text-fg-muted">
                        {i.material ? `${i.material.code} · ${i.material.name}` : "No material linked"}
                        {i.jobWorkType && ` · ${i.jobWorkType.name}`}
                      </div>
                      <FlowBar className="mt-1.5 max-w-32" sent={i.sent} ok={i.ok} exceptions={i.exceptions} pending={i.pending} />
                    </td>
                    <td className="r text-fg-muted">
                      {formatINR(i.ratePaise)}
                      <div className="text-xs">/{i.unit}</div>
                    </td>
                    <td className="r">
                      {formatQty(i.sent)} <span className="text-xs text-fg-muted">{i.unit}</span>
                      {i.additionalSent > 0 && <div className="text-xs text-fg-muted">incl. {formatQty(i.additionalSent)} additional</div>}
                      {i.reworkSent > 0 && <div className="text-xs text-fg-muted">incl. {formatQty(i.reworkSent)} rework</div>}
                      {i.notYetSent > 0 && <div className="text-xs text-accent">{formatQty(i.notYetSent)} not issued</div>}
                    </td>
                    <td className="r">{formatQty(i.ok)}</td>
                    <td className={cn("r", i.damaged > 0 ? "text-danger" : "text-fg-faint")}>{formatQty(i.damaged)}</td>
                    <td className={cn("r", i.rejected > 0 ? "text-danger" : "text-fg-faint")}>{formatQty(i.rejected)}</td>
                    <td className={cn("r", i.lost > 0 ? "text-danger" : "text-fg-faint")}>{formatQty(i.lost)}</td>
                    <td className="r">
                      {i.excess > 0 ? (
                        <span className="font-semibold text-danger" title="More accounted for than issued">
                          −{formatQty(i.excess)} over
                        </span>
                      ) : i.pending > 0 ? (
                        <span className="font-medium text-warning">{formatQty(i.pending)}</span>
                      ) : (
                        <span className="text-fg-muted">0 ✓</span>
                      )}
                    </td>
                    <td className="r">{formatINR(i.completedValuePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className="r">{formatQty(t.sent)}</td>
                  <td className="r">{formatQty(t.ok)}</td>
                  <td className="r">{formatQty(t.damaged)}</td>
                  <td className="r">{formatQty(t.rejected)}</td>
                  <td className="r">{formatQty(t.lost)}</td>
                  <td className={cn("r", t.pending > 0 && "text-warning", t.excess > 0 && "text-danger")}>{t.excess > 0 ? `${formatQty(t.pending)} (+${formatQty(t.excess)} over)` : formatQty(t.pending)}</td>
                  <td className="r">{formatINR(t.completedValuePaise)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
          <MobileList className="sm:hidden">
            {job.items.map((i) => (
              <MobileListItem key={i.id} className={cn(i.excess > 0 && "bg-danger-subtle")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">{i.designName}</span>
                  <span className="num text-xs text-fg-muted">
                    {formatINR(i.ratePaise)}/{i.unit}
                  </span>
                </div>
                <div className="truncate text-xs text-fg-muted">{i.material ? `${i.material.code} · ${i.material.name}` : "No material linked"}</div>
                <KeyValues
                  className="mt-2"
                  items={[
                    { label: `Issued (${i.unit})`, value: formatQty(i.sent) },
                    { label: "Good", value: formatQty(i.ok) },
                    { label: "Pending", value: i.excess > 0 ? `−${formatQty(i.excess)} over` : formatQty(i.pending), tone: i.excess > 0 ? "danger" : i.pending > 0 ? "warning" : "muted" },
                    { label: "Damaged", value: formatQty(i.damaged), tone: i.damaged ? "danger" : "muted" },
                    { label: "Rejected", value: formatQty(i.rejected), tone: i.rejected ? "danger" : "muted" },
                    { label: "Lost", value: formatQty(i.lost), tone: i.lost ? "danger" : "muted" },
                  ]}
                />
                <FlowBar className="mt-2" sent={i.sent} ok={i.ok} exceptions={i.exceptions} pending={i.pending} />
              </MobileListItem>
            ))}
          </MobileList>
        </Card>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Money">
          <Card>
            <dl className="divide-y divide-border text-[13px]">
              {[
                { label: "Issued work value", sub: "Ordered quantity × challan rate", value: formatINR(t.expectedValuePaise) },
                { label: "Returned work value", sub: "Σ returns at their own rates", value: formatINR(m.valuePaise) },
                { label: "Paid", value: formatINR(m.paidPaise), cls: "text-success" },
                m.advancePaise > 0
                  ? { label: "Advance", sub: "Paid more than the returned value", value: formatINR(m.advancePaise), cls: "text-accent" }
                  : { label: "Outstanding", value: formatINR(m.outstandingPaise), cls: m.outstandingPaise ? "text-danger" : "" },
              ].map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <dt>
                    <div className="text-fg-2">{r.label}</div>
                    {r.sub && <div className="text-xs text-fg-muted">{r.sub}</div>}
                  </dt>
                  <dd className={cn("num text-[15px] font-semibold", r.cls)}>{r.value}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <dt>
                  <div className="text-fg-2">Payment terms</div>
                  <div className="text-xs text-fg-muted">{termsSource}</div>
                </dt>
                <dd className="text-right font-medium">{termsLabel(job.terms.policy, job.terms.days)}</dd>
              </div>
            </dl>
          </Card>
        </Section>

        <div className="space-y-6">
          {job.mainBill && (
            <Link
              href={`/bills/main/${job.mainBill.id}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors duration-100",
                job.mainBill.cancelledAt ? "border-border hover:bg-surface-2" : "border-success/30 bg-success-subtle hover:brightness-[0.98]",
              )}
            >
              <FileCheck2 className={cn("size-4 shrink-0", job.mainBill.cancelledAt ? "text-fg-faint" : "text-success")} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">
                  {L.mainBill} {job.mainBill.billNumber}
                </div>
                <div className="text-xs text-fg-muted">{job.mainBill.cancelledAt ? "Cancelled – challan is no longer fully paid" : `Challan fully paid · ${formatDate(job.mainBill.date)}`}</div>
              </div>
              <div className="num text-[13px] font-semibold">{formatINR(job.mainBill.totalPaise)}</div>
            </Link>
          )}
          <Section
            title={L.subBills}
            action={
              job.status !== "CANCELLED" && (
                <Link href={`/bills/new?jobId=${job.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
                  Record payment <ArrowRight className="size-3" />
                </Link>
              )
            }
          >
            {job.subBills.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong px-4 py-4 text-[13px] text-fg-muted">
                {m.outstandingPaise > 0 ? `${formatINR(m.outstandingPaise)} of returned work is waiting to be paid.` : "Nothing paid yet. Work can be paid once it comes back."}
              </p>
            ) : (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {job.subBills.map((b) => (
                    <li key={b.id}>
                      <Link href={`/bills/sub/${b.id}`} className={cn("flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-100 hover:bg-surface-2", b.voidedAt && "text-fg-muted")}>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium">{b.billNumber}</div>
                          <div className="num truncate text-xs text-fg-muted">
                            {formatDate(b.date)}
                            {b.returnNumber && ` · for ${b.returnNumber}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn("num text-[13px] font-medium", b.voidedAt && "line-through decoration-fg-faint")}>{formatINR(b.amountPaise)}</div>
                          <BillStatusBadge state={b.voidedAt ? "voided" : "paid"} />
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
    </div>
  );
}

// ───────────────────────── Returns ─────────────────────────

function Thumb({ id, alt }: { id: string | null; alt: string }) {
  if (!id)
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-faint" aria-hidden>
        <Camera className="size-4" />
      </span>
    );
  return (
    <Link href={`/gallery?photo=${id}`} onClick={(e) => e.stopPropagation()} className="shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/photos/${id}/thumb`} alt={alt} loading="lazy" className="size-10 rounded-md bg-surface-2 object-cover ring-1 ring-border" />
    </Link>
  );
}

function ReturnPay({ r }: { r: ReturnRow }) {
  if (r.voidedAt) return <StatusBadge tone="neutral">VOID</StatusBadge>;
  if (!r.payment) return <span className="text-xs text-fg-faint">—</span>;
  return (
    <div>
      <PayStatusBadge status={r.payment.status} overdueDays={r.payment.overdueDays} />
      {r.payment.outstandingPaise > 0 && r.payment.dueDate && <div className="num mt-0.5 text-xs text-fg-muted">due {formatDate(r.payment.dueDate)}</div>}
    </div>
  );
}

function ReturnsTab({ job, onVoid }: { job: JobDetail; onVoid: (r: ReturnRow) => void }) {
  const rows = job.returns;
  if (!rows.length)
    return (
      <Card>
        <EmptyState
          icon={PackageCheck}
          title="No returns yet"
          action={
            job.totals.pending > 0 && (
              <Button asChild>
                <Link href={`/returns/new?job=${job.id}`}>
                  <PackageCheck /> Record return
                </Link>
              </Button>
            )
          }
        >
          Each {L.return.toLowerCase()} records good, damaged, rejected and lost quantity with its own rate, time and photos.
        </EmptyState>
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <TableWrap className="max-sm:hidden">
        <table className="ledger">
          <thead>
            <tr>
              <th />
              <th>Return</th>
              <th>Received</th>
              <th className="r">Good</th>
              <th className="r">Dmg / Rej / Lost</th>
              <th className="r">Rate</th>
              <th className="r">Value</th>
              <th>Payment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn(r.voidedAt && "text-fg-muted")}>
                <td className="w-12">
                  <Thumb id={r.coverPhotoId} alt={`${r.returnNumber} photo`} />
                </td>
                <td className="whitespace-nowrap">
                  <Link href={`/returns/${r.id}`} className={cn("font-medium hover:text-accent", r.voidedAt && "line-through")}>
                    {r.returnNumber}
                  </Link>
                  <div className="text-xs text-fg-muted">
                    {r.photoCount > 0 ? `${r.photoCount} photo${r.photoCount === 1 ? "" : "s"}` : "No photos"}
                    {r.enteredBy && ` · ${r.enteredBy}`}
                  </div>
                </td>
                <td className="num whitespace-nowrap">
                  {formatDate(r.date)}
                  <div className="text-xs text-fg-muted">{formatTime(r.receivedAt)}</div>
                </td>
                <td className="r">
                  {formatQty(r.okQty)} <span className="text-xs text-fg-muted">{r.unit}</span>
                </td>
                <td className="r">
                  {r.damagedQty + r.rejectedQty + r.lostQty > 0 ? (
                    <span className="text-danger">
                      {formatQty(r.damagedQty)} / {formatQty(r.rejectedQty)} / {formatQty(r.lostQty)}
                    </span>
                  ) : (
                    <span className="text-fg-faint">—</span>
                  )}
                </td>
                <td className="r">{r.ratePaise != null ? formatINR(r.ratePaise) : <span className="text-xs text-fg-muted">Mixed</span>}</td>
                <td className={cn("r font-medium", r.voidedAt && "line-through")}>{formatINR(r.valuePaise)}</td>
                <td>
                  <ReturnPay r={r} />
                  {r.voidedAt && r.voidReason && <div className="max-w-40 truncate text-xs text-fg-muted" title={r.voidReason}>{r.voidReason}</div>}
                </td>
                <td className="whitespace-nowrap text-right">
                  {!r.voidedAt && r.payment && r.payment.outstandingPaise > 0 && (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/bills/new?jobId=${job.id}&returnId=${r.id}`}>Pay</Link>
                    </Button>
                  )}
                  {!r.voidedAt && job.status !== "CANCELLED" && (
                    <Button size="sm" variant="danger-ghost" onClick={() => onVoid(r)}>
                      Void
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <MobileList className="sm:hidden">
        {rows.map((r) => (
          <li key={r.id} className={cn("px-4 py-3", r.voidedAt && "text-fg-muted")}>
            <Link href={`/returns/${r.id}`} className="flex items-start gap-3">
              <Thumb id={r.coverPhotoId} alt={`${r.returnNumber} photo`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-[13px] font-semibold", r.voidedAt && "line-through")}>{r.returnNumber}</span>
                  <span className="num text-[13px] font-medium">{formatINR(r.valuePaise)}</span>
                </div>
                <div className="num text-xs text-fg-muted">
                  {formatDate(r.date)} · {formatTime(r.receivedAt)} · {formatQty(r.okQty)} {r.unit} good
                  {r.ratePaise != null && ` @ ${formatINR(r.ratePaise)}`}
                </div>
                <div className="mt-1.5">
                  <ReturnPay r={r} />
                </div>
              </div>
            </Link>
            {!r.voidedAt && r.payment && r.payment.outstandingPaise > 0 && (
              <Button asChild size="md" variant="secondary" className="mt-2 w-full">
                <Link href={`/bills/new?jobId=${job.id}&returnId=${r.id}`}>
                  <Wallet /> Pay {formatINR(r.payment.outstandingPaise)}
                </Link>
              </Button>
            )}
          </li>
        ))}
      </MobileList>
    </Card>
  );
}

// ───────────────────────── Ledger ─────────────────────────

function LedgerTab({ job }: { job: JobDetail }) {
  const q = useJobLedger(job.id);
  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={5} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const l = q.data;
  return (
    <div className="space-y-4">
      <MetricStrip className="grid-cols-2 sm:grid-cols-4">
        <Metric label="Issued work value" value={formatINR(l.issuedValuePaise)} />
        <Metric label="Work done (debit)" value={formatINR(l.totals.debitPaise)} />
        <Metric label="Paid (credit)" value={formatINR(l.totals.creditPaise)} tone="success" />
        <Metric label={l.totals.closingPaise < 0 ? "Advance" : "Balance payable"} value={formatINR(Math.abs(l.totals.closingPaise))} tone={l.totals.closingPaise > 0 ? "danger" : "fg"} />
      </MetricStrip>
      <Card className="overflow-hidden">
        {l.rows.length === 0 ? (
          <EmptyState icon={ReceiptText} title="No entries yet">
            Returns add job work value (debit); payment vouchers reduce it (credit).
          </EmptyState>
        ) : (
          <LedgerTable openingPaise={l.openingPaise} rows={l.rows} totals={l.totals} />
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Photos ─────────────────────────

function PhotosTab({ job }: { job: JobDetail }) {
  return (
    <Section title="Design photos" description="From every return on this challan">
      <PhotoGrid filter={{ jobId: job.id }} galleryHref={`/gallery?jobId=${job.id}`} />
    </Section>
  );
}

// ───────────────────────── Timeline ─────────────────────────

function TimelineTab({ job, onVoid }: { job: JobDetail; onVoid?: (e: Extract<TimelineEvent, { type: "dispatch" | "return" }>) => void }) {
  const [audit, setAudit] = useState(false);
  const auditCount = job.timeline.filter((e) => e.type === "audit").length;
  return (
    <Section
      title="Challan timeline"
      description="Every issue, return, payment and settlement with its exact time"
      action={
        auditCount > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" className="size-4 accent-[var(--accent-solid)]" checked={audit} onChange={(e) => setAudit(e.target.checked)} />
            Show history entries ({auditCount})
          </label>
        )
      }
    >
      <div className="pt-2">
        <Timeline events={job.timeline} onVoid={onVoid} unit={job.unit} jobId={job.id} showAudit={audit} />
      </div>
    </Section>
  );
}

