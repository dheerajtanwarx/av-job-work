"use client";

import { formatDate, formatINR, formatQty, L, OPEN_JOB_STATUSES, PAYMENT_METHOD_LABEL, type ClientSummary } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Boxes, Briefcase, Eye, Pencil, Phone, Plus, Printer, ReceiptText, StickyNote, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ClientDialog } from "@/components/forms/master-dialogs";
import { termsLabel } from "@/components/forms/payment-terms";
import { JobsTable } from "@/components/jobs/jobs-table";
import { LedgerTable } from "@/components/jobs/ledger-table";
import { PhotoGrid } from "@/components/jobs/photo-grid";
import { BillStatusBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, Section, TableWrap } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Menu, MenuItem } from "@/components/ui/menu";
import { EmptyState, ErrorBlock, KeyValues, LoadingBlock, Metric, MetricStrip, Notice, PageSkeleton, StatsSkeleton } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { DocThumb, WorkerAvatar } from "@/components/workers/worker-docs";
import { WorkerPreviewDialog } from "@/components/workers/worker-sheet";
import { api } from "@/lib/api";
import { useClientLedger, useClientMaterial, useClientPerformance, useClientSummary, useSettings } from "@/lib/queries";
import { useIsManager } from "@/lib/returns";
import { workerDocDisplay } from "@/lib/worker-docs";
import { EditedTag } from "@/components/ui/edited";
import { cn } from "@/lib/utils";

const TABS = ["overview", "material", "financial", "challans", "payments", "ledger", "photos", "performance"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  material: "Material",
  financial: "Financial",
  challans: L.jobs,
  payments: "Payments",
  ledger: "Ledger",
  photos: "Design photos",
  performance: "Performance",
};

