"use client";

import { formatDate, formatQty, formatTime, MOVEMENT_TYPE_LABEL, roundQty, STOCK_MOVEMENT_TYPES, type MaterialMovementRow } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, TableWrap } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Select } from "@/components/ui/input";
import { CardListSkeleton, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { api, qs } from "@/lib/api";
import { useClients, useMaterials } from "@/lib/queries";
import { cn } from "@/lib/utils";

const typeTone: Record<string, Tone> = {
  RECEIPT: "success",
  ADJUSTMENT_IN: "info",
  ADJUSTMENT_OUT: "orange",
  INITIAL: "info",
  ADDITIONAL: "info",
  REWORK: "yellow",
  RETURN: "success",
  DAMAGED: "danger",
  REJECTED: "danger",
  LOST: "danger",
};

const isWarehouseEntry = (t: string) => (STOCK_MOVEMENT_TYPES as readonly string[]).includes(t);

/**
 * The unified material movement ledger (warehouse receipts/adjustments + every issue and return on challans).
 * With `materialId`, shows a running warehouse balance when no date filter is applied.
 */
export function MovementLedger({ materialId, showMaterial }: { materialId?: string; showMaterial?: boolean }) {
  const qc = useQueryClient();
  const [range, setRange] = useState({ from: "", to: "" });
  const [mat, setMat] = useState("");
  const [clientId, setClientId] = useState("");
  const [voiding, setVoiding] = useState<MaterialMovementRow | null>(null);
  const materials = useMaterials();
  const clients = useClients(false);
  const filter = { materialId: materialId ?? (mat || undefined), clientId: clientId || undefined, from: range.from || undefined, to: range.to || undefined };
  const q = useQuery({
    queryKey: ["materials", "movements", filter],
    queryFn: () => api.get<MaterialMovementRow[]>(`/stock/movements${qs(filter)}`),
    placeholderData: (p) => p,
  });
  const voidMv = useMutation({
    mutationFn: (reason: string) => api.post(`/stock/movements/${voiding!.id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast.success("Stock entry voided");
      setVoiding(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  // Running warehouse balance (rows are newest first) – only meaningful for one material over all time.
  const balance = new Map<string, number>();
  const showBalance = !!materialId && !range.from && !range.to && !clientId;
  if (showBalance) {
    let b = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      b = roundQty(b + rows[i].warehouseEffect);
      balance.set(rows[i].id, b);
    }
  }

  const effect = (r: MaterialMovementRow) =>
    r.warehouseEffect === 0 ? (
      <span className="text-fg-faint">0</span>
    ) : (
      <span className={r.warehouseEffect > 0 ? "text-success" : "text-danger"}>
        {r.warehouseEffect > 0 ? "+" : "−"}
        {formatQty(Math.abs(r.warehouseEffect))}
      </span>
    );
  const refLink = (r: MaterialMovementRow) =>
    r.returnId && r.job ? (
      <Link href={`/returns/${r.returnId}`} className="hover:text-accent">
        {r.ref} · {r.job.jobNumber}
      </Link>
    ) : r.job ? (
      <Link href={`/jobs/${r.job.id}`} className="hover:text-accent">
        {r.ref && r.ref !== r.job.jobNumber ? `${r.ref} · ${r.job.jobNumber}` : r.job.jobNumber}
      </Link>
    ) : (
      (r.ref ?? "—")
    );

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        {!materialId && (
          <Select value={mat} onChange={(e) => setMat(e.target.value)} className="w-full sm:w-56" aria-label="Material">
            <option value="">All materials</option>
            {materials.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name}
              </option>
            ))}
          </Select>
        )}
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full sm:w-48" aria-label="Job worker">
          <option value="">Warehouse & all workers</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
      </div>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <>
            <div className="max-sm:hidden">
              <LoadingBlock rows={6} />
            </div>
            <CardListSkeleton className="sm:hidden" />
          </>
        ) : q.isError ? (
          <div className="p-4">
            <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="No movements">
            Stock received, adjustments, issues to workers and returns show up here.
          </EmptyState>
        ) : (
          <div className={q.isPlaceholderData ? "opacity-60" : undefined}>
            <TableWrap className="max-sm:hidden">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    {showMaterial && <th>Material</th>}
                    <th>Worker / ref</th>
                    <th className="r">Qty</th>
                    <th className="r">Warehouse</th>
                    {showBalance && <th className="r">Balance</th>}
                    <th>Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={cn(r.voided && "text-fg-muted")}>
                      <td className="num whitespace-nowrap">
                        {formatDate(r.date)}
                        <div className="text-xs text-fg-muted">{formatTime(r.at)}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        <StatusBadge tone={r.voided ? "neutral" : (typeTone[r.type] ?? "neutral")}>{MOVEMENT_TYPE_LABEL[r.type] ?? r.type}</StatusBadge>
                        {r.voided && <div className="mt-0.5 text-[11px] font-semibold text-danger">VOID</div>}
                      </td>
                      {showMaterial && (
                        <td className="max-w-48 truncate">
                          <Link href={`/materials/${r.materialId}`} className="hover:text-accent">
                            {r.materialName}
                          </Link>
                        </td>
                      )}
                      <td className="max-w-56">
                        {r.client ? (
                          <Link href={`/clients/${r.client.id}`} className="block truncate hover:text-accent">
                            {r.client.name}
                          </Link>
                        ) : (
                          <span className="text-fg-muted">Warehouse</span>
                        )}
                        <div className="truncate text-xs text-fg-muted">
                          {refLink(r)}
                          {r.designName && ` · ${r.designName}`}
                        </div>
                      </td>
                      <td className={cn("r whitespace-nowrap", r.voided && "line-through")}>
                        {formatQty(r.qty)} <span className="text-xs text-fg-muted">{r.unit}</span>
                      </td>
                      <td className="r">{effect(r)}</td>
                      {showBalance && <td className="r font-medium">{formatQty(balance.get(r.id) ?? 0)}</td>}
                      <td className="max-w-56">
                        <div className="truncate text-xs text-fg-muted" title={r.notes ?? undefined}>
                          {r.notes ?? ""}
                        </div>
                        {r.enteredBy && <div className="text-[11px] text-fg-faint">by {r.enteredBy}</div>}
                      </td>
                      <td className="r">
                        {isWarehouseEntry(r.type) && !r.voided && (
                          <Button size="sm" variant="danger-ghost" onClick={() => setVoiding(r)}>
                            Void
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <MobileList className="sm:hidden">
              {rows.map((r) => (
                <li key={r.id} className={cn("px-4 py-3", r.voided && "text-fg-muted")}>
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge tone={r.voided ? "neutral" : (typeTone[r.type] ?? "neutral")}>
                      {MOVEMENT_TYPE_LABEL[r.type] ?? r.type}
                      {r.voided && " · VOID"}
                    </StatusBadge>
                    <span className={cn("num text-[13px] font-semibold", r.voided && "line-through")}>
                      {formatQty(r.qty)} {r.unit}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[13px]">
                    {showMaterial && `${r.materialName} · `}
                    {r.client?.name ?? "Warehouse"}
                  </div>
                  <div className="num flex justify-between gap-2 text-xs text-fg-muted">
                    <span className="truncate">
                      {formatDate(r.date)} · {formatTime(r.at)} · {refLink(r)}
                    </span>
                    <span className="shrink-0">
                      WH {effect(r)}
                      {showBalance && ` · bal ${formatQty(balance.get(r.id) ?? 0)}`}
                    </span>
                  </div>
                  {r.notes && <div className="mt-0.5 truncate text-xs text-fg-muted">{r.notes}</div>}
                  {isWarehouseEntry(r.type) && !r.voided && (
                    <Button size="md" variant="danger-ghost" className="mt-1 -ml-3" onClick={() => setVoiding(r)}>
                      Void entry
                    </Button>
                  )}
                </li>
              ))}
            </MobileList>
          </div>
        )}
      </Card>
      {rows.length >= 1000 && <p className="text-xs text-fg-muted">Showing the latest 1,000 movements. Narrow the dates to see older ones.</p>}
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title={`Void this ${voiding ? (MOVEMENT_TYPE_LABEL[voiding.type] ?? "").toLowerCase() : "entry"}?`}
        description={voiding ? `${formatQty(voiding.qty)} ${voiding.unit} of ${voiding.materialName} on ${formatDate(voiding.date)}. The entry stays in the ledger marked VOID and stock is recalculated.` : undefined}
        confirmLabel="Void entry"
        loading={voidMv.isPending}
        onConfirm={(r) => voidMv.mutate(r)}
      />
    </div>
  );
}
