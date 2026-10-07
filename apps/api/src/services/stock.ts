import { all, type DB } from "@av/db";
import { roundQty, stockPosition, type StockInput, type StockPosition } from "@av/shared";
import { HttpError } from "../lib/http.js";

/**
 * Material stock is never stored. Warehouse-only events (receipts, adjustments) come from StockMovement;
 * everything that went to or came back from job workers comes from dispatch and return lines of challan
 * design lines linked to the material.
 */

const emptyInput = (): StockInput => ({ received: 0, adjustIn: 0, adjustOut: 0, issued: 0, rework: 0, ok: 0, damaged: 0, rejected: 0, lost: 0 });

export async function stockInputs(db: DB, materialIds?: string[]): Promise<Map<string, StockInput>> {
  // Challan lines naming these materials (or any material): jobItemId → materialId. Dispatch and return lines
  // are then matched to them, like the old JOIN through JobItem to Material.
  const items = await db.job.aggregate<{ id: string; materialId: string }>([
    { $match: { "items.materialId": materialIds ? { $in: materialIds } : { $ne: null } } },
    { $unwind: "$items" },
    { $match: { "items.materialId": materialIds ? { $in: materialIds } : { $ne: null } } },
    { $project: { _id: "$items._id", materialId: "$items.materialId" } },
  ]);
  const materialOf = new Map(items.map((i) => [i.id, i.materialId]));
  const itemIds = [...materialOf.keys()];
  const [moves, sentByItem, backByItem] = await all([
    () =>
      db.stockMovement.aggregate<{ id: { id: string; type: string }; q: number }>([
        { $match: { voidedAt: null, ...(materialIds && { materialId: { $in: materialIds } }) } },
        { $group: { _id: { id: "$materialId", type: "$type" }, q: { $sum: "$qty" } } },
      ]),
    () =>
      db.dispatch.aggregate<{ id: { id: string; kind: string }; q: number }>([
        { $match: { voidedAt: null, "lines.jobItemId": { $in: itemIds } } },
        { $unwind: "$lines" },
        { $match: { "lines.jobItemId": { $in: itemIds } } },
        { $group: { _id: { id: "$lines.jobItemId", kind: "$kind" }, q: { $sum: "$lines.qty" } } },
      ]),
    () =>
      db.return.aggregate<{ id: string; ok: number; damaged: number; rejected: number; lost: number }>([
        { $match: { voidedAt: null, "lines.jobItemId": { $in: itemIds } } },
        { $unwind: "$lines" },
        { $match: { "lines.jobItemId": { $in: itemIds } } },
        {
          $group: {
            _id: "$lines.jobItemId",
            ok: { $sum: "$lines.okQty" },
            damaged: { $sum: "$lines.damagedQty" },
            rejected: { $sum: "$lines.rejectedQty" },
            lost: { $sum: "$lines.lostQty" },
          },
        },
      ]),
  ]);
  const out = new Map<string, StockInput>((materialIds ?? []).map((id) => [id, emptyInput()]));
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = emptyInput()));
    return s;
  };
  for (const m of moves) {
    const s = get(m.id.id);
    if (m.id.type === "RECEIPT") s.received = roundQty(m.q);
    else if (m.id.type === "ADJUSTMENT_IN") s.adjustIn = roundQty(m.q);
    else s.adjustOut = roundQty(m.q);
  }
  for (const d of sentByItem) {
    const s = get(materialOf.get(d.id.id)!);
    if (d.id.kind === "REWORK") s.rework = roundQty(s.rework + d.q);
    else s.issued = roundQty(s.issued + d.q);
  }
  for (const b of backByItem) {
    const s = get(materialOf.get(b.id)!);
    s.ok = roundQty(s.ok + b.ok);
    s.damaged = roundQty(s.damaged + b.damaged);
    s.rejected = roundQty(s.rejected + b.rejected);
    s.lost = roundQty(s.lost + b.lost);
  }
  return out;
}

export async function stockPositions(db: DB, materialIds?: string[]): Promise<Map<string, StockPosition>> {
  const inputs = await stockInputs(db, materialIds);
  return new Map([...inputs].map(([id, s]) => [id, stockPosition(s)]));
}

/**
 * Refuses to issue more good stock than the warehouse holds, unless a reason is given (the issue is then
 * recorded and the shortfall noted in the audit log by the caller).
 */
export async function checkStock(db: DB, wanted: { materialId: string | null; qty: number; label: string }[], reason: string | null | undefined) {
  const need = new Map<string, { qty: number; labels: string[] }>();
  for (const w of wanted) {
    if (!w.materialId) continue;
    const n = need.get(w.materialId) ?? { qty: 0, labels: [] };
    n.qty = roundQty(n.qty + w.qty);
    n.labels.push(w.label);
    need.set(w.materialId, n);
  }
  if (!need.size) return [];
  const [stock, materials] = await all([() => stockPositions(db, [...need.keys()]), () => db.material.find({ _id: { $in: [...need.keys()] } }, { select: "name unit" })]);
  const short = materials
    .map((m) => ({ materialId: m.id, name: m.name, unit: m.unit, available: stock.get(m.id)?.available ?? 0, wanted: need.get(m.id)!.qty }))
    .filter((s) => s.wanted > s.available + 1e-9);
  if (short.length && !reason) {
    throw new HttpError(
      422,
      short.map((s) => `${s.name}: only ${s.available} ${s.unit} in stock but ${s.wanted} ${s.unit} to issue`).join(". ") + ". Record the stock received, or add a reason to issue anyway.",
      { stockShort: short },
    );
  }
  return short;
}
