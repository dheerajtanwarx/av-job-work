"use client";

import { formatDate, formatINR, formatQty, HOLDING_STATUS_LABEL, L, type ArrivalRow, type AttentionItem, type DashboardKpis, type HoldingStatus, type MaterialHolderRow, type PhotoView } from "@av/shared";
import { AlertTriangle, CalendarClock, ChevronRight, CircleCheck, Clock, ImageOff, PackageX, Scale, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, TableWrap } from "@/components/ui/card";
import { Metric, MetricStrip } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
export const timeOf = (iso: string) => timeFmt.format(new Date(iso));

export function qtyList(list: { unit: string; qty: number }[]) {
  return list.length ? list.map((m) => `${formatQty(m.qty)} ${m.unit}`).join(" · ") : "0";
}

// ───────── KPI cards ─────────

export function KpiCards({ k, ranged }: { k: DashboardKpis; ranged: boolean }) {
  return (
    <div className="space-y-3">
      <MetricStrip className="grid-cols-2 lg:grid-cols-4">
        <Metric label="Material outside" value={<span className="text-lg">{qtyList(k.materialOutside)}</span>} tone={k.materialOutside.length ? "warning" : "fg"} sub={`Worth ${formatINR(k.materialValueOutsidePaise)} at challan rates`} href="/reports?report=material-outside" />
        <Metric label={`Active ${L.jobs.toLowerCase()}`} value={formatQty(k.activeChallans)} sub={`${k.activeWorkers} active worker${k.activeWorkers === 1 ? "" : "s"}`} href="/jobs?status=active" />
        <Metric label={`Overdue ${L.jobs.toLowerCase()}`} value={formatQty(k.overdueChallans)} tone={k.overdueChallans ? "danger" : "fg"} sub={k.overdueChallans ? "Past expected return" : "None overdue"} href="/jobs?status=overdue" />
        <Metric label="Overdue payments" value={formatINR(k.overduePayments.amountPaise)} tone={k.overduePayments.count ? "danger" : "fg"} sub={k.overduePayments.count ? `${k.overduePayments.count} return${k.overduePayments.count === 1 ? "" : "s"} past due date` : "Nothing overdue"} href="/reports?report=payment-aging" />
      </MetricStrip>
      <MetricStrip className="grid-cols-2 lg:grid-cols-4">
        <Metric label="Work completed" value={formatINR(k.workValuePaise)} sub={ranged ? "In the selected period" : "All time, at return rates"} href="/reports?report=job-work-by-worker" />
        <Metric label="Paid" value={formatINR(k.paidPaise)} tone="success" sub={ranged ? "In the selected period" : `All ${L.subBills.toLowerCase()}`} href="/reports?report=payments" />
        <Metric label="Outstanding" value={formatINR(k.outstandingPaise)} tone={k.outstandingPaise ? "danger" : "fg"} sub={k.outstandingPaise ? "Still payable to workers" : "All paid"} href="/reports?report=payment-outstanding" />
        <Metric label="Advances" value={formatINR(k.advancePaise)} tone={k.advancePaise ? "warning" : "fg"} sub="Paid ahead of work" href="/reports?report=payment-outstanding" />
      </MetricStrip>
    </div>
  );
}

// ───────── Attention required ─────────

const attentionIcon: Record<AttentionItem["kind"], typeof Clock> = {
  "overdue-challans": CalendarClock,
  "overdue-payments": Wallet,
  "long-held-material": Clock,
  "payments-due-today": Wallet,
  "expected-today": CalendarClock,
  "quantity-mismatch": Scale,
  advances: AlertTriangle,
};

const attentionTone: Record<AttentionItem["tone"], { text: string; bg: string; label: string }> = {
  danger: { text: "text-danger", bg: "bg-danger-subtle", label: "Urgent" },
  attention: { text: "text-[#c2410c] dark:text-[#fb923c]", bg: "bg-[rgb(234_88_12/0.09)]", label: "Check" },
  warning: { text: "text-warning", bg: "bg-warning-subtle", label: "Today" },
};

