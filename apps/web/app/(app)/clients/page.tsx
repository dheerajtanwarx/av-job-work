"use client";

import { formatINR, formatQty, type ClientListRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientDialog } from "@/components/forms/master-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
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
      <PageHeader title="Clients" subtitle="Job workers and parties you send material to." actions={<Button onClick={() => setOpen(true)}><Plus /> Add client</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone…" className="pl-9" />
        </div>
        <Select value={active} onChange={(e) => setActive(e.target.value)} className="w-40">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </Select>
      </div>
      <Card>
        {list.isPending ? (
          <LoadingBlock />
        ) : list.isError ? (
          <div className="p-5"><ErrorBlock error={list.error} onRetry={() => list.refetch()} /></div>
        ) : list.data.length === 0 ? (
          <EmptyState icon={Users} title={q ? "No clients match" : "No clients yet"} action={!q && <Button onClick={() => setOpen(true)}><Plus /> Add your first client</Button>}>
            {q ? "Try a different name or phone number." : "Add the embroidery, printing or stitching units you send work to."}
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr><th>Client</th><th>Phone</th><th className="r">Active jobs</th><th className="r">Pieces outside</th><th className="r">Outstanding</th></tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => router.push(`/clients/${c.id}`)}>
                    <td>
                      <div className="font-semibold">{c.name} {!c.isActive && <Badge className="ml-1">Inactive</Badge>}</div>
                      {c.businessName && <div className="text-sm text-muted">{c.businessName}</div>}
                    </td>
                    <td className="text-muted">{c.phone ?? "—"}</td>
                    <td className="r num">{c.activeJobs}</td>
                    <td className="r num">{c.pendingPieces > 0 ? <span className="font-semibold text-marigold-700">{formatQty(c.pendingPieces)}</span> : <span className="text-faint">0</span>}</td>
                    <td className="r num">{c.outstandingPaise > 0 ? <span className="font-semibold text-madder">{formatINR(c.outstandingPaise)}</span> : <span className="text-faint">—</span>}</td>
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
