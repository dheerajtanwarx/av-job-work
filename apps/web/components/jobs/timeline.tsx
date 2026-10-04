"use client";

import { DISPATCH_KIND_LABEL, formatDate, formatTime, formatINR, formatQty, L, PAYMENT_METHOD_LABEL, type TimelineEvent, type Unit } from "@av/shared";
import { Camera, CheckCircle2, FileCheck2, FilePlus2, History, PackageCheck, Truck, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PayStatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const icon = {
  created: FilePlus2,
  dispatch: Truck,
  return: PackageCheck,
  sub_bill: Wallet,
  main_bill: FileCheck2,
  completed: CheckCircle2,
  cancelled: XCircle,
  audit: History,
};

const ring = {
  created: "bg-surface-2 text-fg-muted ring-border",
  dispatch: "bg-blue-500/10 text-blue-700 ring-blue-500/25 dark:text-blue-300",
  return: "bg-success-subtle text-success ring-success/25",
  sub_bill: "bg-accent-subtle text-accent ring-accent/25",
  main_bill: "bg-success-subtle text-success ring-success/30",
  completed: "bg-success-subtle text-success ring-success/30",
  cancelled: "bg-danger-subtle text-danger ring-danger/25",
  audit: "bg-surface text-fg-faint ring-border",
};

/** "02:37 PM" in the business time zone (re-exported for older imports). */
export { formatTime };

type VoidableEvent = Extract<TimelineEvent, { type: "dispatch" | "return" }>;

/**
 * Vertical challan timeline: created → material issued → returns → payments → completed → final settlement.
 * Every event shows its date and exact time. Audit entries can be hidden with `showAudit={false}`.
 */
export function Timeline({
  events,
  onVoid,
  unit,
  jobId,
  showAudit = true,
}: {
  events: TimelineEvent[];
  onVoid?: (e: VoidableEvent) => void;
  unit?: Unit;
  jobId?: string;
  showAudit?: boolean;
}) {
  const list = showAudit ? events : events.filter((e) => e.type !== "audit");
  let returnNo = 0;
  let payNo = 0;
  const numbered = list.map((e) => ({ e, n: e.type === "return" && !e.voided ? ++returnNo : e.type === "sub_bill" && !e.voided ? ++payNo : 0 }));
  if (!list.length) return <p className="px-1 py-4 text-[13px] text-fg-muted">Nothing has happened on this challan yet.</p>;
  return (
    <ol className="relative">
      {numbered.map(({ e, n }, i) => (
        <li key={`${e.type}-${i}-${e.at}`} className="grid grid-cols-[4.25rem_1fr] gap-x-3 sm:grid-cols-[5.5rem_1fr] sm:gap-x-4">
          <div className="num pt-0.5 text-right leading-4">
            <div className="text-xs font-medium text-fg-2">{formatDate(e.date).slice(0, 6)}</div>
            <div className="text-[11px] text-fg-faint">{formatTime(e.type === "return" ? e.receivedAt : e.at)}</div>
            <div className="text-[10px] text-fg-faint">{e.date.slice(0, 4)}</div>
          </div>
          <div className={cn("relative border-l pb-6 pl-6", i === numbered.length - 1 ? "border-transparent" : "border-border")}>
            <Event e={e} n={n} onVoid={onVoid} unit={unit} jobId={jobId} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Event({ e, n, onVoid, unit, jobId }: { e: TimelineEvent; n: number; onVoid?: (e: VoidableEvent) => void; unit?: Unit; jobId?: string }) {
  const Icon = icon[e.type];
  const voided = (e.type === "dispatch" || e.type === "return" || e.type === "sub_bill") && e.voided;
  const struck = !!voided || (e.type === "main_bill" && e.cancelled);
  const u = unit ? ` ${unit}` : "";
  let title: ReactNode;
  let meta: ReactNode = null;
  let body: ReactNode = null;
  switch (e.type) {
    case "created":
      title = `${L.job} created`;
      meta = e.text;
      break;
    case "dispatch":
      title = `${DISPATCH_KIND_LABEL[e.kind]} · ${formatQty(e.total)}${u}`;
      meta = e.enteredBy ? `by ${e.enteredBy}` : null;
      body = <Breakdown rows={e.lines.map((l) => [l.designName, `${formatQty(l.qty)}${u}`])} />;
      break;
    case "return":
      title = (
        <Link href={`/returns/${e.id}`} className="hover:text-accent">
          Return #{n || "–"} · {formatQty(e.total)}
          {u} <span className="font-normal text-fg-muted">· {e.returnNumber}</span>
        </Link>
      );
      meta = (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="num font-medium text-fg-2">{formatINR(e.valuePaise)}</span>
          {e.payment && !e.voided && <PayStatusBadge status={e.payment.status} overdueDays={e.payment.overdueDays} />}
          {e.photoCount > 0 && (
            <Link href={jobId ? `/gallery?jobId=${jobId}` : `/returns/${e.id}`} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent">
              <Camera className="size-3" /> {e.photoCount} photo{e.photoCount === 1 ? "" : "s"}
            </Link>
          )}
          {e.enteredBy && <span className="text-xs text-fg-faint">by {e.enteredBy}</span>}
        </span>
      );
      body = (
        <Breakdown
          rows={e.lines.map((l) => [
            l.designName,
            <>
              {formatQty(l.okQty)} good @ {formatINR(l.ratePaise)} · <span className="font-medium">{formatINR(l.valuePaise)}</span>
              {l.damagedQty + l.rejectedQty + l.lostQty > 0 && (
                <div className="text-danger">
                  {[l.damagedQty && `${formatQty(l.damagedQty)} damaged`, l.rejectedQty && `${formatQty(l.rejectedQty)} rejected`, l.lostQty && `${formatQty(l.lostQty)} lost`].filter(Boolean).join(", ")}
                </div>
              )}
              {l.exceptionReason && <div className="text-warning">Exception: {l.exceptionReason}</div>}
            </>,
          ])}
        />
      );
      if (e.payment && !e.voided && e.payment.dueDate && e.payment.outstandingPaise > 0)
        body = (
          <>
            {body}
            <div className={cn("mt-1 text-xs", e.payment.overdueDays > 0 ? "text-danger" : "text-fg-muted")}>
              {formatINR(e.payment.outstandingPaise)} due {formatDate(e.payment.dueDate)}
            </div>
          </>
        );
      break;
    case "sub_bill":
      title = (
        <Link href={`/bills/sub/${e.id}`} className="hover:text-accent">
          Payment #{n || "–"} · {formatINR(e.amountPaise)}
        </Link>
      );
      meta = (
        <>
          {PAYMENT_METHOD_LABEL[e.method]} · {L.subBill} {e.billNumber}
          {e.returnNumber && ` · for ${e.returnNumber}`}
        </>
      );
      break;
    case "main_bill":
      title = (
        <Link href={`/bills/main/${e.id}`} className="hover:text-accent">
          {L.mainBill} {e.billNumber} · {formatINR(e.totalPaise)}
        </Link>
      );
      meta = e.cancelled ? "Cancelled – challan no longer fully paid" : "Challan complete and fully paid";
      break;
    case "completed":
      title = "Completed";
      meta = e.text;
      break;
    case "cancelled":
      title = "Cancelled";
      meta = e.text;
      break;
    default:
      title = e.text;
  }
  const isAudit = e.type === "audit";
  return (
    <div className={cn("group relative max-w-2xl", struck && "text-fg-faint")}>
      <span className={cn("absolute top-0 grid place-items-center rounded-full ring-1", isAudit ? "-left-[33px] size-4" : "-left-[37px] size-6", ring[e.type])}>
        <Icon className={isAudit ? "size-2.5" : "size-3.5"} strokeWidth={2} />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <div className={cn("num leading-5", isAudit ? "text-xs text-fg-muted" : "text-[13px] font-medium", struck ? "text-fg-muted line-through decoration-fg-faint" : !isAudit && "text-fg")}>{title}</div>
        {(e.type === "dispatch" || e.type === "return") && !e.voided && onVoid && (
          <button
            onClick={() => onVoid(e)}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-fg-faint transition-colors group-hover:text-fg-muted hover:!text-danger focus-visible:text-fg-muted pointer-coarse:py-2"
          >
            Void
          </button>
        )}
      </div>
      {meta && <div className="mt-0.5 text-xs text-fg-muted">{meta}</div>}
      {body}
      {(e.type === "dispatch" || e.type === "return") && e.notes && <div className="mt-1 text-xs text-fg-muted">“{e.notes}”</div>}
      {voided && e.voided && (
        <div className="mt-1 text-xs text-danger">
          VOID · {formatTime(e.voided.at)} {e.voided.reason && `– ${e.voided.reason}`}
        </div>
      )}
    </div>
  );
}

function Breakdown({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <ul className="mt-1.5 max-w-md space-y-0.5 rounded-md bg-surface-2/60 px-2.5 py-1.5 text-xs">
      {rows.map(([a, b], i) => (
        <li key={i} className="flex gap-3">
          <span className="min-w-0 flex-1 truncate text-fg-muted">{a}</span>
          <span className="num text-right text-fg-2">{b}</span>
        </li>
      ))}
    </ul>
  );
}
