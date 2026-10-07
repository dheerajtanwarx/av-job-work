"use client";

import type { ChangeLogRow, UserRow } from "@av/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/components/billing/notification-status";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE = 100;

const ENTITIES = [
  ["", "Everything"],
  ["SubBill", "Payments"],
  ["Job", "Challans"],
  ["Return", "Returns"],
  ["Client", "Job workers"],
  ["Design", "Designs"],
  ["Product", "Products"],
  ["Material", "Materials"],
  ["StockMovement", "Stock entries"],
  ["JobWorkType", "Job work types"],
  ["Settings", "Settings"],
  ["User", "Users"],
] as const;

const ACTION: Record<string, { label: string; tone: string }> = {
  create: { label: "Added", tone: "text-fg-2" },
  update: { label: "Edited", tone: "text-warning" },
  void: { label: "Voided", tone: "text-danger" },
  cancel: { label: "Cancelled", tone: "text-danger" },
  restore: { label: "Restored", tone: "text-fg-2" },
  exception: { label: "Exception", tone: "text-warning" },
};
const actionOf = (a: string) => ACTION[a] ?? { label: a.replace(/_/g, " "), tone: "text-fg-muted" };

/** Settings → Change log: every change anyone made, newest first, with who made it. Owner only. */
export function ChangeLogPanel() {
  const [kind, setKind] = useState<"edits" | "all">("edits");
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });
  const q = useInfiniteQuery({
    queryKey: ["change-log", kind, entity, userId],
    queryFn: ({ pageParam }) =>
      api.get<{ rows: ChangeLogRow[]; more: boolean }>(`/change-log${qs({ kind: kind === "edits" ? "edits" : undefined, entity, userId, take: PAGE, skip: pageParam })}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.more ? all.length * PAGE : undefined),
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];

  const what = (r: ChangeLogRow) =>
    r.href ? (
      <Link href={r.href} className="font-medium hover:text-accent">
        {r.entityLabel}
      </Link>
    ) : (
      <span className="font-medium">{r.entityLabel}</span>
    );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold">Change log</h2>
          <p className="mt-0.5 text-xs text-fg-muted">Who changed what, newest first. Nothing here can be edited or deleted.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Show"
            value={kind}
            onChange={setKind}
            options={[
              { value: "edits", label: "Edits & voids" },
              { value: "all", label: "Everything" },
            ]}
          />
          <Select aria-label="Record type" value={entity} onChange={(e) => setEntity(e.target.value)} className="w-40">
            {ENTITIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select aria-label="Made by" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-40">
            <option value="">Anyone</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="icon" title="Refresh" aria-label="Refresh" onClick={() => q.refetch()}>
            <RefreshCw className={cn(q.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <LoadingBlock rows={6} />
        ) : q.isError ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={History} title="No changes found">
            {kind === "edits" ? "Nothing has been edited or voided yet." : "Try another filter."}
          </EmptyState>
        ) : (
          <>
            <TableWrap className="max-sm:hidden">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Change</th>
                    <th>Record</th>
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
                  <div className="mt-0.5 text-xs text-fg-muted">by {r.user ?? "System"}</div>
                  {r.summary && <div className="mt-1 text-xs break-words text-fg-2">{r.summary}</div>}
                  {r.reason && !r.summary?.includes(r.reason) && <div className="mt-0.5 text-xs text-fg-muted">Reason: {r.reason}</div>}
                </MobileListItem>
              ))}
            </MobileList>
            {q.hasNextPage && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                  Show older changes
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
