"use client";

import type { ActivityRow } from "@av/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/components/billing/notification-status";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/misc";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE = 100;

const ACTION: Record<string, { label: string; tone: string }> = {
  create: { label: "Added", tone: "text-fg-2" },
  update: { label: "Edited", tone: "text-warning" },
  void: { label: "Voided", tone: "text-danger" },
  cancel: { label: "Cancelled", tone: "text-danger" },
  restore: { label: "Restored", tone: "text-fg-2" },
  exception: { label: "Exception", tone: "text-warning" },
  completed: { label: "Completed", tone: "text-success" },
  reopened: { label: "Reopened", tone: "text-warning" },
  login: { label: "Signed in", tone: "text-fg-muted" },
  whatsapp: { label: "WhatsApp", tone: "text-fg-2" },
};
export const actionOf = (a: string) => ACTION[a] ?? { label: a.replace(/_/g, " "), tone: "text-fg-muted" };

export interface ActivityFilter {
  folder?: string;
  clientId?: string;
  userId?: string;
  kind?: "edits";
  from?: string;
  to?: string;
  q?: string;
}

/** Activity entries for one folder (or everything), newest first, with "show older". */
export function ActivityList({ filter, showWorker = true }: { filter: ActivityFilter; showWorker?: boolean }) {
  const q = useInfiniteQuery({
    queryKey: ["activity", filter],
    queryFn: ({ pageParam }) => api.get<{ rows: ActivityRow[]; more: boolean }>(`/activity${qs({ ...filter, take: PAGE, skip: pageParam })}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.more ? all.length * PAGE : undefined),
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];

  const what = (r: ActivityRow) => {
    const label = r.jobNumber && r.entity !== "Job" ? `${r.entityLabel} · ${r.jobNumber}` : r.entity === "Job" && r.jobNumber ? `Challan ${r.jobNumber}` : r.entityLabel;
    return r.href ? (
      <Link href={r.href} className="font-medium hover:text-accent">
        {label}
      </Link>
    ) : (
      <span className="font-medium">{label}</span>
    );
  };
  const worker = (r: ActivityRow) =>
    r.worker ? (
      <Link href={`/activity?worker=${r.worker.id}`} className="hover:text-accent">
        {r.worker.name}
      </Link>
    ) : (
      <span className="text-fg-faint">—</span>
    );

  return (
    <Card className="overflow-hidden">
      {q.isPending ? (
        <LoadingBlock rows={6} />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title="No activity found">
          {filter.kind === "edits" ? "Nothing here has been edited or voided." : "Try another filter."}
        </EmptyState>
      ) : (
        <>
          <TableWrap className="max-sm:hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Record</th>
                  {showWorker && <th>Job worker</th>}
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="num align-top whitespace-nowrap text-fg-2">{formatDateTime(r.at)}</td>
                    <td className="align-top whitespace-nowrap font-medium">{r.user ?? <span className="font-normal text-fg-faint">System</span>}</td>
                    <td className={cn("align-top whitespace-nowrap font-medium", actionOf(r.action).tone)}>{actionOf(r.action).label}</td>
                    <td className="align-top whitespace-nowrap">{what(r)}</td>
                    {showWorker && <td className="align-top whitespace-nowrap">{worker(r)}</td>}
                    <td className="max-w-[28rem] align-top text-xs whitespace-normal">
                      <div className="break-words text-fg-2">{r.summary ?? "—"}</div>
                      {r.reason && !r.summary?.includes(r.reason) && <div className="mt-0.5 text-fg-muted">Reason: {r.reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <MobileList className="sm:hidden">
            {rows.map((r) => (
              <MobileListItem key={r.id}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span>
                    <span className={cn("font-medium", actionOf(r.action).tone)}>{actionOf(r.action).label}</span> · {what(r)}
                  </span>
                  <span className="num shrink-0 text-xs text-fg-muted">{formatDateTime(r.at)}</span>
                </div>
                <div className="mt-0.5 text-xs text-fg-muted">
                  by {r.user ?? "System"}
                  {showWorker && r.worker && <> · {worker(r)}</>}
                </div>
                {r.summary && <div className="mt-1 text-xs break-words text-fg-2">{r.summary}</div>}
                {r.reason && !r.summary?.includes(r.reason) && <div className="mt-0.5 text-xs text-fg-muted">Reason: {r.reason}</div>}
              </MobileListItem>
            ))}
          </MobileList>
          {q.hasNextPage && (
            <div className="border-t border-border p-3 text-center">
              <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                Show older activity
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
