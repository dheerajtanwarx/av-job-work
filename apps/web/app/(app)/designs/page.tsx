"use client";

import { formatINR, type Design } from "@av/shared";
import { Palette, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DesignDialog } from "@/components/forms/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { useDesigns } from "@/lib/queries";
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
        subtitle="Types of work and their usual rate. The rate can still change per job."
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
            The kinds of work you pay for, like Floral Design at ₹20 a piece.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Design</th>
                  <th>Code</th>
                  <th className="r">Default rate</th>
                  <th className="r">Used in jobs</th>
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
                    <td>{d.isActive ? <Badge tone="success" className="bg-transparent px-0">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <DesignDialog open={open} onOpenChange={setOpen} design={editing} />
    </>
  );
}
