import { prisma, type Prisma } from "@av/db";
import { OPEN_JOB_STATUSES, roundQty, type MaterialMovementRow, type MaterialRow, type StockPosition, type Unit } from "@av/shared";
import { userNames, withEdited } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { loadJobs, summarizeJobItems } from "./jobs.js";
import { num } from "./ledger.js";
import { stockPositions } from "./stock.js";

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function materialRows(f: { id?: string; q?: string; active?: boolean; simple?: boolean }): Promise<MaterialRow[]> {
  const where: Prisma.MaterialWhereInput = { id: f.id, isActive: f.active };
  if (f.q) where.OR = [{ name: ci(f.q) }, { code: ci(f.q) }, { lotNumber: ci(f.q) }, { rollNumber: ci(f.q) }, { color: ci(f.q) }, { fabricType: ci(f.q) }, { supplier: ci(f.q) }];
  const materials = await prisma.material.findMany({ where, include: { product: { select: { id: true, name: true } }, design: { select: { id: true, name: true } } }, orderBy: { name: "asc" } });
  const ids = materials.map((m) => m.id);
  const [stock, jobs] = await Promise.all([
    stockPositions(prisma, ids),
    f.simple ? Promise.resolve([]) : loadJobs(prisma, { status: { in: OPEN_JOB_STATUSES }, items: { some: { materialId: { in: ids } } } }),
  ]);
  const outside = new Map<string, { value: number; workers: Set<string> }>();
  for (const j of jobs) {
    for (const it of summarizeJobItems(j)) {
      if (!it.material || it.pending <= 0) continue;
      const o = outside.get(it.material.id) ?? { value: 0, workers: new Set<string>() };
      o.value += it.pendingValuePaise;
      o.workers.add(j.clientId);
      outside.set(it.material.id, o);
    }
  }
  const empty: StockPosition = { available: 0, damagedHeld: 0, withWorkers: 0, lost: 0 };
  return (await withEdited(prisma, materials)).map((m) => ({
    ...m,
    unit: m.unit as Unit,
    createdAt: m.createdAt.toISOString(),
    stock: stock.get(m.id) ?? empty,
    outsideValuePaise: outside.get(m.id)?.value ?? 0,
    workers: outside.get(m.id)?.workers.size ?? 0,
  }));
}

/**
 * The unified material movement ledger: warehouse receipts/adjustments plus every issue and return
 * on challans, read from their own records so it can never disagree with the challans.
 */
export async function materialLedger(f: { materialId?: string; clientId?: string; from?: string; to?: string; take?: number }): Promise<MaterialMovementRow[]> {
  const date = f.from || f.to ? { gte: f.from ? toDate(f.from) : undefined, lte: f.to ? toDate(f.to) : undefined } : undefined;
  const item = { materialId: f.materialId ?? { not: null } };
  const take = f.take ?? 1000;
  const [moves, dispatchLines, returnLines] = await Promise.all([
    f.clientId ? Promise.resolve([]) : prisma.stockMovement.findMany({ where: { materialId: f.materialId, date }, include: { material: true }, orderBy: { date: "desc" }, take }),
    prisma.dispatchLine.findMany({
      where: { jobItem: item, dispatch: { date, job: { clientId: f.clientId } } },
      include: { dispatch: { include: { job: { select: { id: true, jobNumber: true, client: { select: { id: true, name: true } } } } } }, jobItem: { include: { material: true } } },
      orderBy: { dispatch: { date: "desc" } },
      take,
    }),
    prisma.returnLine.findMany({
      where: { jobItem: item, return: { date, job: { clientId: f.clientId } } },
      include: { return: { include: { job: { select: { id: true, jobNumber: true, client: { select: { id: true, name: true } } } } } }, jobItem: { include: { material: true } } },
      orderBy: { return: { date: "desc" } },
      take,
    }),
  ]);
  const names = await userNames(prisma, [...moves.map((m) => m.enteredById), ...dispatchLines.map((d) => d.dispatch.enteredById), ...returnLines.map((r) => r.return.enteredById)]);
  const who = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const rows: MaterialMovementRow[] = [];
  for (const m of moves) {
    const q = num(m.qty);
    rows.push({
      id: m.id,
      type: m.type,
      date: m.date.toISOString(),
      at: m.createdAt.toISOString(),
      qty: q,
      warehouseEffect: m.voidedAt ? 0 : m.type === "ADJUSTMENT_OUT" ? -q : q,
      unit: m.material.unit as Unit,
      materialId: m.materialId,
      materialName: m.material.name,
      job: null,
      client: null,
      designName: null,
      ref: null,
      returnId: null,
      notes: m.voidedAt ? `Voided: ${m.voidReason}` : m.reason,
      enteredBy: who(m.enteredById),
      voided: !!m.voidedAt,
    });
  }
  for (const d of dispatchLines) {
    const q = num(d.qty);
    const mat = d.jobItem.material!;
    rows.push({
      id: d.id,
      type: d.dispatch.kind,
      date: d.dispatch.date.toISOString(),
      at: d.dispatch.createdAt.toISOString(),
      qty: q,
      warehouseEffect: d.dispatch.voidedAt || d.dispatch.kind === "REWORK" ? 0 : -q,
      unit: mat.unit as Unit,
      materialId: mat.id,
      materialName: mat.name,
      job: { id: d.dispatch.job.id, jobNumber: d.dispatch.job.jobNumber },
      client: d.dispatch.job.client,
      designName: d.jobItem.designName,
      ref: d.dispatch.job.jobNumber,
      returnId: null,
      notes: d.dispatch.voidedAt ? `Voided: ${d.dispatch.voidReason}` : d.dispatch.notes,
      enteredBy: who(d.dispatch.enteredById),
      voided: !!d.dispatch.voidedAt,
    });
  }
  for (const r of returnLines) {
    const mat = r.jobItem.material!;
    const parts = [
      ["RETURN", num(r.okQty)],
      ["DAMAGED", num(r.damagedQty)],
      ["REJECTED", num(r.rejectedQty)],
      ["LOST", num(r.lostQty)],
    ] as const;
    for (const [type, q] of parts) {
      if (q <= 0) continue;
      rows.push({
        id: `${r.id}:${type}`,
        type,
        date: r.return.date.toISOString(),
        at: r.return.receivedAt.toISOString(),
        qty: q,
        warehouseEffect: r.return.voidedAt || type !== "RETURN" ? 0 : q,
        unit: mat.unit as Unit,
        materialId: mat.id,
        materialName: mat.name,
        job: { id: r.return.job.id, jobNumber: r.return.job.jobNumber },
        client: r.return.job.client,
        designName: r.jobItem.designName,
        ref: r.return.returnNumber,
        returnId: r.returnId,
        notes: r.return.voidedAt ? `Voided: ${r.return.voidReason}` : (r.exceptionReason ?? r.return.notes),
        enteredBy: who(r.return.enteredById),
        voided: !!r.return.voidedAt,
      });
    }
  }
  rows.sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || b.at.localeCompare(a.at));
  return rows.slice(0, take).map((r) => ({ ...r, qty: roundQty(r.qty) }));
}
