import { all, type DB, type Filter, type JobItem, type Return, type ReturnLine, type Sort } from "@av/db";
import { payableQty, returnLineTotal, returnLineValue, roundQty, sumQty, type ReturnRow, type Unit } from "@av/shared";
import { userNames } from "../lib/audit.js";
import { num, returnMoney } from "./ledger.js";

export const returnRowPopulate = [
  {
    path: "job",
    select: "jobNumber clientId productId items._id items.designId items.designName items.unit items.ratePaise",
    populate: [
      { path: "client", select: "name" },
      { path: "product", select: "name unit" },
    ],
  },
  { path: "photos", select: "returnId", match: { voidedAt: null }, options: { sort: { createdAt: 1 } } },
];

type LineItem = Pick<JobItem, "id" | "designId" | "designName" | "unit" | "ratePaise">;
export type ReturnLineWithItem = ReturnLine & { jobItem: LineItem };
export type ReturnWithRows = Omit<Return, "lines"> & {
  job: { id: string; jobNumber: string; clientId: string; client: { id: string; name: string }; product: { name: string; unit: string }; items: LineItem[] };
  lines: ReturnLineWithItem[];
  photos: { id: string }[];
};

/** Attaches each line's challan design line (embedded in the job) as `jobItem`, like the old relation. */
export function withLineItems<R extends { lines: ReturnLine[]; job: { items: LineItem[] } }>(r: R): Omit<R, "lines"> & { lines: ReturnLineWithItem[] } {
  const byId = new Map(r.job.items.map((i) => [i.id, i]));
  return { ...r, lines: r.lines.map((l) => ({ ...l, jobItem: byId.get(l.jobItemId)! })) };
}

/** Loads returns with everything a list row needs. */
export async function findReturnsWithRows(db: DB, where: Filter, opts: { sort?: Sort; skip?: number; limit?: number } = {}): Promise<ReturnWithRows[]> {
  const rows = await db.return.find<Omit<ReturnWithRows, "lines"> & { lines: ReturnLine[] }>(where, { populate: returnRowPopulate, ...opts });
  return rows.map((r) => ({ ...withLineItems(r), photos: r.photos ?? [] }));
}

/** Numeric view of a return line with its payable quantity and value at its own rate. */
export function lineNumbers(l: Pick<ReturnLine, "okQty" | "damagedQty" | "rejectedQty" | "lostQty" | "payDamaged" | "payRejected" | "payLost" | "ratePaise">) {
  const q = { okQty: num(l.okQty), damagedQty: num(l.damagedQty), rejectedQty: num(l.rejectedQty), lostQty: num(l.lostQty) };
  const flags = { payDamaged: l.payDamaged, payRejected: l.payRejected, payLost: l.payLost };
  return { ...q, ...flags, ratePaise: l.ratePaise, payableQty: payableQty(q, flags), valuePaise: returnLineValue({ ...q, ...flags, ratePaise: l.ratePaise }), total: returnLineTotal(q) };
}

/** Builds list rows (with live payment state) for already-loaded returns. */
export async function toReturnRows(db: DB, returns: ReturnWithRows[], today: string): Promise<ReturnRow[]> {
  const jobIds = [...new Set(returns.map((r) => r.jobId))];
  const [money, names] = await all([() => returnMoney(db, jobIds, today), () => userNames(db, returns.flatMap((r) => [r.enteredById, r.editedById]))]);
  return returns.map((r) => {
    const lines = r.lines.map((l) => ({ l, n: lineNumbers(l) }));
    const rates = [...new Set(lines.map((x) => x.n.ratePaise))];
    return {
      id: r.id,
      returnNumber: r.returnNumber,
      date: r.date.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      job: { id: r.job.id, jobNumber: r.job.jobNumber },
      client: { id: r.job.client.id, name: r.job.client.name },
      productName: r.job.product.name,
      unit: (r.lines[0]?.jobItem.unit ?? r.job.product.unit) as Unit,
      designs: [...new Set(lines.map((x) => x.l.jobItem.designName))],
      okQty: sumQty(lines.map((x) => x.n.okQty)),
      damagedQty: sumQty(lines.map((x) => x.n.damagedQty)),
      rejectedQty: sumQty(lines.map((x) => x.n.rejectedQty)),
      lostQty: sumQty(lines.map((x) => x.n.lostQty)),
      total: roundQty(lines.reduce((s, x) => s + x.n.total, 0)),
      ratePaise: rates.length === 1 ? rates[0] : null,
      valuePaise: lines.reduce((s, x) => s + x.n.valuePaise, 0),
      payment: r.voidedAt ? null : (money.get(r.id) ?? null),
      photoCount: r.photos.length,
      coverPhotoId: r.photos[0]?.id ?? null,
      enteredBy: r.enteredById ? (names.get(r.enteredById) ?? null) : null,
      editedAt: r.editedAt?.toISOString() ?? null,
      editedBy: r.editedById ? (names.get(r.editedById) ?? null) : null,
      voidedAt: r.voidedAt?.toISOString() ?? null,
      voidReason: r.voidReason,
    };
  });
}

export async function loadReturnRows(db: DB, where: Filter, today: string, opts: { take?: number; skip?: number; sort?: Sort } = {}) {
  const returns = await findReturnsWithRows(db, where, { sort: opts.sort ?? { date: 1, receivedAt: 1 }, limit: opts.take, skip: opts.skip });
  return toReturnRows(db, returns, today);
}
