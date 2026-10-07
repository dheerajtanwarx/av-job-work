import { all, db, type Dispatch, type DispatchLine, type Filter, type JobItem, type Material, type Return, type ReturnLine, type StockMovement } from "@av/db";
import { OPEN_JOB_STATUSES, roundQty, type MaterialMovementRow, type MaterialRow, type StockPosition, type Unit } from "@av/shared";
import { userNames, withEdited } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { loadJobs, summarizeJobItems } from "./jobs.js";
import { ci, range } from "../lib/mongo.js";
import { num } from "./ledger.js";
import { itemIdsWhere } from "./lookups.js";
import { stockPositions } from "./stock.js";

export async function materialRows(f: { id?: string; q?: string; active?: boolean; simple?: boolean }): Promise<MaterialRow[]> {
  const where: Filter = { _id: f.id, isActive: f.active };
  if (f.q) where.$or = [{ name: ci(f.q) }, { code: ci(f.q) }, { lotNumber: ci(f.q) }, { rollNumber: ci(f.q) }, { color: ci(f.q) }, { fabricType: ci(f.q) }, { supplier: ci(f.q) }];
  type Named = { id: string; name: string };
  const found = await db.material.find<Material & { product?: Named | null; design?: Named | null }>(where, {
    populate: [
      { path: "product", select: "name" },
      { path: "design", select: "name" },
    ],
    sort: { name: 1 },
  });
  const materials = found.map((m) => ({ ...m, product: m.product ? { id: m.product.id, name: m.product.name } : null, design: m.design ? { id: m.design.id, name: m.design.name } : null }));
  const ids = materials.map((m) => m.id);
  const [stock, jobs] = await all([
    () => stockPositions(db, ids),
    () => (f.simple ? Promise.resolve([]) : loadJobs(db, { status: { $in: OPEN_JOB_STATUSES }, "items.materialId": { $in: ids } })),
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
  return (await withEdited(db, materials)).map((m) => ({
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
  const date = f.from || f.to ? range(f.from ? toDate(f.from) : null, f.to ? toDate(f.to) : null) : undefined;
  const take = f.take ?? 1000;
  // Challan design lines of this material (or of any material), and the challans they are on.
  const itemIds = await itemIdsWhere(db, { materialId: f.materialId ?? { $ne: null } });
  const jobFilter: Filter = { "items._id": { $in: itemIds }, clientId: f.clientId };
  type JobPart = { id: string; jobNumber: string; clientId: string; client: { id: string; name: string }; items: Pick<JobItem, "id" | "designName" | "materialId">[] };
  const jobs = await db.job.find<JobPart>(jobFilter, { select: "jobNumber clientId items._id items.designName items.materialId", populate: { path: "client", select: "name" } });
  const jobIds = jobs.map((j) => j.id);
  const lineMatch = { "lines.jobItemId": { $in: itemIds } };
  const [moves, dispatchRows, returnRows] = await all([
    () =>
      f.clientId
        ? Promise.resolve([])
        : db.stockMovement.find<StockMovement & { material: Material }>({ materialId: f.materialId, date }, { populate: { path: "material" }, sort: { date: -1 }, limit: take }),
    () =>
      db.dispatch.aggregate<Omit<Dispatch, "lines"> & { line: DispatchLine }>([
        { $match: { jobId: { $in: jobIds }, date, ...lineMatch } },
        { $unwind: "$lines" },
        { $match: lineMatch },
        { $sort: { date: -1 } },
        { $limit: take },
        { $set: { line: "$lines" } },
        { $unset: "lines" },
      ]),
    () =>
      db.return.aggregate<Omit<Return, "lines"> & { line: ReturnLine }>([
        { $match: { jobId: { $in: jobIds }, date, ...lineMatch } },
        { $unwind: "$lines" },
        { $match: lineMatch },
        { $sort: { date: -1 } },
        { $limit: take },
        { $set: { line: "$lines" } },
        { $unset: "lines" },
      ]),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const itemById = new Map(jobs.flatMap((j) => j.items.map((i) => [i.id, i] as const)));
  const materialById = new Map(
    (await db.material.find({ _id: { $in: [...new Set([...itemById.values()].map((i) => i.materialId!))] } })).map((m) => [m.id, m]),
  );
  const jobView = (id: string) => {
    const j = jobById.get(id)!;
    return { id: j.id, jobNumber: j.jobNumber, client: { id: j.client.id, name: j.client.name } };
  };
  const withItem = (jobItemId: string) => {
    const it = itemById.get(jobItemId)!;
    return { ...it, material: materialById.get(it.materialId!)! };
  };
  const dispatchLines = dispatchRows.map(({ line, ...d }) => ({ ...line, dispatch: { ...d, job: jobView(d.jobId) }, jobItem: withItem(line.jobItemId) }));
  const returnLines = returnRows.map(({ line, ...r }) => ({ ...line, returnId: r.id, return: { ...r, job: jobView(r.jobId) }, jobItem: withItem(line.jobItemId) }));
  const names = await userNames(db, [...moves.map((m) => m.enteredById), ...dispatchLines.map((d) => d.dispatch.enteredById), ...returnLines.map((r) => r.return.enteredById)]);
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
