"use client";

import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type TimelineEvent } from "@av/shared";
import { CheckCircle2, FilePlus2, History, PackageCheck, ReceiptText, Truck, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const icon = {
  created: FilePlus2,
  dispatch: Truck,
  return: PackageCheck,
  invoice: ReceiptText,
  payment: Wallet,
  completed: CheckCircle2,
  cancelled: XCircle,
  audit: History,
};

const tint = {
  created: "bg-paper-2 text-ink-2",
  dispatch: "bg-indigo-50 text-indigo",
  return: "bg-leaf-50 text-leaf",
  invoice: "bg-plum-50 text-plum",
  payment: "bg-marigold-50 text-marigold-700",
  completed: "bg-leaf text-white",
  cancelled: "bg-madder text-white",
  audit: "bg-paper-2 text-muted",
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
    <ol className="relative">
      {groups.map((g) => (
        <li key={g.day} className="grid grid-cols-[3.5rem_1fr] gap-x-5 sm:grid-cols-[4.5rem_1fr] sm:gap-x-6">
          <div className="pt-1.5 text-right">
            <div className="font-display text-sm font-semibold text-ink">{formatDate(g.day).slice(0, 6)}</div>
            <div className="text-xs text-faint">{g.day.slice(0, 4)}</div>
          </div>
          <div className="relative border-l-[1.5px] border-dashed border-line-strong pb-4 pl-5">
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
  const voided = (e.type === "dispatch" || e.type === "return") && e.voided;
  const struck = voided || (e.type === "invoice" && e.cancelled) || (e.type === "payment" && e.voided);
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
          {formatQty(e.total)} returned <span className="font-normal text-muted">· {e.returnNumber}</span>
        </>
      );
      body = (
        <Breakdown
          rows={e.lines.map((l) => [
            l.designName,
            <>
              {formatQty(l.okQty)}
              {l.damagedQty + l.rejectedQty + l.lostQty > 0 && (
                <span className="ml-2 text-madder">
                  {[l.damagedQty && `${l.damagedQty} damaged`, l.rejectedQty && `${l.rejectedQty} rejected`, l.lostQty && `${l.lostQty} lost`].filter(Boolean).join(", ")}
                </span>
              )}
              {l.exceptionReason && <div className="text-xs text-marigold-700">Exception: {l.exceptionReason}</div>}
            </>,
          ])}
        />
      );
      break;
    case "invoice":
      title = (
        <Link href={`/invoices/${e.id}`} className="hover:underline">
          Invoice {e.invoiceNumber} · {formatQty(e.qty)} pcs · {formatINR(e.amountPaise)}
          {e.cancelled && <span className="ml-1 text-madder">(cancelled)</span>}
        </Link>
      );
      break;
    case "payment":
      title = `${formatINR(e.amountPaise)} received · ${PAYMENT_METHOD_LABEL[e.method]} (${e.invoiceNumber})${e.voided ? " – voided" : ""}`;
      break;
    default:
      title = e.text;
  }
  return (
    <div className={cn("relative mb-3 last:mb-0", struck && "opacity-60")}>
      <span className={cn("absolute top-0.5 -left-[2.07rem] grid size-6 place-items-center rounded-full ring-4 ring-card", tint[e.type])}>
        <Icon className="size-3.5" />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <div className={cn("font-semibold text-ink", struck && "line-through decoration-madder/60")}>{title}</div>
        {(e.type === "dispatch" || e.type === "return") && !e.voided && onVoid && (
          <button onClick={() => onVoid(e)} className="text-xs font-semibold text-muted hover:text-madder">
            Void
          </button>
        )}
      </div>
      {body}
      {(e.type === "dispatch" || e.type === "return") && e.notes && <div className="mt-1 text-sm text-muted italic">“{e.notes}”</div>}
      {voided && e.voided && <div className="mt-1 text-sm text-madder">Voided: {e.voided.reason}</div>}
    </div>
  );
}

function Breakdown({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {rows.map(([a, b], i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted">•</span>
          <span className="text-ink-2">{a}:</span>
          <span className="num font-medium">{b}</span>
        </li>
      ))}
    </ul>
  );
}
