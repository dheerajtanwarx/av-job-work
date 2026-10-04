"use client";

import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type SubBillRow } from "@av/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BillStatusBadge } from "@/components/ui/badge";
import { TableWrap } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SubBillsTable({ rows, hideClient, hideJob }: { rows: SubBillRow[]; hideClient?: boolean; hideJob?: boolean }) {
  const router = useRouter();
  return (
    <TableWrap>
      <table className="ledger ledger-sticky">
        <thead>
          <tr>
            <th>Sub bill</th>
            {!hideClient && <th>Job worker</th>}
            {!hideJob && <th>Job</th>}
            <th className="r">Pieces</th>
            <th className="r">Amount</th>
            <th>Paid by</th>
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
                  <div>{b.job.jobNumber}</div>
                  <div className="max-w-40 truncate text-xs text-fg-muted">{b.job.productName}</div>
                </td>
              )}
              <td className="r">{formatQty(b.qty)}</td>
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
  );
}
