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

export default function DesignsPage() {
  const q = useDesigns(false);
  const [editing, setEditing] = useState<Design | null>(null);
  const [open, setOpen] = useState(false);
  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  return (
    <>
      <PageHeader
        eyebrow="Setup"
        title="Designs"
        subtitle="Types of work and their usual rate. You can still change the rate on each job."
        actions={<Button onClick={openNew}><Plus /> Add design</Button>}
      />
      <Card>
        {q.isPending ? (
          <LoadingBlock />
        ) : q.isError ? (
          <div className="p-5"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></div>
        ) : q.data.length === 0 ? (
          <EmptyState icon={Palette} title="No designs yet" action={<Button onClick={openNew}><Plus /> Add your first design</Button>}>
            Designs are the kinds of work you pay for, like Floral Design at ₹20 a piece.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr><th>Design</th><th>Code</th><th className="r">Default rate</th><th className="r">Used in jobs</th><th>Status</th></tr>
              </thead>
              <tbody>
                {q.data.map((d) => (
                  <tr key={d.id} className="row-link" onClick={() => { setEditing(d); setOpen(true); }}>
                    <td className="font-semibold">{d.name}{d.description && <div className="text-sm font-normal text-muted">{d.description}</div>}</td>
                    <td className="text-muted">{d.code ?? "—"}</td>
                    <td className="r num font-semibold">{formatINR(d.defaultRatePaise)}</td>
                    <td className="r num">
                      {d.jobCount ? (
                        <Link className="text-indigo underline-offset-2 hover:underline" href={`/jobs?designId=${d.id}`} onClick={(e) => e.stopPropagation()}>
                          {d.jobCount}
                        </Link>
                      ) : (
                        0
                      )}
                    </td>
                    <td>{d.isActive ? <Badge tone="leaf">Active</Badge> : <Badge>Inactive</Badge>}</td>
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
