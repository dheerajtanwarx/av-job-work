"use client";

import { formatDate, formatINR, formatQty, type JobListRow } from "@av/shared";
import { useRouter } from "next/navigation";
import { JobStatusBadge } from "@/components/ui/badge";
import { TableWrap } from "@/components/ui/card";
import { FlowBar } from "@/components/ui/misc";

export function JobsTable({ rows, hideClient }: { rows: JobListRow[]; hideClient?: boolean }) {
  const router = useRouter();
  return (
    <TableWrap>
      <table className="ledger">
        <thead>
          <tr>
            <th>Job</th>
            {!hideClient && <th>Client</th>}
            <th>Designs</th>
            <th className="r">Sent</th>
            <th className="r">Received</th>
            <th className="r">Pending</th>
            <th className="r">Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="row-link" onClick={() => router.push(`/jobs/${j.id}`)}>
              <td className="whitespace-nowrap">
                <div className="font-semibold text-indigo">{j.jobNumber}</div>
                <div className="text-sm text-muted">{formatDate(j.jobDate)}</div>
              </td>
              {!hideClient && (
                <td>
                  <div className="font-medium">{j.client.name}</div>
                  <div className="text-sm text-muted">{j.product.name}</div>
                </td>
              )}
              <td className="max-w-56">
                <div className="truncate text-sm">{j.designs.join(", ")}</div>
                <FlowBar className="mt-1.5 max-w-40" sent={j.totals.sent} ok={j.totals.ok} exceptions={j.totals.exceptions} pending={j.totals.pending} />
              </td>
              <td className="r num">{formatQty(j.totals.sent)}</td>
              <td className="r num">{formatQty(j.totals.ok)}{j.totals.exceptions > 0 && <div className="text-xs text-madder">+{j.totals.exceptions} issue</div>}</td>
              <td className="r num">{j.totals.pending > 0 ? <span className="font-bold text-marigold-700">{formatQty(j.totals.pending)}</span> : <span className="text-leaf">✓</span>}</td>
              <td className="r num">{formatINR(j.totals.expectedValuePaise)}</td>
              <td><JobStatusBadge status={j.status} overdue={j.overdue} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
