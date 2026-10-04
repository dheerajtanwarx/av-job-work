"use client";

import { formatINR, formatQty, type ClientListRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientDialog } from "@/components/forms/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { SearchInput, Toolbar } from "@/components/ui/toolbar";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api, qs } from "@/lib/api";

export default function ClientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("true");
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ["clients", "list", q, active], queryFn: () => api.get<ClientListRow[]>(`/clients${qs({ q, active })}`), placeholderData: (p) => p });

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Job workers and parties you send material to."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Add client
          </Button>
        }
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Name or phone…" label="Search clients" />
        <Segmented
          label="Show"
          value={active as "true" | "false" | ""}
          onChange={setActive}
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
            { value: "", label: "All" },
          ]}
        />
      </Toolbar>
      <Card className="overflow-hidden">
        {list.isPending ? (
          <LoadingBlock rows={6} />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={q ? Search : Users}
            title={q ? "No matching clients" : "No clients yet"}
            action={
              !q && (
                <Button onClick={() => setOpen(true)}>
                  <Plus /> Add client
                </Button>
              )
            }
          >
            {!q && "Add the embroidery, printing or stitching units you send work to."}
          </EmptyState>
        ) : (
          <TableWrap className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Phone</th>
                  <th className="r">Active jobs</th>
                  <th className="r">Pieces outside</th>
                  <th className="r">To pay</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className={cn("row-link", !c.isActive && "text-fg-muted")} onClick={() => router.push(`/clients/${c.id}`)}>
                    <td className="max-w-72">
                      <div className="flex items-center gap-2">
                        <Link href={`/clients/${c.id}`} className="truncate font-medium hover:text-accent" onClick={(e) => e.stopPropagation()}>
                          {c.name}
                        </Link>
                        {!c.isActive && <Badge>Inactive</Badge>}
                      </div>
                      {c.businessName && <div className="truncate text-xs text-fg-muted">{c.businessName}</div>}
                    </td>
                    <td className="num text-fg-muted">{c.phone ?? "—"}</td>
                    <td className="r">{c.activeJobs || <span className="text-fg-faint">0</span>}</td>
                    <td className="r">{c.pendingPieces > 0 ? <span className="font-medium text-warning">{formatQty(c.pendingPieces)}</span> : <span className="text-fg-faint">0</span>}</td>
                    <td className="r">{c.toPayPaise > 0 ? <span className="font-medium text-danger">{formatINR(c.toPayPaise)}</span> : <span className="text-fg-faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <ClientDialog open={open} onOpenChange={setOpen} onSaved={(c) => router.push(`/clients/${c.id}`)} />
    </>
  );
}
