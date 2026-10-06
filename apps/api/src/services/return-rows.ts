import type { DB, Prisma } from "@av/db";
import { payableQty, returnLineTotal, returnLineValue, roundQty, sumQty, type ReturnRow, type Unit } from "@av/shared";
import { userNames } from "../lib/audit.js";
import { num, returnMoney } from "./ledger.js";

export const returnRowInclude = {
  job: { select: { id: true, jobNumber: true, clientId: true, client: { select: { id: true, name: true } }, product: { select: { name: true, unit: true } } } },
  lines: { include: { jobItem: { select: { designId: true, designName: true, unit: true, ratePaise: true } } } },
  photos: { where: { voidedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ReturnInclude;

export type ReturnWithRows = Prisma.ReturnGetPayload<{ include: typeof returnRowInclude }>;

/** Numeric view of a return line with its payable quantity and value at its own rate. */
export function lineNumbers(l: ReturnWithRows["lines"][number]) {
  const q = { okQty: num(l.okQty), damagedQty: num(l.damagedQty), rejectedQty: num(l.rejectedQty), lostQty: num(l.lostQty) };
  const flags = { payDamaged: l.payDamaged, payRejected: l.payRejected, payLost: l.payLost };
  return { ...q, ...flags, ratePaise: l.ratePaise, payableQty: payableQty(q, flags), valuePaise: returnLineValue({ ...q, ...flags, ratePaise: l.ratePaise }), total: returnLineTotal(q) };
}

/** Builds list rows (with live payment state) for already-loaded returns. */
export async function toReturnRows(db: DB, returns: ReturnWithRows[], today: string): Promise<ReturnRow[]> {
  const jobIds = [...new Set(returns.map((r) => r.jobId))];
  const [money, names] = await Promise.all([returnMoney(db, jobIds, today), userNames(db, returns.flatMap((r) => [r.enteredById, r.editedById]))]);
  return returns.map((r) => {
    const lines = r.lines.map((l) => ({ l, n: lineNumbers(l) }));
    const rates = [...new Set(lines.map((x) => x.n.ratePaise))];
    return {
      id: r.id,
      returnNumber: r.returnNumber,
      date: r.date.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      job: { id: r.job.id, jobNumber: r.job.jobNumber },
      client: r.job.client,
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

export async function loadReturnRows(
  db: DB,
  where: Prisma.ReturnWhereInput,
  today: string,
  opts: { take?: number; skip?: number; orderBy?: Prisma.ReturnOrderByWithRelationInput[] } = {},
) {
  const returns = await db.return.findMany({
    where,
    include: returnRowInclude,
    orderBy: opts.orderBy ?? [{ date: "asc" }, { receivedAt: "asc" }],
    take: opts.take,
    skip: opts.skip,
  });
  return toReturnRows(db, returns, today);
}
