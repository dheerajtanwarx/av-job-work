"use client";

import type { Product } from "@av/shared";
import { Package, Plus } from "lucide-react";
import { useState } from "react";
import { ProductDialog } from "@/components/forms/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { useProducts } from "@/lib/queries";

export default function ProductsPage() {
  const q = useProducts(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  return (
    <>
      <PageHeader eyebrow="Setup" title="Products" subtitle="Things you send out for work." actions={<Button onClick={openNew}><Plus /> Add product</Button>} />
      <Card>
        {q.isPending ? (
          <LoadingBlock />
        ) : q.isError ? (
          <div className="p-5"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></div>
        ) : q.data.length === 0 ? (
          <EmptyState icon={Package} title="No products yet" action={<Button onClick={openNew}><Plus /> Add your first product</Button>}>
            Add the items you send to job workers, like Plain Blouse, Saree or Dupatta.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr><th>Name</th><th>Code</th><th>Unit</th><th className="r">Jobs</th><th>Status</th></tr>
              </thead>
              <tbody>
                {q.data.map((p) => (
                  <tr key={p.id} className="row-link" onClick={() => { setEditing(p); setOpen(true); }}>
                    <td className="font-semibold">{p.name}{p.description && <div className="text-sm font-normal text-muted">{p.description}</div>}</td>
                    <td className="text-muted">{p.code ?? "—"}</td>
                    <td>{p.unit}</td>
                    <td className="r num">{p.jobCount ?? 0}</td>
                    <td>{p.isActive ? <Badge tone="leaf">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <ProductDialog open={open} onOpenChange={setOpen} product={editing} />
    </>
  );
}
