"use client";

import { formatINR, formatQty, L, type MaterialRow } from "@av/shared";
import { Boxes, MinusCircle, PackagePlus, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MovementLedger } from "@/components/jobs/movement-ledger";
import { MaterialDialog, StockMovementDialog, type StockAction } from "@/components/forms/master-dialogs";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, TableWrap } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { CardListSkeleton, EmptyState, ErrorBlock, KeyValues, LoadingBlock, Metric, MetricStrip, PageHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { Tabs } from "@/components/ui/tabs";
import { SearchInput, Toolbar } from "@/components/ui/toolbar";
import { useMaterials } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function MaterialsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"materials" | "movements">("materials");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<"true" | "false" | "">("true");
  const list = useMaterials({ active: active === "" ? undefined : active === "true", q: q || undefined });
  const [dialog, setDialog] = useState<{ kind: "material"; material: MaterialRow | null } | { kind: "stock"; material: MaterialRow; action: StockAction } | null>(null);

  const rows = list.data ?? [];
  const sums = { out: 0, withWorkers: 0, empty: 0 };
  for (const m of rows) {
    sums.out += m.outsideValuePaise;
    if (m.stock.withWorkers > 0) sums.withWorkers++;
    if (m.stock.available <= 0) sums.empty++;
  }

  const actions = (m: MaterialRow) => (
    <Menu label={`Actions for ${m.name}`}>
      <MenuItem icon={<PackagePlus />} onSelect={() => setDialog({ kind: "stock", material: m, action: "RECEIPT" })}>
        Receive stock
      </MenuItem>
      <MenuItem icon={<MinusCircle />} onSelect={() => setDialog({ kind: "stock", material: m, action: "ADJUSTMENT" })}>
        Adjust stock
      </MenuItem>
      <MenuItem icon={<Pencil />} onSelect={() => setDialog({ kind: "material", material: m })}>
        Edit material
      </MenuItem>
    </Menu>
  );

  return (
    <>
      <PageHeader
        title="Materials & Stock"
        subtitle="Raw material in the warehouse and with job workers."
        actions={
          <Button onClick={() => setDialog({ kind: "material", material: null })}>
            <Plus /> Add material
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: "materials", label: L.materials, count: list.data?.length },
          { value: "movements", label: "Stock movements" },
        ]}
      />

      {tab === "movements" ? (
        <MovementLedger showMaterial />
      ) : (
        <>
          {rows.length > 0 && (
            <MetricStrip className="mb-4 grid-cols-2 sm:grid-cols-4">
              <Metric label={L.materials} value={formatQty(rows.length)} />
              <Metric label="With job workers" value={formatQty(sums.withWorkers)} sub="materials partly outside" />
              <Metric label="Value outside" value={formatINR(sums.out)} sub="at challan rates" />
              <Metric label="Out of stock" value={formatQty(sums.empty)} tone={sums.empty ? "warning" : "fg"} sub="nothing in warehouse" />
            </MetricStrip>
          )}
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Code, name, lot, roll, colour…" label="Search materials" />
            <Segmented
              label="Show"
              value={active}
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
            ) : rows.length === 0 ? (
              <EmptyState
                icon={q ? Search : Boxes}
                title={q ? "No matching materials" : "No materials yet"}
                action={
                  !q && (
                    <Button onClick={() => setDialog({ kind: "material", material: null })}>
                      <Plus /> Add material
                    </Button>
                  )
                }
              >
                {!q && "Add the fabric, sarees or blouses you issue to job workers, with their opening stock."}
              </EmptyState>
            ) : (
              <div className={list.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <TableWrap className="max-sm:hidden">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Material</th>
                        <th>Lot / roll</th>
                        <th>Unit</th>
                        <th className="r">In warehouse</th>
                        <th className="r">With workers</th>
                        <th className="r">Damaged held</th>
                        <th className="r">Value outside</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m) => (
                        <tr key={m.id} className={cn("row-link", !m.isActive && "text-fg-muted")} onClick={() => router.push(`/materials/${m.id}`)}>
                          <td className="num whitespace-nowrap">
                            <Link href={`/materials/${m.id}`} className="font-medium hover:text-accent" onClick={(e) => e.stopPropagation()}>
                              {m.code}
                            </Link>
                          </td>
                          <td className="max-w-64">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{m.name}</span>
                              {!m.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
                            </div>
                            <div className="truncate text-xs text-fg-muted">{[m.fabricType, m.color, m.product?.name].filter(Boolean).join(" · ") || "—"}</div>
                          </td>
                          <td className="num text-xs text-fg-muted">{[m.lotNumber && `Lot ${m.lotNumber}`, m.rollNumber && `Roll ${m.rollNumber}`].filter(Boolean).join(" · ") || "—"}</td>
                          <td className="text-fg-2">{m.unit}</td>
                          <td className={cn("r font-medium", m.stock.available < 0 ? "text-danger" : m.stock.available === 0 && "text-fg-muted")}>{formatQty(m.stock.available)}</td>
                          <td className="r">
                            {m.stock.withWorkers > 0 ? <span className="text-warning">{formatQty(m.stock.withWorkers)}</span> : <span className="text-fg-faint">0</span>}
                            {m.workers > 0 && <div className="text-xs text-fg-muted">{m.workers} worker{m.workers === 1 ? "" : "s"}</div>}
                          </td>
                          <td className={cn("r", m.stock.damagedHeld > 0 ? "text-danger" : "text-fg-faint")}>{formatQty(m.stock.damagedHeld)}</td>
                          <td className="r">{m.outsideValuePaise ? formatINR(m.outsideValuePaise) : <span className="text-fg-faint">—</span>}</td>
                          <td className="r" onClick={(e) => e.stopPropagation()}>
                            {actions(m)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                <MobileList className="sm:hidden">
                  {rows.map((m) => (
                    <li key={m.id} className={cn("flex gap-2 px-4 py-3", !m.isActive && "text-fg-muted")}>
                      <Link href={`/materials/${m.id}`} className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="num text-xs text-fg-muted">{m.code}</span>
                          <span className="truncate text-[13px] font-semibold">{m.name}</span>
                        </div>
                        <div className="truncate text-xs text-fg-muted">{[m.color, m.lotNumber && `Lot ${m.lotNumber}`, m.rollNumber && `Roll ${m.rollNumber}`].filter(Boolean).join(" · ") || m.unit}</div>
                        <KeyValues
                          className="mt-2"
                          items={[
                            { label: `Warehouse (${m.unit})`, value: formatQty(m.stock.available), tone: m.stock.available < 0 ? "danger" : "fg" },
                            { label: "With workers", value: formatQty(m.stock.withWorkers), tone: m.stock.withWorkers ? "warning" : "muted" },
                            { label: "Damaged", value: formatQty(m.stock.damagedHeld), tone: m.stock.damagedHeld ? "danger" : "muted" },
                          ]}
                        />
                      </Link>
                      {actions(m)}
                    </li>
                  ))}
                </MobileList>
              </div>
            )}
          </Card>
        </>
      )}

      <MaterialDialog open={dialog?.kind === "material"} onOpenChange={(o) => !o && setDialog(null)} material={dialog?.kind === "material" ? dialog.material : null} onSaved={(m) => {
          if (dialog?.kind === "material" && !dialog.material) router.push(`/materials/${m.id}`);
        }} />
      <StockMovementDialog open={dialog?.kind === "stock"} onOpenChange={(o) => !o && setDialog(null)} material={dialog?.kind === "stock" ? dialog.material : null} action={dialog?.kind === "stock" ? dialog.action : "RECEIPT"} />
    </>
  );
}

