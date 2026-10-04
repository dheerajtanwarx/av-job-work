import { Prisma, type DB } from "@av/db";
import { roundQty, stockPosition, type StockInput, type StockPosition } from "@av/shared";
import { HttpError } from "../lib/http.js";

/**
 * Material stock is never stored. Warehouse-only events (receipts, adjustments) come from StockMovement;
 * everything that went to or came back from job workers comes from dispatch and return lines of challan
 * design lines linked to the material.
 */

const emptyInput = (): StockInput => ({ received: 0, adjustIn: 0, adjustOut: 0, issued: 0, rework: 0, ok: 0, damaged: 0, rejected: 0, lost: 0 });

export async function stockInputs(db: DB, materialIds?: string[]): Promise<Map<string, StockInput>> {
  const filter = materialIds ? Prisma.sql`AND m.id = ANY(${materialIds}::text[])` : Prisma.empty;
  const [moves, sent, back] = await Promise.all([
    db.$queryRaw<{ id: string; type: string; q: number }[]>`
      SELECT m.id, sm.type::text AS type, SUM(sm.qty)::float8 AS q
      FROM "StockMovement" sm JOIN "Material" m ON m.id = sm."materialId"
      WHERE sm."voidedAt" IS NULL ${filter}
      GROUP BY 1, 2`,
    db.$queryRaw<{ id: string; kind: string; q: number }[]>`
      SELECT m.id, d.kind::text AS kind, SUM(dl.qty)::float8 AS q
      FROM "DispatchLine" dl JOIN "Dispatch" d ON d.id = dl."dispatchId" JOIN "JobItem" ji ON ji.id = dl."jobItemId" JOIN "Material" m ON m.id = ji."materialId"
      WHERE d."voidedAt" IS NULL ${filter}
      GROUP BY 1, 2`,
    db.$queryRaw<{ id: string; ok: number; damaged: number; rejected: number; lost: number }[]>`
      SELECT m.id, SUM(rl."okQty")::float8 AS ok, SUM(rl."damagedQty")::float8 AS damaged, SUM(rl."rejectedQty")::float8 AS rejected, SUM(rl."lostQty")::float8 AS lost
      FROM "ReturnLine" rl JOIN "Return" r ON r.id = rl."returnId" JOIN "JobItem" ji ON ji.id = rl."jobItemId" JOIN "Material" m ON m.id = ji."materialId"
      WHERE r."voidedAt" IS NULL ${filter}
      GROUP BY 1`,
  ]);
  const out = new Map<string, StockInput>((materialIds ?? []).map((id) => [id, emptyInput()]));
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = emptyInput()));
    return s;
  };
  for (const m of moves) {
    const s = get(m.id);
    if (m.type === "RECEIPT") s.received = roundQty(m.q);
    else if (m.type === "ADJUSTMENT_IN") s.adjustIn = roundQty(m.q);
    else s.adjustOut = roundQty(m.q);
  }
  for (const d of sent) {
    const s = get(d.id);
    if (d.kind === "REWORK") s.rework = roundQty(s.rework + d.q);
    else s.issued = roundQty(s.issued + d.q);
  }
  for (const b of back) Object.assign(get(b.id), { ok: roundQty(b.ok), damaged: roundQty(b.damaged), rejected: roundQty(b.rejected), lost: roundQty(b.lost) });
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
  const [stock, materials] = await Promise.all([
    stockPositions(db, [...need.keys()]),
    db.material.findMany({ where: { id: { in: [...need.keys()] } }, select: { id: true, name: true, unit: true } }),
  ]);
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
