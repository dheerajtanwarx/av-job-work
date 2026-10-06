"use client";

import { formatINR, type Design } from "@av/shared";
import { Palette, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DesignDialog } from "@/components/forms/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { useDesigns } from "@/lib/queries";
import { EditedTag } from "@/components/ui/edited";
import { cn } from "@/lib/utils";

export default function DesignsPage() {
  const q = useDesigns(false);
  const [editing, setEditing] = useState<Design | null>(null);
  const [open, setOpen] = useState(false);
  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const edit = (d: Design) => {
    setEditing(d);
    setOpen(true);
  };
  return (
    <>
      <PageHeader
        title="Designs"
        subtitle="Designs with their default job work rate – used to prefill new challans only."
        actions={
          <Button onClick={openNew}>
            <Plus /> Add design
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <LoadingBlock />
        ) : q.isError ? (
          <div className="p-4">
            <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Palette}
            title="No designs yet"
            action={
              <Button onClick={openNew}>
                <Plus /> Add design
              </Button>
            }
          >
            Designs you pay for, like Floral Design at ₹20 a piece.
          </EmptyState>
        ) : (
          <>
          <TableWrap className="max-sm:hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Design</th>
                  <th>Code</th>
                  <th>Job work type</th>
                  <th className="r" title="Default for new challans only">Default rate</th>
                  <th className="r">Used in challans</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((d) => (
                  <tr key={d.id} tabIndex={0} className={cn("row-link focus-visible:outline-offset-[-2px]", !d.isActive && "text-fg-muted")} onClick={() => edit(d)} onKeyDown={(e) => e.key === "Enter" && edit(d)}>
                    <td>
                      <div className="font-medium">{d.name}</div>
                      {d.description && <div className="text-xs text-fg-muted">{d.description}</div>}
                    </td>
                    <td className="num text-fg-muted">{d.code ?? "—"}</td>
                    <td className="text-fg-2">{d.jobWorkType?.name ?? <span className="text-fg-faint">—</span>}</td>
                    <td className="r font-medium">{formatINR(d.defaultRatePaise)}</td>
                    <td className="r">
                      {d.jobCount ? (
                        <Link className="text-fg-2 underline decoration-border-strong underline-offset-2 hover:text-accent hover:decoration-accent" href={`/jobs?designId=${d.id}`} onClick={(e) => e.stopPropagation()}>
                          {d.jobCount}
                        </Link>
                      ) : (
                        <span className="text-fg-faint">0</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {d.isActive ? <Badge tone="success" className="bg-transparent px-0">Active</Badge> : <Badge>Inactive</Badge>}
                        <EditedTag edited={d.edited} compact />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <MobileList className="sm:hidden">
            {q.data.map((d) => (
              <MobileListItem key={d.id} onClick={() => edit(d)} className={cn(!d.isActive && "text-fg-muted")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{d.name}</span>
                  <span className="num shrink-0 text-[13px] font-semibold">{formatINR(d.defaultRatePaise)}</span>
                </div>
                <div className="flex justify-between gap-2 text-xs text-fg-muted">
                  <span className="truncate">{[d.code, d.jobWorkType?.name, `${d.jobCount ?? 0} challans`].filter(Boolean).join(" · ")}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <EditedTag edited={d.edited} compact />
                    {!d.isActive && <Badge>Inactive</Badge>}
                  </span>
                </div>
              </MobileListItem>
            ))}
          </MobileList>
          </>
        )}
      </Card>
      <DesignDialog open={open} onOpenChange={setOpen} design={editing} />
    </>
  );
}
