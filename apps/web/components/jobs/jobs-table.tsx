"use client";

import { formatDate, formatINR, formatQty, type JobListRow } from "@av/shared";
import Link from "next/link";
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
                <Link href={`/jobs/${j.id}`} className="num font-medium text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                  {j.jobNumber}
                </Link>
                <div className="num text-xs text-fg-muted">{formatDate(j.jobDate)}</div>
              </td>
              {!hideClient && (
                <td className="max-w-56">
                  <div className="truncate">{j.client.name}</div>
                  <div className="truncate text-xs text-fg-muted">{j.product.name}</div>
                </td>
              )}
              <td className="max-w-56 min-w-36">
                <div className="truncate text-fg-2">{j.designs.join(", ")}</div>
                <FlowBar className="mt-1.5 max-w-32" sent={j.totals.sent} ok={j.totals.ok} exceptions={j.totals.exceptions} pending={j.totals.pending} />
              </td>
              <td className="r">{formatQty(j.totals.sent)}</td>
              <td className="r">
                {formatQty(j.totals.ok)}
                {j.totals.exceptions > 0 && <div className="text-xs text-danger">+{j.totals.exceptions} issue</div>}
              </td>
              <td className="r">
                {j.totals.pending > 0 ? (
                  <span className="font-medium text-warning">{formatQty(j.totals.pending)}</span>
                ) : (
                  <span className="text-fg-faint">
                    —<span className="sr-only">none pending</span>
                  </span>
                )}
              </td>
              <td className="r">{formatINR(j.totals.expectedValuePaise)}</td>
              <td className="whitespace-nowrap">
                <JobStatusBadge status={j.status} overdue={j.overdue} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
