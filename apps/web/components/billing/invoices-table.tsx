"use client";

import { formatDate, formatINR, formatQty, type InvoiceListRow } from "@av/shared";
import { useRouter } from "next/navigation";
import { PaymentStatusBadge } from "@/components/ui/badge";
import { TableWrap } from "@/components/ui/card";

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
            <tr key={i.id} className="row-link" onClick={() => router.push(`/invoices/${i.id}`)}>
              <td className="whitespace-nowrap">
                <div className="font-semibold text-indigo">{i.invoiceNumber}</div>
                <div className="text-sm text-muted">{formatDate(i.date)}</div>
              </td>
              {!hideClient && <td className="font-medium">{i.client.name}</td>}
              <td className="text-sm text-muted">{i.jobNumbers.join(", ")}</td>
              <td className="r num">{formatQty(i.qty)}</td>
              <td className="r num font-semibold">{formatINR(i.totalPaise)}</td>
              <td className="r num text-leaf">{i.paidPaise ? formatINR(i.paidPaise) : "—"}</td>
              <td className="r num">{i.outstandingPaise > 0 ? <span className="font-bold text-madder">{formatINR(i.outstandingPaise)}</span> : <span className="text-faint">—</span>}</td>
              <td><PaymentStatusBadge status={i.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
