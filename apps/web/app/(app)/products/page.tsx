"use client";

import type { Product } from "@av/shared";
import { Package, Plus } from "lucide-react";
import { useState } from "react";
import { ProductDialog } from "@/components/forms/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { useProducts } from "@/lib/queries";
import { cn } from "@/lib/utils";

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
      <PageHeader
        title="Products"
        subtitle="Things you send out for work."
        actions={
          <Button onClick={openNew}>
            <Plus /> Add product
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
            icon={Package}
            title="No products yet"
            action={
              <Button onClick={openNew}>
                <Plus /> Add product
              </Button>
            }
          >
            Items you send to job workers, like Saree (PCS), Blouse (PCS) or Fabric (MTR).
          </EmptyState>
        ) : (
          <>
          <TableWrap className="max-sm:hidden">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Unit</th>
                  <th className="r">Challans</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    className={cn("row-link focus-visible:outline-offset-[-2px]", !p.isActive && "text-fg-muted")}
                    onClick={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setEditing(p);
                        setOpen(true);
                      }
                    }}
                  >
                    <td>
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="text-xs text-fg-muted">{p.description}</div>}
                    </td>
                    <td className="num text-fg-muted">{p.code ?? "—"}</td>
                    <td className="text-fg-2">{p.unit}</td>
                    <td className="r">{p.jobCount ?? 0}</td>
                    <td>{p.isActive ? <Badge tone="success" className="bg-transparent px-0">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <MobileList className="sm:hidden">
            {q.data.map((p) => (
              <MobileListItem
                key={p.id}
                onClick={() => {
                  setEditing(p);
                  setOpen(true);
                }}
                className={cn(!p.isActive && "text-fg-muted")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs font-medium text-fg-2">{p.unit}</span>
                </div>
                <div className="flex justify-between gap-2 text-xs text-fg-muted">
                  <span className="truncate">{[p.code, `${p.jobCount ?? 0} challans`].filter(Boolean).join(" · ")}</span>
                  {!p.isActive && <Badge>Inactive</Badge>}
                </div>
              </MobileListItem>
            ))}
          </MobileList>
          </>
        )}
      </Card>
      <ProductDialog open={open} onOpenChange={setOpen} product={editing} />
    </>
  );
}
