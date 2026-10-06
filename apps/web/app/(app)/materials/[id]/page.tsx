"use client";

import { formatDate, formatINR, formatQty, L, roundQty, type MaterialMovementRow, type MaterialRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { MinusCircle, PackagePlus, Pencil, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { MaterialDialog, StockMovementDialog, type StockAction } from "@/components/forms/master-dialogs";
import { MovementLedger } from "@/components/jobs/movement-ledger";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { EmptyState, ErrorBlock, Metric, MetricStrip, PageSkeleton } from "@/components/ui/misc";
import { api, qs } from "@/lib/api";
import { EditedTag } from "@/components/ui/edited";
import { cn } from "@/lib/utils";

const OUT = new Set(["INITIAL", "ADDITIONAL", "REWORK"]);
const BACK = new Set(["RETURN", "DAMAGED", "REJECTED", "LOST"]);

export default function MaterialPage() {
  const { id } = useParams<{ id: string }>();
  const one = useQuery({ queryKey: ["materials", id], queryFn: () => api.get<MaterialRow>(`/materials/${id}`) });
  const [edit, setEdit] = useState(false);
  const [stock, setStock] = useState<StockAction | null>(null);
  // All-time movements (same query key as the unfiltered ledger below, so it is fetched once).
  const filter = { materialId: id };
  const moves = useQuery({ queryKey: ["materials", "movements", filter], queryFn: () => api.get<MaterialMovementRow[]>(`/stock/movements${qs(filter)}`) });

  if (one.isPending) return <PageSkeleton rows={6} />;
  if (one.isError) return <ErrorBlock error={one.error} onRetry={() => one.refetch()} />;
  const m = one.data;
  const s = m.stock;

  // Quantity with each worker, from the movement ledger.
  const byWorker = new Map<string, { id: string; name: string; qty: number; challans: Set<string>; since: string }>();
  for (const r of moves.data ?? []) {
    if (r.voided || !r.client) continue;
    const sign = OUT.has(r.type) ? 1 : BACK.has(r.type) ? -1 : 0;
    if (!sign) continue;
    const w = byWorker.get(r.client.id) ?? { id: r.client.id, name: r.client.name, qty: 0, challans: new Set<string>(), since: r.date };
    w.qty = roundQty(w.qty + sign * r.qty);
    if (r.job) w.challans.add(r.job.id);
    if (sign > 0 && r.date < w.since) w.since = r.date;
    byWorker.set(r.client.id, w);
  }
  const workers = [...byWorker.values()].filter((w) => w.qty > 0).sort((a, b) => b.qty - a.qty);
  const total = roundQty(Math.max(0, s.available) + s.withWorkers + s.damagedHeld);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/materials" className="hover:text-fg">
              Materials & Stock
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{m.name}</h1>
            <span className="num text-[13px] text-fg-muted">{m.code}</span>
            {!m.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
            <EditedTag edited={m.edited} />
          </div>
          <div className="mt-0.5 text-[13px] text-fg-muted">
            {[
              m.unit,
              m.fabricType,
              m.color,
              m.product?.name,
              m.design && `Design: ${m.design.name}`,
              m.lotNumber && `Lot ${m.lotNumber}`,
              m.rollNumber && `Roll ${m.rollNumber}`,
              m.supplier && `Supplier: ${m.supplier}`,
              m.location && `At: ${m.location}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {m.notes && <div className="mt-0.5 text-xs text-fg-muted">{m.notes}</div>}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button onClick={() => setStock("RECEIPT")} className="max-sm:flex-1">
            <PackagePlus /> Receive stock
          </Button>
          <Button variant="secondary" onClick={() => setStock("ADJUSTMENT")} className="max-sm:flex-1">
            <MinusCircle /> Adjust
          </Button>
          <Button variant="ghost" onClick={() => setEdit(true)}>
            <Pencil /> Edit
          </Button>
        </div>
      </div>

      <MetricStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="In warehouse" value={`${formatQty(s.available)} ${m.unit}`} tone={s.available < 0 ? "danger" : "fg"} sub="Good stock, ready to issue" />
        <Metric label="With job workers" value={`${formatQty(s.withWorkers)} ${m.unit}`} tone={s.withWorkers ? "warning" : "fg"} sub={`${m.workers} worker${m.workers === 1 ? "" : "s"}`} />
        <Metric label="Damaged / rejected held" value={`${formatQty(s.damagedHeld)} ${m.unit}`} tone={s.damagedHeld ? "danger" : "fg"} sub="Back, not sent for rework" />
        <Metric label="Lost" value={`${formatQty(s.lost)} ${m.unit}`} tone={s.lost ? "danger" : "fg"} sub="Written off" />
        <Metric label="Value outside" value={formatINR(m.outsideValuePaise)} sub="At challan rates" />
      </MetricStrip>

      {total > 0 && (
        <div>
          <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-3" aria-hidden>
            {s.available > 0 && <div className="bg-success" style={{ width: `${(s.available / total) * 100}%` }} />}
            {s.withWorkers > 0 && <div className="bg-warning-solid" style={{ width: `${(s.withWorkers / total) * 100}%` }} />}
            {s.damagedHeld > 0 && <div className="bg-danger/70" style={{ width: `${(s.damagedHeld / total) * 100}%` }} />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" />Warehouse</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning-solid" />With workers</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-danger/70" />Damaged held</span>
          </div>
        </div>
      )}

      <Section title="Stock position by location" description="Warehouse vs each job worker">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            <li className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
              <div>
                <div className="text-[13px] font-medium">Warehouse</div>
                <div className="text-xs text-fg-muted">{m.location ?? "Good stock"}</div>
              </div>
              <div className={cn("num text-[15px] font-semibold", s.available < 0 && "text-danger")}>
                {formatQty(s.available)} <span className="text-xs font-normal text-fg-muted">{m.unit}</span>
              </div>
            </li>
            {s.damagedHeld > 0 && (
              <li className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <div className="text-[13px] font-medium">Warehouse – damaged / rejected</div>
                  <div className="text-xs text-fg-muted">Can be sent for rework</div>
                </div>
                <div className="num text-[15px] font-semibold text-danger">
                  {formatQty(s.damagedHeld)} <span className="text-xs font-normal text-fg-muted">{m.unit}</span>
                </div>
              </li>
            )}
            {moves.isPending ? (
              <li className="px-4 py-3 text-xs text-fg-muted">Loading workers…</li>
            ) : workers.length === 0 ? (
              <li>
                <EmptyState icon={Users} title="Nothing with job workers" className="py-6" />
              </li>
            ) : (
              workers.map((w) => (
                <li key={w.id}>
                  <Link href={`/clients/${w.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{w.name}</div>
                      <div className="num text-xs text-fg-muted">
                        {w.challans.size} {w.challans.size === 1 ? L.job.toLowerCase() : L.jobs.toLowerCase()} · since {formatDate(w.since)}
                      </div>
                    </div>
                    <div className="num text-[15px] font-semibold text-warning">
                      {formatQty(w.qty)} <span className="text-xs font-normal text-fg-muted">{m.unit}</span>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </Card>
      </Section>

      <Section title="Movement ledger" description="Receipts, adjustments, issues and returns">
        <MovementLedger materialId={m.id} />
      </Section>

      <MaterialDialog open={edit} onOpenChange={setEdit} material={m} />
      <StockMovementDialog open={!!stock} onOpenChange={(o) => !o && setStock(null)} material={m} action={stock ?? "RECEIPT"} />
    </div>
  );
}