export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (!items.length)
    return (
      <Card className="flex items-center gap-3 px-4 py-4 text-[13px] text-fg-2">
        <CircleCheck className="size-4 text-success" />
        All clear — nothing overdue, due today or out of line.
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {items.map((a) => {
          const Icon = attentionIcon[a.kind];
          const t = attentionTone[a.tone];
          return (
            <li key={a.kind}>
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", t.bg, t.text)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-fg">{a.label}</span>
                    <span className="block truncate text-xs text-fg-muted">{a.hint}</span>
                  </span>
                  <span className={cn("num shrink-0 rounded px-1.5 text-xs font-semibold", t.bg, t.text)} title={t.label}>
                    {a.count}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-faint transition-transform group-open:rotate-90" />
                </summary>
                <ul className="border-t border-border bg-surface-2/40 py-1">
                  {a.records.map((r, i) => (
                    <li key={i}>
                      <Link href={r.href} className="flex min-h-10 items-center gap-3 px-4 py-1.5 pl-15 text-[13px] hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-fg">{r.label}</span>
                          {r.sub && <span className="block truncate text-xs text-fg-muted">{r.sub}</span>}
                        </span>
                        {r.amountPaise !== undefined && <span className="num shrink-0 text-xs font-medium">{formatINR(r.amountPaise)}</span>}
                      </Link>
                    </li>
                  ))}
                  {a.count > a.records.length || a.count > 1 ? (
                    <li>
                      <Link href={a.href} className="block px-4 py-1.5 pl-15 text-xs font-medium text-accent hover:underline">
                        {a.count > a.records.length ? `See all ${a.count}` : "Open list"}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ───────── Who has my material? ─────────

const holdTone: Record<HoldingStatus, Tone> = { OVERDUE: "danger", AGING: "warning", OK: "success" };

export function HoldingBadge({ status }: { status: HoldingStatus }) {
  return (
    <Badge tone={holdTone[status]} dot className="bg-transparent px-0">
      {HOLDING_STATUS_LABEL[status]}
    </Badge>
  );
}

export function MaterialHolders({ rows, limit = 10 }: { rows: MaterialHolderRow[]; limit?: number }) {
  if (!rows.length) return <Card className="px-4 py-6 text-center text-[13px] text-fg-muted">All material is back in hand.</Card>;
  const shown = rows.slice(0, limit);
  return (
    <>
      {/* Phone: cards */}
      <ul className="space-y-2 md:hidden">
        {shown.map((r) => (
          <li key={`${r.clientId}:${r.materialId ?? r.unit}`}>
            <Link href={`/clients/${r.clientId}`} className="block rounded-lg border border-border bg-surface px-4 py-3 active:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{r.clientName}</div>
                  <div className="truncate text-xs text-fg-muted">{r.materialName}</div>
                </div>
                <HoldingBadge status={r.status} />
              </div>
              <div className="num mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-fg-muted">
                <span className="text-[15px] font-semibold text-fg">
                  {formatQty(r.qty)} <span className="text-xs font-normal text-fg-muted">{r.unit}</span>
                </span>
                <span>{r.daysOutside} days</span>
                <span>
                  {r.challans} {r.challans === 1 ? L.job.toLowerCase() : L.jobs.toLowerCase()}
                </span>
                <span>{formatINR(r.valuePaise)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {/* Tablet / desktop: table */}
      <Card className="hidden overflow-hidden md:block">
        <TableWrap>
          <table className="ledger">
            <thead>
              <tr>
                <th>{L.client}</th>
                <th>Material</th>
                <th className="r">Qty</th>
                <th className="r">{L.jobs}</th>
                <th>Oldest issue</th>
                <th className="r">Days out</th>
                <th className="r">Est. value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.clientId}:${r.materialId ?? r.unit}`} className="row-link">
                  <td className="max-w-44 truncate">
                    <Link href={`/clients/${r.clientId}`} className="font-medium hover:text-accent">
                      {r.clientName}
                    </Link>
                  </td>
                  <td className="max-w-44 truncate text-fg-2">{r.materialId ? <Link href={`/materials/${r.materialId}`} className="hover:text-accent">{r.materialName}</Link> : r.materialName}</td>
                  <td className="r font-medium">
                    {formatQty(r.qty)} <span className="text-xs font-normal text-fg-muted">{r.unit}</span>
                  </td>
                  <td className="r">{r.challans}</td>
                  <td className="num whitespace-nowrap text-fg-2">{formatDate(r.oldestIssueDate)}</td>
                  <td className={cn("r", r.status === "OVERDUE" ? "text-danger" : r.status === "AGING" ? "text-warning" : "")}>{r.daysOutside}</td>
                  <td className="r">{formatINR(r.valuePaise)}</td>
                  <td>
                    <HoldingBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}

// ───────── Today's returns ─────────

export function Thumb({ photoId, alt, className }: { photoId: string | null; alt: string; className?: string }) {
  if (!photoId)
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-md bg-surface-2 text-fg-faint", className)} title="No photo uploaded">
        <ImageOff className="size-4" />
      </span>
    );
  return (
    <Link href={`/gallery?photo=${photoId}`} className={cn("block shrink-0 overflow-hidden rounded-md bg-surface-2", className)} title="Open photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/photos/${photoId}/thumb`} alt={alt} loading="lazy" className="size-full object-cover" />
    </Link>
  );
}

export function TodayReturns({ rows }: { rows: ArrivalRow[] }) {
  if (!rows.length) return <Card className="px-4 py-6 text-center text-[13px] text-fg-muted">Nothing received yet today.</Card>;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.returnLineId} className="flex items-center gap-3 px-3 py-2">
            <Thumb photoId={r.photoId} alt={`${r.designName} from ${r.client.name}`} className="size-12" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="num shrink-0 text-xs text-fg-muted">{timeOf(r.receivedAt)}</span>
                <Link href={`/clients/${r.client.id}`} className="truncate font-medium hover:text-accent">
                  {r.client.name}
                </Link>
              </div>
              <div className="truncate text-xs text-fg-muted">
                <Link href={`/returns/${r.returnId}`} className="hover:text-fg">
                  {r.designName}
                </Link>{" "}
                ·{" "}
                <Link href={`/jobs/${r.job.id}`} className="hover:text-fg">
                  {r.job.jobNumber}
                </Link>
              </div>
            </div>
            <Link href={`/returns/${r.returnId}`} className="num shrink-0 text-right text-[13px]">
              <div className="font-medium">
                {formatQty(r.qty)} <span className="text-xs font-normal text-fg-muted">{r.unit}</span>
              </div>
              <div className="text-xs text-fg-muted">
                @ {formatINR(r.ratePaise)} = <span className="text-fg-2">{formatINR(r.valuePaise)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────── Recent design returns ─────────

export function RecentPhotos({ photos }: { photos: PhotoView[] }) {
  if (!photos.length)
    return (
      <Card className="flex items-center gap-3 px-4 py-4 text-[13px] text-fg-muted">
        <PackageX className="size-4 text-fg-faint" /> No design photos yet. Add them when recording a return.
      </Card>
    );
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {photos.map((p) => (
        <Link key={p.id} href={`/gallery?photo=${p.id}`} className="w-36 shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
          <div className="aspect-square bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${p.id}/thumb`} alt={`${p.design?.name ?? "Design"} from ${p.client.name}`} loading="lazy" className="size-full object-cover" />
          </div>
          <div className="space-y-0.5 px-2 py-1.5 text-xs">
            <div className="truncate font-medium text-fg">{p.design?.name ?? p.productName}</div>
            <div className="truncate text-fg-muted">{p.client.name}</div>
            <div className="num truncate text-fg-muted">
              {formatQty(p.qty)} {p.unit}
              {p.ratePaise !== null && ` @ ${formatINR(p.ratePaise)}`}
            </div>
            <div className="num truncate text-fg-faint">
              {formatDate(p.receivedDate)} · {timeOf(p.receivedAt)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-fg-muted">{children}</p>;
}
