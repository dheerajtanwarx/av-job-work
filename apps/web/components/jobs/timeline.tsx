"use client";

import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type TimelineEvent } from "@av/shared";
import { CheckCircle2, FileCheck2, FilePlus2, History, PackageCheck, Truck, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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

const tint = {
  created: "text-fg-muted",
  dispatch: "text-accent",
  return: "text-success",
  sub_bill: "text-success",
  main_bill: "text-success",
  completed: "text-success",
  cancelled: "text-danger",
  audit: "text-fg-faint",
};

export function Timeline({ events, onVoid }: { events: TimelineEvent[]; onVoid?: (e: Extract<TimelineEvent, { type: "dispatch" | "return" }>) => void }) {
  // Group by calendar day
  const groups: { day: string; items: TimelineEvent[] }[] = [];
  for (const e of events) {
    const day = e.date.slice(0, 10);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return (
    <ol>
      {groups.map((g) => (
        <li key={g.day} className="grid grid-cols-[3.25rem_1fr] gap-x-4 sm:grid-cols-[4rem_1fr] sm:gap-x-5">
          <div className="num pt-px text-right leading-5">
            <div className="text-xs font-medium text-fg-2">{formatDate(g.day).slice(0, 6)}</div>
            <div className="text-[11px] text-fg-faint">{g.day.slice(0, 4)}</div>
          </div>
          <div className="relative border-l border-border pb-5 pl-5">
            {g.items.map((e, i) => (
              <Event key={`${e.type}-${i}-${e.at}`} e={e} onVoid={onVoid} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Event({ e, onVoid }: { e: TimelineEvent; onVoid?: (e: Extract<TimelineEvent, { type: "dispatch" | "return" }>) => void }) {
  const Icon = icon[e.type];
  const voided = (e.type === "dispatch" || e.type === "return" || e.type === "sub_bill") && e.voided;
  const struck = voided || (e.type === "main_bill" && e.cancelled);
  let title: ReactNode;
  let body: ReactNode = null;
  switch (e.type) {
    case "dispatch":
      title = `${formatQty(e.total)} pieces ${e.kind === "REWORK" ? "sent for rework" : "sent"}`;
      body = <Breakdown rows={e.lines.map((l) => [l.designName, formatQty(l.qty)])} />;
      break;
    case "return":
      title = (
        <>
          {formatQty(e.total)} returned <span className="font-normal text-fg-muted">· {e.returnNumber}</span>
        </>
      );
      body = (
        <Breakdown
          rows={e.lines.map((l) => [
            l.designName,
            <>
              {formatQty(l.okQty)}
              {l.damagedQty + l.rejectedQty + l.lostQty > 0 && (
                <span className="ml-2 text-danger">
                  {[l.damagedQty && `${l.damagedQty} damaged`, l.rejectedQty && `${l.rejectedQty} rejected`, l.lostQty && `${l.lostQty} lost`].filter(Boolean).join(", ")}
                </span>
              )}
              {l.exceptionReason && <div className="text-xs text-warning">Exception: {l.exceptionReason}</div>}
            </>,
          ])}
        />
      );
      break;
    case "sub_bill":
      title = (
        <Link href={`/bills/sub/${e.id}`} className="hover:text-accent">
          {formatINR(e.amountPaise)} paid for {formatQty(e.qty)} pcs <span className="font-normal text-fg-muted">· {PAYMENT_METHOD_LABEL[e.method]} · {e.billNumber}</span>
        </Link>
      );
      break;
    case "main_bill":
      title = (
        <Link href={`/bills/main/${e.id}`} className="hover:text-accent">
          Fully paid – main bill {e.billNumber} · {formatINR(e.totalPaise)}
        </Link>
      );
      break;
    default:
      title = e.text;
  }
  return (
    <div className={cn("group relative mb-4 max-w-xl last:mb-0", struck && "text-fg-faint")}>
      <span className={cn("absolute top-0 -left-[30.5px] grid size-5 place-items-center rounded-full bg-surface ring-1 ring-border", tint[e.type])}>
        <Icon className="size-3" strokeWidth={2} />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <div className={cn("num text-[13px] leading-5 font-medium", struck ? "text-fg-muted line-through decoration-fg-faint" : "text-fg")}>{title}</div>
        {(e.type === "dispatch" || e.type === "return") && !e.voided && onVoid && (
          <button onClick={() => onVoid(e)} className="rounded px-1 text-xs font-medium text-fg-faint transition-colors group-hover:text-fg-muted hover:!text-danger focus-visible:text-fg-muted">
            Void
          </button>
        )}
      </div>
      {body}
      {(e.type === "dispatch" || e.type === "return") && e.notes && <div className="mt-1 text-xs text-fg-muted">“{e.notes}”</div>}
      {voided && e.voided && <div className="mt-1 text-xs text-danger">Voided: {e.voided.reason}</div>}
    </div>
  );
}

function Breakdown({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <ul className="mt-1 max-w-xs space-y-px text-xs">
      {rows.map(([a, b], i) => (
        <li key={i} className="flex gap-3">
          <span className="min-w-0 flex-1 truncate text-fg-muted">{a}</span>
          <span className="num text-right text-fg-2">{b}</span>
        </li>
      ))}
    </ul>
  );
}
