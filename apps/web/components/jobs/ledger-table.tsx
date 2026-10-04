"use client";

import { formatDate, formatINR, L, type LedgerRow } from "@av/shared";
import Link from "next/link";
import { MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatTime } from "./timeline";

/** Shared ledger table (challan and worker): date, particular, debit, credit, running balance. Cards on phones. */
export function LedgerTable({ openingPaise, rows, totals, showChallan }: { openingPaise: number; rows: LedgerRow[]; totals: { debitPaise: number; creditPaise: number; closingPaise: number }; showChallan?: boolean }) {
  const bal = (p: number) => (
    <span className={p > 0 ? "text-danger" : p < 0 ? "text-accent" : "text-fg-muted"}>
      {formatINR(Math.abs(p))}
      <span className="ml-1 text-[11px] font-normal">{p > 0 ? "Dr" : p < 0 ? "Adv" : ""}</span>
    </span>
  );
  return (
    <>
      <TableWrap className="max-sm:hidden">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Particular</th>
              {showChallan && <th>{L.job}</th>}
              <th className="r">Debit (work)</th>
              <th className="r">Credit (paid)</th>
              <th className="r">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-fg-muted">
              <td />
              <td className="font-medium">Opening balance</td>
              {showChallan && <td />}
              <td />
              <td />
              <td className="r">{bal(openingPaise)}</td>
            </tr>
            {rows.map((r, i) => (
              <tr key={`${r.ref}-${i}`} className={cn(r.type === "void" && "text-fg-muted")}>
                <td className="num whitespace-nowrap">
                  {formatDate(r.date)}
                  <div className="text-xs text-fg-muted">{formatTime(r.at)}</div>
                </td>
                <td className="min-w-48">
                  <Link href={r.href} className="hover:text-accent">
                    {r.particular}
                  </Link>
                  <div className="text-xs text-fg-muted">{r.ref}</div>
                </td>
                {showChallan && (
                  <td className="whitespace-nowrap">
                    {r.job ? (
                      <Link href={`/jobs/${r.job.id}`} className="hover:text-accent">
                        {r.job.jobNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td className="r">{r.debitPaise ? formatINR(r.debitPaise) : <span className="text-fg-faint">—</span>}</td>
                <td className="r">{r.creditPaise ? formatINR(r.creditPaise) : <span className="text-fg-faint">—</span>}</td>
                <td className="r font-medium">{bal(r.balancePaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Closing balance</td>
              {showChallan && <td />}
              <td className="r">{formatINR(totals.debitPaise)}</td>
              <td className="r">{formatINR(totals.creditPaise)}</td>
              <td className="r">{bal(totals.closingPaise)}</td>
            </tr>
          </tfoot>
        </table>
      </TableWrap>
      <MobileList className="sm:hidden">
        <li className="flex justify-between px-4 py-2.5 text-[13px] text-fg-muted">
          <span>Opening balance</span>
          <span className="num font-medium">{bal(openingPaise)}</span>
        </li>
        {rows.map((r, i) => (
          <MobileListItem key={`${r.ref}-${i}`} href={r.href} className={cn(r.type === "void" && "text-fg-muted")}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] font-medium">{r.particular}</span>
              <span className={cn("num shrink-0 text-[13px] font-semibold", r.creditPaise ? "text-success" : "")}>
                {r.debitPaise ? `+${formatINR(r.debitPaise)}` : r.creditPaise ? `−${formatINR(r.creditPaise)}` : "—"}
              </span>
            </div>
            <div className="num flex justify-between text-xs text-fg-muted">
              <span>
                {formatDate(r.date)} · {formatTime(r.at)}
                {showChallan && r.job && ` · ${r.job.jobNumber}`}
              </span>
              <span>Bal {bal(r.balancePaise)}</span>
            </div>
          </MobileListItem>
        ))}
        <li className="flex justify-between bg-surface-2 px-4 py-2.5 text-[13px] font-semibold">
          <span>Closing balance</span>
          <span className="num">{bal(totals.closingPaise)}</span>
        </li>
      </MobileList>
    </>
  );
}
