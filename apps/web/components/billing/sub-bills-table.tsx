"use client";

import { formatDate, formatINR, L, PAYMENT_METHOD_LABEL, type SubBillRow } from "@av/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BillStatusBadge } from "@/components/ui/badge";
import { MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Payment Vouchers: a table from `sm` up, tappable cards on phones. */
export function SubBillsTable({ rows, hideClient, hideJob }: { rows: SubBillRow[]; hideClient?: boolean; hideJob?: boolean }) {
  const router = useRouter();
  return (
    <>
      <TableWrap className="max-sm:hidden">
        <table className="ledger ledger-sticky">
          <thead>
            <tr>
              <th>Voucher</th>
              {!hideClient && <th>{L.client}</th>}
              {!hideJob && <th>{L.job}</th>}
              <th>Return</th>
              <th className="r">Amount</th>
              <th>Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className={cn("row-link", b.voidedAt && "text-fg-muted")} onClick={() => router.push(`/bills/sub/${b.id}`)}>
                <td className="whitespace-nowrap">
                  <Link href={`/bills/sub/${b.id}`} className="font-medium text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                    {b.billNumber}
                  </Link>
                  <div className="num text-xs text-fg-muted">{formatDate(b.date)}</div>
                </td>
                {!hideClient && <td className="max-w-56 truncate">{b.client.name}</td>}
                {!hideJob && (
                  <td className="whitespace-nowrap">
                    <div className="num">{b.job.jobNumber}</div>
                    <div className="max-w-40 truncate text-xs text-fg-muted">{b.job.productName}</div>
                  </td>
                )}
                <td className="num whitespace-nowrap">{b.returnNumber ?? <span className="text-fg-faint">On account</span>}</td>
                <td className={cn("r font-medium", b.voidedAt && "line-through decoration-fg-faint")}>{formatINR(b.amountPaise)}</td>
                <td className="whitespace-nowrap text-fg-2">
                  {PAYMENT_METHOD_LABEL[b.method]}
                  {b.reference && <div className="max-w-36 truncate text-xs text-fg-muted">{b.reference}</div>}
                </td>
                <td className="whitespace-nowrap">
                  <BillStatusBadge state={b.voidedAt ? "voided" : "paid"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <MobileList className="sm:hidden">
        {rows.map((b) => (
          <MobileListItem key={b.id} href={`/bills/sub/${b.id}`} className={cn(b.voidedAt && "text-fg-muted")}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold">{b.billNumber}</span>
              <span className={cn("num text-sm font-semibold", b.voidedAt && "line-through decoration-fg-faint")}>{formatINR(b.amountPaise)}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-fg-muted">
              {[!hideClient && b.client.name, !hideJob && b.job.jobNumber, b.returnNumber, formatDate(b.date)].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-fg-2">
              <span className="truncate">
                {PAYMENT_METHOD_LABEL[b.method]}
                {b.reference && <span className="text-fg-muted"> · {b.reference}</span>}
              </span>
              <BillStatusBadge state={b.voidedAt ? "voided" : "paid"} />
            </div>
          </MobileListItem>
        ))}
      </MobileList>
    </>
  );
}
