"use client";

import { formatDate, formatINR, formatQty, L, type JobListRow } from "@av/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgingBadge, JobStatusBadge, PayStatusBadge } from "@/components/ui/badge";
import { MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { FlowBar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Money cell: work value, paid and outstanding / advance. */
function MoneyCell({ j }: { j: JobListRow }) {
  const m = j.money;
  return (
    <>
      <div>{formatINR(m.valuePaise)}</div>
      <div className="text-xs text-fg-muted">
        {m.paidPaise > 0 ? `${formatINR(m.paidPaise)} paid` : "Nothing paid"}
        {m.outstandingPaise > 0 && <span className="text-danger"> · {formatINR(m.outstandingPaise)} due</span>}
        {m.advancePaise > 0 && <span className="text-accent"> · {formatINR(m.advancePaise)} advance</span>}
      </div>
    </>
  );
}

export function JobsTable({ rows, hideClient }: { rows: JobListRow[]; hideClient?: boolean }) {
  const router = useRouter();
  return (
    <>
      <TableWrap className="max-sm:hidden">
        <table className="ledger ledger-sticky">
          <thead>
            <tr>
              <th>{L.jobNumber}</th>
              {!hideClient && <th>{L.client}</th>}
              <th>Designs</th>
              <th className="r">Issued</th>
              <th className="r">Pending</th>
              <th>Aging</th>
              <th className="r">Work value</th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className="row-link" onClick={() => router.push(`/jobs/${j.id}`)}>
                <td className="whitespace-nowrap">
                  <Link href={`/jobs/${j.id}`} className="font-medium text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                    {j.jobNumber}
                  </Link>
                  <div className="num text-xs text-fg-muted">{formatDate(j.jobDate)}</div>
                </td>
                {!hideClient && (
                  <td className="max-w-56">
                    <div className="truncate">{j.client.name}</div>
                    <div className="truncate text-xs text-fg-muted">
                      {j.product.name}
                      {j.jobWorkType && ` · ${j.jobWorkType.name}`}
                    </div>
                  </td>
                )}
                <td className="max-w-56 min-w-36">
                  <div className="truncate text-fg-2">{j.designs.join(", ")}</div>
                  {hideClient && j.jobWorkType && <div className="truncate text-xs text-fg-muted">{j.jobWorkType.name}</div>}
                  <FlowBar className="mt-1.5 max-w-32" sent={j.totals.sent} ok={j.totals.ok} exceptions={j.totals.exceptions} pending={j.totals.pending} />
                </td>
                <td className="r whitespace-nowrap">
                  {formatQty(j.totals.sent)} <span className="text-xs text-fg-muted">{j.unit}</span>
                </td>
                <td className="r whitespace-nowrap">
                  {j.totals.pending > 0 ? (
                    <span className="font-medium text-warning">
                      {formatQty(j.totals.pending)} <span className="text-xs font-normal">{j.unit}</span>
                    </span>
                  ) : (
                    <span className="text-fg-faint">
                      —<span className="sr-only">none pending</span>
                    </span>
                  )}
                  {j.totals.exceptions > 0 && <div className="text-xs text-danger">{formatQty(j.totals.exceptions)} dmg/rej/lost</div>}
                </td>
                <td className="whitespace-nowrap">{j.totals.pending > 0 ? <AgingBadge bucket={j.aging} days={j.daysOut} /> : <span className="text-xs text-fg-faint">—</span>}</td>
                <td className="r whitespace-nowrap">
                  <MoneyCell j={j} />
                </td>
                <td className="whitespace-nowrap">
                  <PayStatusBadge status={j.payStatus} />
                </td>
                <td className="whitespace-nowrap">
                  <JobStatusBadge status={j.status} overdue={j.overdue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      {/* Phones: one card per challan */}
      <MobileList className="sm:hidden">
        {rows.map((j) => (
          <MobileListItem key={j.id} href={`/jobs/${j.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold">{j.jobNumber}</span>
                  <span className="num text-xs text-fg-muted">{formatDate(j.jobDate)}</span>
                </div>
                <div className="truncate text-[13px] text-fg-2">{hideClient ? j.designs.join(", ") : j.client.name}</div>
                <div className="truncate text-xs text-fg-muted">
                  {j.product.name}
                  {j.jobWorkType && ` · ${j.jobWorkType.name}`}
                </div>
              </div>
              <JobStatusBadge status={j.status} overdue={j.overdue} />
            </div>
            <div className="num mt-2.5 grid grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] text-fg-muted">Pending</div>
                <div className={cn("text-[14px] font-medium", j.totals.pending > 0 ? "text-warning" : "text-fg-muted")}>
                  {formatQty(j.totals.pending)} <span className="text-[11px] font-normal">{j.unit}</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-fg-muted">Work value</div>
                <div className="text-[14px] font-medium">{formatINR(j.money.valuePaise)}</div>
              </div>
              <div>
                <div className="text-[11px] text-fg-muted">Outstanding</div>
                <div className={cn("text-[14px] font-medium", j.money.outstandingPaise > 0 ? "text-danger" : "text-fg-muted")}>{formatINR(j.money.outstandingPaise)}</div>
              </div>
            </div>
            <FlowBar className="mt-2" sent={j.totals.sent} ok={j.totals.ok} exceptions={j.totals.exceptions} pending={j.totals.pending} />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <PayStatusBadge status={j.payStatus} />
              {j.totals.pending > 0 && <AgingBadge bucket={j.aging} days={j.daysOut} />}
            </div>
          </MobileListItem>
        ))}
      </MobileList>
    </>
  );
}