const days = (n: number | null | undefined) => (n == null ? "—" : `${n} day${n === 1 ? "" : "s"}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const q = useClientSummary(id);
  const perf = useClientPerformance(id);
  const settings = useSettings();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [edit, setEdit] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const isManager = useIsManager();

  const archive = useMutation({
    mutationFn: (isActive: boolean) => api.put(`/clients/${id}`, { isActive }),
    onSuccess: (_d, isActive) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client"] });
      toast.success(isActive ? "Worker reactivated" : "Worker archived. History is kept.");
      setArchiveOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <PageSkeleton rows={6} />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const { client: c, totals: t } = q.data;
  const advance = Math.max(0, t.paidPaise - t.completedValuePaise);
  const terms = c.paymentPolicy ? termsLabel(c.paymentPolicy, c.paymentDays) : settings.data ? `Default (${termsLabel(settings.data.defaultPaymentPolicy, settings.data.defaultPaymentDays)})` : "Business default";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-start gap-4">
          {c.photoId ? (
            <a href={workerDocDisplay(c.photoId)} target="_blank" rel="noreferrer" className="shrink-0">
              <WorkerAvatar photoId={c.photoId} name={c.name} className="size-16" />
            </a>
          ) : (
            <WorkerAvatar photoId={null} name={c.name} className="size-16" />
          )}
          <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/clients" className="hover:text-fg">
              {L.clients}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{c.name}</h1>
            <span className="num text-[13px] text-fg-muted">{c.workerCode}</span>
            {!c.isActive && <StatusBadge tone="neutral">Archived</StatusBadge>}
            <EditedTag edited={c.edited} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-fg-muted">
            {[
              c.businessName && <span key="b">{c.businessName}</span>,
              c.phone && (
                <a key="p" href={`tel:${c.phone}`} className="num inline-flex items-center gap-1 hover:text-fg">
                  <Phone className="size-3" /> {c.phone}
                </a>
              ),
              c.alternatePhone && (
                <a key="p2" href={`tel:${c.alternatePhone}`} className="num hover:text-fg">
                  {c.alternatePhone}
                </a>
              ),
              c.email && (
                <a key="e" href={`mailto:${c.email}`} className="hover:text-fg">
                  {c.email}
                </a>
              ),
              c.gstin && (
                <span key="g" className="num">
                  GSTIN {c.gstin}
                </span>
              ),
              c.pan && (
                <span key="pan" className="num">
                  PAN {c.pan}
                </span>
              ),
            ]
              .filter(Boolean)
              .flatMap((el, i) => (i ? [<span key={`d${i}`} aria-hidden>·</span>, el] : [el]))}
          </div>
          {c.workItems && <div className="mt-0.5 text-[13px] text-fg-2">Work: {c.workItems}</div>}
          {c.address && <div className="mt-0.5 text-xs whitespace-pre-line text-fg-muted">{c.address}</div>}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {c.isActive && (
            <Button asChild className="max-sm:flex-1">
              <Link href={`/jobs/new?clientId=${c.id}`}>
                <Plus /> New {L.job.toLowerCase()}
              </Link>
            </Button>
          )}
          {t.toPayPaise > 0 && (
            <Button asChild variant="secondary" className="max-sm:flex-1">
              <Link href={`/bills/new?clientId=${c.id}`}>
                <Wallet /> Pay {formatINR(t.toPayPaise)}
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={() => setEdit(true)}>
            <Pencil /> Edit
          </Button>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)}>
            <Eye /> Print preview
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/clients/${c.id}/print`}>
              <Printer /> Print
            </Link>
          </Button>
          <Menu>
            <MenuItem icon={c.isActive ? <Archive /> : <ArchiveRestore />} danger={c.isActive} onSelect={() => setArchiveOpen(true)}>
              {c.isActive ? "Archive worker" : "Reactivate worker"}
            </MenuItem>
          </Menu>
        </div>
      </div>

      {c.notes && (
        <Notice icon={StickyNote}>
          <span className="whitespace-pre-wrap">{c.notes}</span>
        </Notice>
      )}

      <div>
        <Tabs
          className="mb-4"
          value={tab}
          onChange={setTab}
          items={TABS.map((x) => ({ value: x, label: TAB_LABEL[x], count: x === "challans" ? q.data.jobs.length : x === "payments" ? q.data.subBills.length : undefined }))}
        />
        {tab === "overview" && <Overview data={q.data} terms={terms} avgCompletion={perf.data?.avgCompletionDays} onTab={setTab} isManager={isManager} onEdit={() => setEdit(true)} />}
        {tab === "material" && <MaterialTab clientId={id} />}
        {tab === "financial" && <FinancialTab data={q.data} advance={advance} terms={terms} />}
        {tab === "challans" && <Card className="overflow-hidden">{q.data.jobs.length ? <JobsTable rows={q.data.jobs} hideClient /> : <EmptyState icon={Briefcase} title={`No ${L.jobs.toLowerCase()} yet`} />}</Card>}
        {tab === "payments" && <PaymentsTab data={q.data} />}
        {tab === "ledger" && <LedgerTab clientId={id} />}
        {tab === "photos" && <PhotoGrid filter={{ clientId: id }} galleryHref={`/gallery?clientId=${id}`} />}
        {tab === "performance" && <PerformanceTab q={perf} />}
      </div>

      <ClientDialog open={edit} onOpenChange={setEdit} client={c} />
      <WorkerPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} printHref={`/clients/${c.id}/print`} data={q.data} terms={terms} biz={settings.data} showAadhaar={isManager} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={c.isActive ? `Archive ${c.name}?` : `Reactivate ${c.name}?`}
        description={c.isActive ? "The worker is hidden when creating challans. Nothing is deleted – challans, returns and payments stay." : "The worker will appear again when creating challans."}
        confirmLabel={c.isActive ? "Archive" : "Reactivate"}
        danger={c.isActive}
        loading={archive.isPending}
        onConfirm={() => archive.mutate(!c.isActive)}
      >
        {c.isActive && t.pending > 0 && (
          <p className="rounded-md bg-warning-subtle px-3 py-2 text-[13px] text-fg-2">{formatQty(t.pending)} qty is still with this worker. It stays pending until returned.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function Overview({
  data,
  terms,
  avgCompletion,
  onTab,
  isManager,
  onEdit,
}: {
  data: ClientSummary;
  terms: string;
  avgCompletion: number | null | undefined;
  onTab: (t: Tab) => void;
  isManager: boolean;
  onEdit: () => void;
}) {
  const t = data.totals;
  const c = data.client;
  const open = data.jobs.filter((j) => OPEN_JOB_STATUSES.includes(j.status) && j.status !== "DRAFT");
  return (
    <div className="space-y-6">
      <MetricStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label={`Active ${L.jobs.toLowerCase()}`} value={formatQty(t.activeJobs)} sub={`${t.completedJobs} completed · ${t.jobs} total`} />
        <Metric label="Pending material" value={formatQty(t.pending)} tone={t.pending ? "warning" : "fg"} sub={`${formatQty(t.sent)} issued · ${formatQty(t.received)} back`} />
        <Metric label="Outstanding" value={formatINR(t.toPayPaise)} tone={t.toPayPaise ? "danger" : "fg"} sub={`${formatINR(t.paidPaise)} paid so far`} />
        <Metric label="Avg completion" value={avgCompletion == null ? "—" : `${avgCompletion} d`} sub="Challan date → last return" />
        <Metric label="Payment terms" value={<span className="text-[15px]">{terms}</span>} />
      </MetricStrip>
      <Section
        title="Aadhaar photos"
        action={
          isManager && (
            <button type="button" onClick={onEdit} className="text-xs font-medium text-fg-muted hover:text-fg">
              {c.aadhaarFrontId || c.aadhaarBackId ? "Change" : "Add"}
            </button>
          )
        }
      >
        <div className="flex flex-wrap gap-3">
          <DocThumb id={c.aadhaarFrontId} label="Front" locked={!isManager} />
          <DocThumb id={c.aadhaarBackId} label="Back" locked={!isManager} />
        </div>
      </Section>
      <Section
        title={`Active ${L.jobs.toLowerCase()}`}
        action={
          data.jobs.length > open.length && (
            <button className="text-xs font-medium text-fg-muted hover:text-fg" onClick={() => onTab("challans")}>
              All {data.jobs.length} →
            </button>
          )
        }
      >
        <Card className="overflow-hidden">{open.length ? <JobsTable rows={open} hideClient /> : <EmptyState icon={Briefcase} title="Nothing outside right now" />}</Card>
      </Section>
      <Section title="Recent activity">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {data.timeline.slice(0, 12).map((e, i) => (
              <li key={i}>
                <Link href={e.href} className="flex min-h-11 items-center gap-3 px-4 py-2 text-[13px] transition-colors duration-100 hover:bg-surface-2">
                  <span className="num w-14 shrink-0 text-xs text-fg-muted">{formatDate(e.date).slice(0, 6)}</span>
                  <span className={cn("size-1.5 shrink-0 rounded-full", { job: "bg-accent", return: "bg-success", payment: "bg-success", main_bill: "bg-success", completed: "bg-success", cancelled: "bg-danger", void: "bg-fg-faint" }[e.type] ?? "bg-fg-faint")} />
                  <span className={cn("min-w-0 flex-1 text-fg-2", e.type === "void" && "text-fg-muted line-through")}>{e.text}</span>
                  {e.amountPaise !== undefined && <span className="num font-medium">{formatINR(e.amountPaise)}</span>}
                </Link>
              </li>
            ))}
            {data.timeline.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-fg-muted">Nothing yet.</li>}
          </ul>
        </Card>
      </Section>
    </div>
  );
}

function MaterialTab({ clientId }: { clientId: string }) {
  const q = useClientMaterial(clientId);
  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={4} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length)
    return (
      <Card>
        <EmptyState icon={Boxes} title="No material issued yet" />
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <TableWrap className="max-sm:hidden">
        <table className="ledger">
          <thead>
            <tr>
              <th>{L.material}</th>
              <th className="r">Issued</th>
              <th className="r">Returned</th>
              <th className="r">Damaged</th>
              <th className="r">Rejected</th>
              <th className="r">Lost</th>
              <th className="r">Pending</th>
              <th className="r">{L.jobs}</th>
              <th>Oldest issue</th>
              <th className="r">Days outside</th>
              <th className="r">Value outside</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((r) => (
              <tr key={r.materialId ?? r.materialName}>
                <td className="min-w-40 font-medium">{r.materialId ? <Link href={`/materials/${r.materialId}`} className="hover:text-accent">{r.materialName}</Link> : r.materialName}</td>
                <td className="r">
                  {formatQty(r.issued)} <span className="text-xs text-fg-muted">{r.unit}</span>
                </td>
                <td className="r">{formatQty(r.returned)}</td>
                <td className={cn("r", r.damaged ? "text-danger" : "text-fg-faint")}>{formatQty(r.damaged)}</td>
                <td className={cn("r", r.rejected ? "text-danger" : "text-fg-faint")}>{formatQty(r.rejected)}</td>
                <td className={cn("r", r.lost ? "text-danger" : "text-fg-faint")}>{formatQty(r.lost)}</td>
                <td className={cn("r font-medium", r.pending ? "text-warning" : "text-fg-muted")}>{formatQty(r.pending)}</td>
                <td className="r">{r.challans || "—"}</td>
                <td className="num whitespace-nowrap">{r.oldestIssueDate ? formatDate(r.oldestIssueDate) : "—"}</td>
                <td className={cn("r", r.daysOutside > 15 && "text-danger")}>{r.pending ? r.daysOutside : "—"}</td>
                <td className="r">{r.valuePaise ? formatINR(r.valuePaise) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <MobileList className="sm:hidden">
        {q.data.map((r) => (
          <MobileListItem key={r.materialId ?? r.materialName} href={r.materialId ? `/materials/${r.materialId}` : undefined}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{r.materialName}</span>
              {r.pending > 0 && <span className="num shrink-0 text-xs text-fg-muted">{r.daysOutside} days out</span>}
            </div>
            <KeyValues
              className="mt-2"
              items={[
                { label: `Issued (${r.unit})`, value: formatQty(r.issued) },
                { label: "Returned", value: formatQty(r.returned) },
                { label: "Pending", value: formatQty(r.pending), tone: r.pending ? "warning" : "muted" },
                { label: "Dmg / Rej", value: `${formatQty(r.damaged)} / ${formatQty(r.rejected)}`, tone: r.damaged + r.rejected ? "danger" : "muted" },
                { label: "Lost", value: formatQty(r.lost), tone: r.lost ? "danger" : "muted" },
                { label: "Value out", value: formatINR(r.valuePaise) },
              ]}
            />
          </MobileListItem>
        ))}
      </MobileList>
    </Card>
  );
}

function FinancialTab({ data, advance, terms }: { data: ClientSummary; advance: number; terms: string }) {
  const t = data.totals;
  const issued = data.jobs.filter((j) => j.status !== "CANCELLED").reduce((s, j) => s + j.totals.expectedValuePaise, 0);
  return (
    <div className="space-y-6">
      <MetricStrip className="grid-cols-2 lg:grid-cols-4">
        <Metric label="Total job work" value={formatINR(t.completedValuePaise)} sub="Value of all returned work" />
        <Metric label="Paid" value={formatINR(t.paidPaise)} tone="success" sub={`${data.subBills.filter((b) => !b.voidedAt).length} vouchers`} />
        {advance > 0 ? <Metric label="Advance" value={formatINR(advance)} sub="Paid ahead of work" /> : <Metric label="Outstanding" value={formatINR(t.toPayPaise)} tone={t.toPayPaise ? "danger" : "fg"} />}
        <Metric label="Issued work value" value={formatINR(issued)} sub="All challans, at challan rates" />
      </MetricStrip>
      <Card>
        <dl className="divide-y divide-border text-[13px]">
          <div className="flex justify-between gap-3 px-4 py-2.5">
            <dt className="text-fg-muted">Payment terms</dt>
            <dd className="font-medium">{terms}</dd>
          </div>
          <div className="flex justify-between gap-3 px-4 py-2.5">
            <dt className="text-fg-muted">{L.mainBills}</dt>
            <dd className="font-medium">{data.mainBills.filter((b) => !b.cancelledAt).length}</dd>
          </div>
        </dl>
      </Card>
      {data.mainBills.length > 0 && (
        <Section title={L.mainBills}>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {data.mainBills.map((b) => (
                <li key={b.id}>
                  <Link href={`/bills/main/${b.id}`} className={cn("flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2", b.cancelledAt && "text-fg-muted")}>
                    <div>
                      <div className="text-[13px] font-medium">{b.billNumber}</div>
                      <div className="num text-xs text-fg-muted">
                        {formatDate(b.date)} · {b.job.jobNumber}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-[13px] font-medium">{formatINR(b.totalPaise)}</div>
                      <BillStatusBadge state={b.cancelledAt ? "cancelled" : "settled"} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </div>
  );
}

function PaymentsTab({ data }: { data: ClientSummary }) {
  if (!data.subBills.length)
    return (
      <Card>
        <EmptyState icon={ReceiptText} title={`No ${L.subBills.toLowerCase()} yet`} />
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <TableWrap className="max-sm:hidden">
        <table className="ledger">
          <thead>
            <tr>
              <th>Voucher</th>
              <th>Date</th>
              <th>{L.job}</th>
              <th>Return</th>
              <th>Method</th>
              <th className="r">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.subBills.map((b) => (
              <tr key={b.id} className={cn(b.voidedAt && "text-fg-muted")}>
                <td>
                  <Link href={`/bills/sub/${b.id}`} className="font-medium hover:text-accent">
                    {b.billNumber}
                  </Link>
                </td>
                <td className="num whitespace-nowrap">{formatDate(b.date)}</td>
                <td>
                  <Link href={`/jobs/${b.job.id}`} className="hover:text-accent">
                    {b.job.jobNumber}
                  </Link>
                </td>
                <td>{b.returnNumber ?? "—"}</td>
                <td>
                  {PAYMENT_METHOD_LABEL[b.method]}
                  {b.reference && <div className="text-xs text-fg-muted">{b.reference}</div>}
                </td>
                <td className={cn("r font-medium", b.voidedAt && "line-through")}>{formatINR(b.amountPaise)}</td>
                <td>
                  <BillStatusBadge state={b.voidedAt ? "voided" : "paid"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <MobileList className="sm:hidden">
        {data.subBills.map((b) => (
          <MobileListItem key={b.id} href={`/bills/sub/${b.id}`} className={cn(b.voidedAt && "text-fg-muted")}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">{b.billNumber}</span>
              <span className={cn("num text-[13px] font-semibold", b.voidedAt && "line-through")}>{formatINR(b.amountPaise)}</span>
            </div>
            <div className="num flex justify-between text-xs text-fg-muted">
              <span>
                {formatDate(b.date)} · {b.job.jobNumber} · {PAYMENT_METHOD_LABEL[b.method]}
              </span>
              <BillStatusBadge state={b.voidedAt ? "voided" : "paid"} />
            </div>
          </MobileListItem>
        ))}
      </MobileList>
    </Card>
  );
}

function LedgerTab({ clientId }: { clientId: string }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const q = useClientLedger(clientId, range);
  return (
    <div className="space-y-4">
      <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
      {q.isPending ? (
        <Card className="overflow-hidden">
          <LoadingBlock rows={5} />
        </Card>
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <MetricStrip className="grid-cols-2 sm:grid-cols-4">
            <Metric label="Opening" value={formatINR(Math.abs(q.data.openingPaise))} sub={q.data.openingPaise < 0 ? "Advance" : undefined} />
            <Metric label="Work done (debit)" value={formatINR(q.data.totals.debitPaise)} />
            <Metric label="Paid (credit)" value={formatINR(q.data.totals.creditPaise)} tone="success" />
            <Metric label={q.data.totals.closingPaise < 0 ? "Closing (advance)" : "Closing payable"} value={formatINR(Math.abs(q.data.totals.closingPaise))} tone={q.data.totals.closingPaise > 0 ? "danger" : "fg"} />
          </MetricStrip>
          <Card className={cn("overflow-hidden", q.isPlaceholderData && "opacity-60")}>
            {q.data.rows.length === 0 ? (
              <EmptyState icon={ReceiptText} title="No entries in this period" />
            ) : (
              <LedgerTable openingPaise={q.data.openingPaise} rows={q.data.rows} totals={q.data.totals} showChallan />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function PerformanceTab({ q }: { q: ReturnType<typeof useClientPerformance> }) {
  if (q.isPending) return <StatsSkeleton count={8} />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  return (
    <div className="space-y-4">
      <MetricStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label={L.jobs} value={formatQty(p.challans)} sub="Excluding cancelled" />
        <Metric label="Avg completion" value={days(p.avgCompletionDays)} sub="Challan → final return (completed)" />
        <Metric label="Avg first return" value={days(p.avgFirstReturnDays)} />
        <Metric label="Avg final return" value={days(p.avgFinalReturnDays)} />
        <Metric label="Pending qty" value={formatQty(p.pending)} tone={p.pending ? "warning" : "fg"} />
        <Metric label="Overdue challans" value={formatQty(p.overdueChallans)} tone={p.overdueChallans ? "danger" : "fg"} />
        <Metric label="Defect %" value={pct(p.defectPct)} sub="Damaged + lost" tone={(p.defectPct ?? 0) > 5 ? "danger" : "fg"} />
        <Metric label="Rejection %" value={pct(p.rejectionPct)} tone={(p.rejectionPct ?? 0) > 5 ? "danger" : "fg"} />
        <Metric label="Rework %" value={pct(p.reworkPct)} sub={`${p.reworkChallans} challan(s) with rework`} />
        <Metric label="Total work" value={formatINR(p.totalWorkPaise)} />
        <Metric label="Payments" value={formatINR(p.totalPaidPaise)} tone="success" />
        <Metric label="Outstanding" value={formatINR(p.outstandingPaise)} tone={p.outstandingPaise ? "danger" : "fg"} />
      </MetricStrip>
      <p className="text-xs text-fg-muted">Raw figures only – no score is applied. Percentages are of the quantity returned or written off (rework: of the quantity originally issued).</p>
    </div>
  );
}
