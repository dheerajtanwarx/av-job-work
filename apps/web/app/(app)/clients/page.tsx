"use client";

import { formatINR, formatQty, L, type ClientListRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Phone, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientDialog } from "@/components/forms/master-dialogs";
import { WorkerAvatar } from "@/components/workers/worker-docs";
import { termsLabel } from "@/components/forms/payment-terms";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { CardListSkeleton, EmptyState, ErrorBlock, KeyValues, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { SearchInput, Toolbar } from "@/components/ui/toolbar";
import { api, qs } from "@/lib/api";
import { useSettings } from "@/lib/queries";
import { EditedTag } from "@/components/ui/edited";
import { cn } from "@/lib/utils";

export default function ClientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("true");
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const list = useQuery({ queryKey: ["clients", "list", q, active], queryFn: () => api.get<ClientListRow[]>(`/clients${qs({ q, active })}`), placeholderData: (p) => p });
  const def = settings.data ? `Default (${termsLabel(settings.data.defaultPaymentPolicy, settings.data.defaultPaymentDays)})` : "Default";
  const terms = (c: ClientListRow) => (c.paymentPolicy ? termsLabel(c.paymentPolicy, c.paymentDays) : def);

  return (
    <>
      <PageHeader
        title={L.clients}
        subtitle="Embroidery, printing and stitching units you issue material to."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Add {L.client.toLowerCase()}
          </Button>
        }
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, code or mobile…" label={`Search ${L.clients.toLowerCase()}`} />
        <Segmented
          label="Show"
          value={active as "true" | "false" | ""}
          onChange={setActive}
          options={[
            { value: "true", label: "Active" },
            { value: "false", label: "Archived" },
            { value: "", label: "All" },
          ]}
        />
        {list.data && list.data.length > 0 && <span className="num ml-auto hidden text-xs text-fg-muted sm:inline">{list.data.length} workers</span>}
      </Toolbar>
      <Card className="overflow-hidden">
        {list.isPending ? (
          <>
            <div className="max-sm:hidden">
              <LoadingBlock rows={6} />
            </div>
            <CardListSkeleton className="sm:hidden" />
          </>
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={q ? Search : Users}
            title={q ? `No matching ${L.clients.toLowerCase()}` : active === "false" ? "No archived workers" : `No ${L.clients.toLowerCase()} yet`}
            action={
              !q &&
              active !== "false" && (
                <Button onClick={() => setOpen(true)}>
                  <Plus /> Add {L.client.toLowerCase()}
                </Button>
              )
            }
          >
            {!q && active !== "false" && "Add the embroidery, printing or stitching units you send work to."}
          </EmptyState>
        ) : (
          <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <TableWrap className="max-sm:hidden">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>{L.client}</th>
                    <th>Mobile</th>
                    <th>Work / items</th>
                    <th>Payment terms</th>
                    <th className="r">Active challans</th>
                    <th className="r">Pending qty</th>
                    <th className="r">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((c) => (
                    <tr key={c.id} className={cn("row-link", !c.isActive && "text-fg-muted")} onClick={() => router.push(`/clients/${c.id}`)}>
                      <td className="num whitespace-nowrap text-fg-muted">{c.workerCode}</td>
                      <td className="max-w-72">
                        <div className="flex items-center gap-2.5">
                          <WorkerAvatar photoId={c.photoId} name={c.name} className="size-8" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/clients/${c.id}`} className="truncate font-medium hover:text-accent" onClick={(e) => e.stopPropagation()}>
                                {c.name}
                              </Link>
                              {!c.isActive && <StatusBadge tone="neutral">Archived</StatusBadge>}
                              <EditedTag edited={c.edited} compact />
                            </div>
                            {c.businessName && <div className="truncate text-xs text-fg-muted">{c.businessName}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="num text-fg-muted">{c.phone ?? "—"}</td>
                      <td className="max-w-48 truncate text-xs text-fg-2">{c.workItems ?? <span className="text-fg-faint">—</span>}</td>
                      <td className={cn("text-xs", c.paymentPolicy ? "text-fg-2" : "text-fg-muted")}>{terms(c)}</td>
                      <td className="r">{c.activeJobs || <span className="text-fg-faint">0</span>}</td>
                      <td className="r">{c.pendingPieces > 0 ? <span className="font-medium text-warning">{formatQty(c.pendingPieces)}</span> : <span className="text-fg-faint">0</span>}</td>
                      <td className="r">{c.toPayPaise > 0 ? <span className="font-medium text-danger">{formatINR(c.toPayPaise)}</span> : <span className="text-fg-faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <MobileList className="sm:hidden">
              {list.data.map((c) => (
                <MobileListItem key={c.id} href={`/clients/${c.id}`} className={cn(!c.isActive && "text-fg-muted")}>
                  <div className="flex items-start justify-between gap-3">
                    <WorkerAvatar photoId={c.photoId} name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold">{c.name}</span>
                        {!c.isActive && <StatusBadge tone="neutral">Archived</StatusBadge>}
                        <EditedTag edited={c.edited} compact />
                      </div>
                      <div className="num truncate text-xs text-fg-muted">
                        {c.workerCode}
                        {c.phone && (
                          <>
                            {" · "}
                            <Phone className="inline size-3" /> {c.phone}
                          </>
                        )}
                      </div>
                      {c.workItems && <div className="truncate text-xs text-fg-2">{c.workItems}</div>}
                    </div>
                    <span className="shrink-0 text-right text-[11px] text-fg-muted">{terms(c)}</span>
                  </div>
                  <KeyValues
                    className="mt-2"
                    items={[
                      { label: "Active", value: c.activeJobs },
                      { label: "Pending", value: formatQty(c.pendingPieces), tone: c.pendingPieces ? "warning" : "muted" },
                      { label: "Outstanding", value: formatINR(c.toPayPaise), tone: c.toPayPaise ? "danger" : "muted" },
                    ]}
                  />
                </MobileListItem>
              ))}
            </MobileList>
          </div>
        )}
      </Card>
      <ClientDialog open={open} onOpenChange={setOpen} onSaved={(c) => router.push(`/clients/${c.id}`)} />
    </>
  );
}
