"use client";

import { formatDate, formatINR, L, type MainBillRow } from "@av/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BillStatusBadge } from "@/components/ui/badge";
import { MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Final Settlements: a table from `sm` up, tappable cards on phones. */
export function MainBillsTable({ rows, hideClient }: { rows: MainBillRow[]; hideClient?: boolean }) {
  const router = useRouter();
  return (
    <>
      <TableWrap className="max-sm:hidden">
        <table className="ledger ledger-sticky">
          <thead>
            <tr>
              <th>Settlement</th>
              {!hideClient && <th>{L.client}</th>}
              <th>{L.job}</th>
              <th className="r">Vouchers</th>
              <th className="r">Total paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className={cn("row-link", m.cancelledAt && "text-fg-muted")} onClick={() => router.push(`/bills/main/${m.id}`)}>
                <td className="whitespace-nowrap">
                  <Link href={`/bills/main/${m.id}`} className="font-medium text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                    {m.billNumber}
                  </Link>
                  <div className="num text-xs text-fg-muted">{formatDate(m.date)}</div>
                </td>
                {!hideClient && <td className="max-w-56 truncate">{m.client.name}</td>}
                <td className="whitespace-nowrap">
                  <div className="num">{m.job.jobNumber}</div>
                  <div className="max-w-40 truncate text-xs text-fg-muted">{m.job.productName}</div>
                </td>
                <td className="r">{m.subBillCount}</td>
                <td className={cn("r font-medium", m.cancelledAt && "line-through decoration-fg-faint")}>{formatINR(m.totalPaise)}</td>
                <td className="whitespace-nowrap">
                  <BillStatusBadge state={m.cancelledAt ? "cancelled" : "settled"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <MobileList className="sm:hidden">
        {rows.map((m) => (
          <MobileListItem key={m.id} href={`/bills/main/${m.id}`} className={cn(m.cancelledAt && "text-fg-muted")}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold">{m.billNumber}</span>
              <span className={cn("num text-sm font-semibold", m.cancelledAt && "line-through decoration-fg-faint")}>{formatINR(m.totalPaise)}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-fg-muted">
              {[!hideClient && m.client.name, m.job.jobNumber, m.job.productName, formatDate(m.date)].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-fg-2">
              <span>
                {m.subBillCount} {m.subBillCount === 1 ? L.subBill.toLowerCase() : L.subBills.toLowerCase()}
              </span>
              <BillStatusBadge state={m.cancelledAt ? "cancelled" : "settled"} />
            </div>
          </MobileListItem>
        ))}
      </MobileList>
    </>
  );
}
