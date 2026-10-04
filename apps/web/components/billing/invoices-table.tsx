"use client";

import { formatDate, formatINR, formatQty, type InvoiceListRow } from "@av/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaymentStatusBadge } from "@/components/ui/badge";
import { TableWrap } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function InvoicesTable({ rows, hideClient }: { rows: InvoiceListRow[]; hideClient?: boolean }) {
  const router = useRouter();
  return (
    <TableWrap>
      <table className="ledger">
        <thead>
          <tr>
            <th>Invoice</th>
            {!hideClient && <th>Client</th>}
            <th>Jobs</th>
            <th className="r">Pieces</th>
            <th className="r">Total</th>
            <th className="r">Paid</th>
            <th className="r">Outstanding</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} className={cn("row-link", i.status === "CANCELLED" && "text-fg-muted")} onClick={() => router.push(`/invoices/${i.id}`)}>
              <td className="whitespace-nowrap">
                <Link href={`/invoices/${i.id}`} className="num font-medium text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                  {i.invoiceNumber}
                </Link>
                <div className="num text-xs text-fg-muted">{formatDate(i.date)}</div>
              </td>
              {!hideClient && <td className="max-w-56 truncate">{i.client.name}</td>}
              <td className="num max-w-48 truncate text-xs text-fg-muted">{i.jobNumbers.join(", ")}</td>
              <td className="r">{formatQty(i.qty)}</td>
              <td className="r font-medium">{formatINR(i.totalPaise)}</td>
              <td className="r">{i.paidPaise ? formatINR(i.paidPaise) : <span className="text-fg-faint">—</span>}</td>
              <td className="r">{i.outstandingPaise > 0 ? <span className="font-medium text-danger">{formatINR(i.outstandingPaise)}</span> : <span className="text-fg-faint">—</span>}</td>
              <td className="whitespace-nowrap">
                <PaymentStatusBadge status={i.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
