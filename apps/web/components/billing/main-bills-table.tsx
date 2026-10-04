"use client";

import { formatDate, formatINR, formatQty, type MainBillRow } from "@av/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BillStatusBadge } from "@/components/ui/badge";
import { TableWrap } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MainBillsTable({ rows, hideClient }: { rows: MainBillRow[]; hideClient?: boolean }) {
  const router = useRouter();
  return (
    <TableWrap>
      <table className="ledger ledger-sticky">
        <thead>
          <tr>
            <th>Main bill</th>
            {!hideClient && <th>Job worker</th>}
            <th>Job</th>
            <th className="r">Sub bills</th>
            <th className="r">Pieces</th>
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
                <div>{m.job.jobNumber}</div>
                <div className="max-w-40 truncate text-xs text-fg-muted">{m.job.productName}</div>
              </td>
              <td className="r">{m.subBillCount}</td>
              <td className="r">{formatQty(m.qty)}</td>
              <td className={cn("r font-medium", m.cancelledAt && "line-through decoration-fg-faint")}>{formatINR(m.totalPaise)}</td>
              <td className="whitespace-nowrap">
                <BillStatusBadge state={m.cancelledAt ? "cancelled" : "settled"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
