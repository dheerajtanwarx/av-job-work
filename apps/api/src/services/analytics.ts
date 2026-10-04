import { Prisma, prisma } from "@av/db";
import { dayOf, diffDays, holdingStatus, roundQty, type ArrivalRow, type MaterialHolderRow, type Unit } from "@av/shared";
import { PAYABLE_SQL, VALUE_SQL } from "./ledger.js";

/**
 * SQL aggregates for the dashboard, charts and reports. Every query groups in Postgres (dispatch lines,
 * return lines and vouchers are summed per design line / challan / worker) so nothing loads every row of
 * every challan into memory. The formulas mirror calc.ts: pending = max(0, sent − accounted),
 * value = Σ round(payable × return rate), pending value = round(pending × challan rate) per design line.
 */

export interface Filters {
  from?: string;
  to?: string;
  date?: string;
  clientId?: string;
  designId?: string;
  productId?: string;
  jobWorkTypeId?: string;
  materialId?: string;
  jobId?: string;
  status?: string;
}

export interface Page {
  skip: number;
  take: number;
}

type Cond = Prisma.Sql | false | "" | undefined | null;

const and = (parts: Cond[]) => {
  const xs = parts.filter((p): p is Prisma.Sql => !!p);
  return xs.length ? Prisma.sql` AND ${Prisma.join(xs, " AND ")}` : Prisma.empty;
};

const OPEN_SQL = Prisma.sql`j.status::text IN ('DRAFT', 'IN_PROGRESS', 'PARTIALLY_RECEIVED')`;
const ACTIVE_SQL = Prisma.sql`j.status::text IN ('IN_PROGRESS', 'PARTIALLY_RECEIVED')`;
/** isOverdue(): an issued, not-finished challan past its expected return date. */
const overdueSql = (today: string) => Prisma.sql`(${ACTIVE_SQL} AND j."expectedReturnDate" < ${today}::date)`;
const JWT_SQL = Prisma.sql`COALESCE(ji."jobWorkTypeId", j."jobWorkTypeId")`;

function statusSql(status: string | undefined, today: string) {
  if (!status) return null;
  if (status === "OPEN") return OPEN_SQL;
  if (status === "ACTIVE") return ACTIVE_SQL;
  if (status === "OVERDUE") return overdueSql(today);
  return Prisma.sql`j.status::text = ${status}`;
}

/** Challan-level filters on alias j (and ji when `item` is set; otherwise design / job type / material match any line). */
export function jobConds(f: Filters, today: string, opts: { item?: boolean; jobDate?: boolean } = {}): Cond[] {
  const anyItem = (cond: Prisma.Sql) => Prisma.sql`EXISTS (SELECT 1 FROM "JobItem" ji WHERE ji."jobId" = j.id AND ${cond})`;
  const itemCond = (cond: Prisma.Sql) => (opts.item ? cond : anyItem(cond));
  return [
    f.clientId && Prisma.sql`j."clientId" = ${f.clientId}`,
    f.jobId && Prisma.sql`j.id = ${f.jobId}`,
    f.productId && Prisma.sql`j."productId" = ${f.productId}`,
    f.designId && itemCond(Prisma.sql`ji."designId" = ${f.designId}`),
    f.materialId && itemCond(Prisma.sql`ji."materialId" = ${f.materialId}`),
    f.jobWorkTypeId && itemCond(Prisma.sql`${JWT_SQL} = ${f.jobWorkTypeId}`),
    statusSql(f.status, today),
    opts.jobDate && f.from && Prisma.sql`j."jobDate" >= ${f.from}::date`,
    opts.jobDate && f.to && Prisma.sql`j."jobDate" <= ${f.to}::date`,
  ];
}

/**
 * Per design line: issued (initial + additional), rework, sent, returned by kind, value at return rates,
 * pending and excess. `where` filters design lines (aliases j, ji).
 */
function itemsCte(where: Prisma.Sql) {
  return Prisma.sql`
    WITH s AS (
      SELECT dl."jobItemId" AS id,
        SUM(CASE WHEN d.kind::text = 'REWORK' THEN 0 ELSE dl.qty END) AS issued,
        SUM(CASE WHEN d.kind::text = 'REWORK' THEN dl.qty ELSE 0 END) AS rework,
        SUM(dl.qty) AS sent
      FROM "DispatchLine" dl JOIN "Dispatch" d ON d.id = dl."dispatchId"
      WHERE d."voidedAt" IS NULL
      GROUP BY 1
    ), b AS (
      SELECT rl."jobItemId" AS id, SUM(rl."okQty") AS ok, SUM(rl."damagedQty") AS damaged, SUM(rl."rejectedQty") AS rejected,
        SUM(rl."lostQty") AS lost, SUM(${PAYABLE_SQL}) AS payable, SUM(${VALUE_SQL}) AS value
      FROM "ReturnLine" rl JOIN "Return" r ON r.id = rl."returnId"
      WHERE r."voidedAt" IS NULL
      GROUP BY 1
    ), it AS (
      SELECT ji.id, ji."jobId", j."jobNumber", j."clientId", c.name AS "clientName", j."jobDate", j."expectedReturnDate",
        j.status::text AS status, j."productId", ${JWT_SQL} AS "jobWorkTypeId", ji."materialId", ji.unit::text AS unit,
        ji."ratePaise", ji."designId", ji."designName", ji.quantity,
        COALESCE(s.issued, 0) AS issued, COALESCE(s.rework, 0) AS rework, COALESCE(s.sent, 0) AS sent,
        COALESCE(b.ok, 0) AS ok, COALESCE(b.damaged, 0) AS damaged, COALESCE(b.rejected, 0) AS rejected, COALESCE(b.lost, 0) AS lost,
        COALESCE(b.payable, 0) AS payable, COALESCE(b.value, 0) AS value,
        GREATEST(COALESCE(s.sent, 0) - COALESCE(b.ok + b.damaged + b.rejected + b.lost, 0), 0) AS pending,
        GREATEST(COALESCE(b.ok + b.damaged + b.rejected + b.lost, 0) - COALESCE(s.sent, 0), 0) AS excess
      FROM "JobItem" ji JOIN "Job" j ON j.id = ji."jobId" JOIN "Client" c ON c.id = j."clientId"
        LEFT JOIN s ON s.id = ji.id LEFT JOIN b ON b.id = ji.id
      WHERE TRUE ${where}
    )`;
}

const q = (n: number | string | null | undefined) => roundQty(Number(n ?? 0));
const money = (n: number | string | null | undefined) => Math.round(Number(n ?? 0));

// ───────────────────────── Material outside ─────────────────────────

/** "Who has my material?": pending quantity per worker × material (lines without a material grouped by unit). */
export async function materialHolders(f: Filters, today: string): Promise<MaterialHolderRow[]> {
  const rows = await prisma.$queryRaw<
    { clientId: string; clientName: string; materialId: string | null; materialName: string | null; unit: string; qty: number; challans: number; overdue: number; oldest: Date | null; value: number }[]
  >`
    ${itemsCte(and(jobConds(f, today, { item: true })))}
    SELECT it."clientId", it."clientName", it."materialId", m.name AS "materialName", it.unit,
      SUM(it.pending)::float8 AS qty, COUNT(DISTINCT it."jobId")::int AS challans,
      COUNT(DISTINCT CASE WHEN it.status IN ('IN_PROGRESS', 'PARTIALLY_RECEIVED') AND it."expectedReturnDate" < ${today}::date THEN it."jobId" END)::int AS overdue,
      MIN(it."jobDate") AS oldest, SUM(ROUND(it.pending * it."ratePaise"))::float8 AS value
    FROM it LEFT JOIN "Material" m ON m.id = it."materialId"
    WHERE it.pending > 0
    GROUP BY it."clientId", it."clientName", it."materialId", m.name, it.unit`;
  return rows
    .map((r) => {
      const oldest = r.oldest ? dayOf(r.oldest) : null;
      const daysOutside = oldest ? Math.max(0, diffDays(today, oldest)) : 0;
      return {
        clientId: r.clientId,
        clientName: r.clientName,
        materialId: r.materialId,
        materialName: r.materialName ?? `No material linked (${r.unit})`,
        unit: r.unit as Unit,
        qty: q(r.qty),
        challans: r.challans,
        overdueChallans: r.overdue,
        oldestIssueDate: oldest,
        daysOutside,
        valuePaise: money(r.value),
        status: holdingStatus(daysOutside, r.overdue > 0),
      };
    })
    .sort((a, b) => b.daysOutside - a.daysOutside || b.valuePaise - a.valuePaise);
}

export interface PositionRow {
  clientId: string;
  clientName: string;
  materialId: string | null;
  materialName: string;
  unit: Unit;
  issued: number;
  rework: number;
  returned: number;
  damaged: number;
  rejected: number;
  lost: number;
  pending: number;
  valuePaise: number;
  pendingValuePaise: number;
  challans: number;
}

/** Issued / returned / damaged / rejected / lost / pending per worker × material (challans dated in the range). */
export async function workerMaterialPositions(f: Filters, today: string): Promise<PositionRow[]> {
  const rows = await prisma.$queryRaw<(Omit<PositionRow, "materialName" | "unit"> & { materialName: string | null; unit: string })[]>`
    ${itemsCte(and([...jobConds(f, today, { item: true, jobDate: true }), Prisma.sql`j.status::text <> 'CANCELLED'`]))}
    SELECT it."clientId", it."clientName", it."materialId", m.name AS "materialName", it.unit,
      SUM(it.issued)::float8 AS issued, SUM(it.rework)::float8 AS rework, SUM(it.ok)::float8 AS returned, SUM(it.damaged)::float8 AS damaged,
      SUM(it.rejected)::float8 AS rejected, SUM(it.lost)::float8 AS lost, SUM(it.pending)::float8 AS pending,
      SUM(it.value)::float8 AS "valuePaise", SUM(ROUND(it.pending * it."ratePaise"))::float8 AS "pendingValuePaise",
      COUNT(DISTINCT it."jobId")::int AS challans
    FROM it LEFT JOIN "Material" m ON m.id = it."materialId"
    WHERE it.sent > 0
    GROUP BY it."clientId", it."clientName", it."materialId", m.name, it.unit
    ORDER BY it."clientName", m.name`;
  return rows.map((r) => ({
    ...r,
    materialName: r.materialName ?? `No material linked (${r.unit})`,
    unit: r.unit as Unit,
    issued: q(r.issued),
    rework: q(r.rework),
    returned: q(r.returned),
    damaged: q(r.damaged),
    rejected: q(r.rejected),
    lost: q(r.lost),
    pending: q(r.pending),
    valuePaise: money(r.valuePaise),
    pendingValuePaise: money(r.pendingValuePaise),
  }));
}

// ───────────────────────── Job work grouped ─────────────────────────

export interface WorkGroupRow {
  key: string | null;
  name: string;
  unit: Unit;
  challans: number;
  issued: number;
  rework: number;
  ok: number;
  damaged: number;
  rejected: number;
  lost: number;
  pending: number;
  valuePaise: number;
  pendingValuePaise: number;
}

/** Job work per design or per worker (and unit), for challans dated in the range. Cancelled challans are left out. */
export async function workGrouped(by: "design" | "worker" | "jobWorkType", f: Filters, today: string): Promise<WorkGroupRow[]> {
  const key = by === "design" ? Prisma.sql`it."designId"` : by === "worker" ? Prisma.sql`it."clientId"` : Prisma.sql`it."jobWorkTypeId"`;
  const name =
    by === "design"
      ? Prisma.sql`COALESCE(d.name, MIN(it."designName"))`
      : by === "worker"
        ? Prisma.sql`MIN(it."clientName")`
        : Prisma.sql`COALESCE(MIN(t.name), 'No job work type')`;
  const rows = await prisma.$queryRaw<(Omit<WorkGroupRow, "unit"> & { unit: string })[]>`
    ${itemsCte(and([...jobConds(f, today, { item: true, jobDate: true }), Prisma.sql`j.status::text <> 'CANCELLED'`]))}
    SELECT ${key} AS key, ${name} AS name, it.unit, COUNT(DISTINCT it."jobId")::int AS challans,
      SUM(it.issued)::float8 AS issued, SUM(it.rework)::float8 AS rework, SUM(it.ok)::float8 AS ok, SUM(it.damaged)::float8 AS damaged,
      SUM(it.rejected)::float8 AS rejected, SUM(it.lost)::float8 AS lost, SUM(it.pending)::float8 AS pending,
      SUM(it.value)::float8 AS "valuePaise", SUM(ROUND(it.pending * it."ratePaise"))::float8 AS "pendingValuePaise"
    FROM it LEFT JOIN "Design" d ON d.id = it."designId" LEFT JOIN "JobWorkType" t ON t.id = it."jobWorkTypeId"
    GROUP BY ${key}, ${by === "design" ? Prisma.sql`d.name, ` : Prisma.empty}it.unit
    ORDER BY "valuePaise" DESC, name`;
  return rows.map((r) => ({
    ...r,
    unit: r.unit as Unit,
    issued: q(r.issued),
    rework: q(r.rework),
    ok: q(r.ok),
    damaged: q(r.damaged),
    rejected: q(r.rejected),
    lost: q(r.lost),
    pending: q(r.pending),
    valuePaise: money(r.valuePaise),
    pendingValuePaise: money(r.pendingValuePaise),
  }));
}

/** Design lines where more came back than was sent (an approved over-return). */
export async function quantityMismatches() {
  const rows = await prisma.$queryRaw<{ jobId: string; jobNumber: string; clientName: string; designName: string; unit: string; excess: number }[]>`
    ${itemsCte(Prisma.empty)}
    SELECT it."jobId", it."jobNumber", it."clientName", it."designName", it.unit, it.excess::float8 AS excess
    FROM it WHERE it.excess > 0 AND it.status <> 'CANCELLED'
    ORDER BY it."jobDate" DESC`;
  return rows.map((r) => ({ ...r, excess: q(r.excess) }));
}

/** Pending quantity per design across every challan (the legacy dashboard list). */
export async function pendingByDesign() {
  const rows = await prisma.$queryRaw<{ designId: string; designName: string; jobs: number; pending: number }[]>`
    ${itemsCte(Prisma.empty)}
    SELECT it."designId", MIN(it."designName") AS "designName", COUNT(DISTINCT it."jobId")::int AS jobs, SUM(it.pending)::float8 AS pending
    FROM it WHERE it.pending > 0
    GROUP BY it."designId"
    ORDER BY pending DESC`;
  return rows.map((r) => ({ ...r, pending: q(r.pending) }));
}

// ───────────────────────── Challans: open with material outside ─────────────────────────

export interface OpenChallanRow {
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  jobDate: string;
  expectedReturnDate: string | null;
  status: string;
  overdue: boolean;
  pending: number;
  unit: Unit;
  units: number;
  pendingValuePaise: number;
  sent: number;
  ok: number;
  exceptions: number;
}

/** Challans (not cancelled) that still have material outside; quantities are per challan (single unit when `units` = 1). */
export async function challansOutside(f: Filters, today: string, opts: { includeCancelled?: boolean } = {}): Promise<OpenChallanRow[]> {
  const rows = await prisma.$queryRaw<
    { jobId: string; jobNumber: string; clientId: string; clientName: string; jobDate: Date; expectedReturnDate: Date | null; status: string; pending: number; unit: string; units: number; value: number; sent: number; ok: number; exceptions: number }[]
  >`
    ${itemsCte(and([...jobConds(f, today), !opts.includeCancelled && Prisma.sql`j.status::text <> 'CANCELLED'`]))}
    SELECT it."jobId", it."jobNumber", it."clientId", it."clientName", it."jobDate", it."expectedReturnDate", it.status,
      SUM(it.pending)::float8 AS pending, MIN(it.unit) AS unit, COUNT(DISTINCT it.unit)::int AS units,
      SUM(ROUND(it.pending * it."ratePaise"))::float8 AS value, SUM(it.sent)::float8 AS sent, SUM(it.ok)::float8 AS ok,
      SUM(it.damaged + it.rejected + it.lost)::float8 AS exceptions
    FROM it
    GROUP BY it."jobId", it."jobNumber", it."clientId", it."clientName", it."jobDate", it."expectedReturnDate", it.status
    HAVING SUM(it.pending) > 0
    ORDER BY it."jobDate", it."jobNumber"`;
  return rows.map((r) => {
    const expected = r.expectedReturnDate ? dayOf(r.expectedReturnDate) : null;
    return {
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientId: r.clientId,
      clientName: r.clientName,
      jobDate: dayOf(r.jobDate),
      expectedReturnDate: expected,
      status: r.status,
      overdue: !!expected && expected < today && (r.status === "IN_PROGRESS" || r.status === "PARTIALLY_RECEIVED"),
      pending: q(r.pending),
      unit: r.unit as Unit,
      units: r.units,
      pendingValuePaise: money(r.value),
      sent: q(r.sent),
      ok: q(r.ok),
      exceptions: q(r.exceptions),
    };
  });
}

// ───────────────────────── Money per challan ─────────────────────────

export interface JobMoneyRow {
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  jobDate: string;
  status: string;
  valuePaise: number;
  paidPaise: number;
}

/** Work value and paid per challan that has either (filters on alias j). */
export async function jobMoney(f: Filters, today: string): Promise<JobMoneyRow[]> {
  const rows = await prisma.$queryRaw<{ jobId: string; jobNumber: string; clientId: string; clientName: string; jobDate: Date; status: string; value: number; paid: number }[]>`
    WITH v AS (
      SELECT r."jobId" AS id, SUM(${VALUE_SQL}) AS value
      FROM "ReturnLine" rl JOIN "Return" r ON r.id = rl."returnId"
      WHERE r."voidedAt" IS NULL GROUP BY 1
    ), p AS (
      SELECT sb."jobId" AS id, SUM(sb."amountPaise") AS paid FROM "SubBill" sb WHERE sb."voidedAt" IS NULL GROUP BY 1
    )
    SELECT j.id AS "jobId", j."jobNumber", j."clientId", c.name AS "clientName", j."jobDate", j.status::text AS status,
      COALESCE(v.value, 0)::float8 AS value, COALESCE(p.paid, 0)::float8 AS paid
    FROM "Job" j JOIN "Client" c ON c.id = j."clientId" LEFT JOIN v ON v.id = j.id LEFT JOIN p ON p.id = j.id
    WHERE (v.id IS NOT NULL OR p.id IS NOT NULL) ${and(jobConds(f, today))}
    ORDER BY j."jobDate", j."jobNumber"`;
  return rows.map((r) => ({ ...r, jobDate: dayOf(r.jobDate), valuePaise: money(r.value), paidPaise: money(r.paid) }));
}

/** Per worker: value − paid netted across their challans (the "to pay" figure), and any net advance. */
export function workerMoney(rows: JobMoneyRow[]) {
  const map = new Map<string, { clientId: string; clientName: string; valuePaise: number; paidPaise: number; jobsOutstanding: number }>();
  for (const r of rows) {
    const w = map.get(r.clientId) ?? { clientId: r.clientId, clientName: r.clientName, valuePaise: 0, paidPaise: 0, jobsOutstanding: 0 };
    w.valuePaise += r.valuePaise;
    w.paidPaise += r.paidPaise;
    if (r.valuePaise > r.paidPaise) w.jobsOutstanding++;
    map.set(r.clientId, w);
  }
  return [...map.values()].map((w) => ({ ...w, outstandingPaise: Math.max(0, w.valuePaise - w.paidPaise), advancePaise: Math.max(0, w.paidPaise - w.valuePaise) }));
}

/** Work value (return date) and payments (voucher date) inside a range. */
export async function periodMoney(f: Filters, today: string) {
  const [[work], [paid]] = await Promise.all([
    prisma.$queryRaw<{ value: number; ok: number }[]>`
      SELECT COALESCE(SUM(${VALUE_SQL}), 0)::float8 AS value, COALESCE(SUM(rl."okQty"), 0)::float8 AS ok
      FROM "ReturnLine" rl JOIN "Return" r ON r.id = rl."returnId" JOIN "Job" j ON j.id = r."jobId"
      WHERE r."voidedAt" IS NULL ${and([...jobConds(f, today), f.from && Prisma.sql`r.date >= ${f.from}::date`, f.to && Prisma.sql`r.date <= ${f.to}::date`])}`,
    prisma.$queryRaw<{ paid: number; n: number }[]>`
      SELECT COALESCE(SUM(sb."amountPaise"), 0)::float8 AS paid, COUNT(*)::int AS n
      FROM "SubBill" sb JOIN "Job" j ON j.id = sb."jobId"
      WHERE sb."voidedAt" IS NULL ${and([...jobConds(f, today), f.from && Prisma.sql`sb.date >= ${f.from}::date`, f.to && Prisma.sql`sb.date <= ${f.to}::date`])}`,
  ]);
  return { valuePaise: money(work.value), okQty: q(work.ok), paidPaise: money(paid.paid), vouchers: paid.n };
}

// ───────────────────────── Return lines (arrivals, rate history) ─────────────────────────

function returnLineConds(f: Filters, today: string, dateMode: "range" | "day") {
  return and([
    Prisma.sql`r."voidedAt" IS NULL`,
    ...jobConds({ ...f, designId: undefined, jobWorkTypeId: undefined, materialId: undefined }, today),
    f.designId && Prisma.sql`ji."designId" = ${f.designId}`,
    f.materialId && Prisma.sql`ji."materialId" = ${f.materialId}`,
    f.jobWorkTypeId && Prisma.sql`${JWT_SQL} = ${f.jobWorkTypeId}`,
    dateMode === "day" && Prisma.sql`r.date = ${f.date ?? today}::date`,
    dateMode === "range" && f.from && Prisma.sql`r.date >= ${f.from}::date`,
    dateMode === "range" && f.to && Prisma.sql`r.date <= ${f.to}::date`,
  ]);
}

const RL_FROM = Prisma.sql`FROM "ReturnLine" rl JOIN "Return" r ON r.id = rl."returnId" JOIN "Job" j ON j.id = r."jobId" JOIN "Client" c ON c.id = j."clientId" JOIN "JobItem" ji ON ji.id = rl."jobItemId"`;

/** Non-voided return lines, newest first (or oldest first), one page at a time, with totals over the whole set. */
export async function returnLines(f: Filters, today: string, dateMode: "range" | "day", page?: Page) {
  const where = returnLineConds(f, today, dateMode);
  const limit = page ? Prisma.sql`LIMIT ${page.take} OFFSET ${page.skip}` : Prisma.empty;
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<
      { returnLineId: string; returnId: string; returnNumber: string; date: Date; receivedAt: Date; clientId: string; clientName: string; jobId: string; jobNumber: string; designId: string; designName: string; unit: string; okQty: number; damagedQty: number; rejectedQty: number; lostQty: number; ratePaise: number; challanRatePaise: number; payable: number; value: number; photoId: string | null; photoCount: number }[]
    >`
      SELECT rl.id AS "returnLineId", r.id AS "returnId", r."returnNumber", r.date, r."receivedAt", c.id AS "clientId", c.name AS "clientName",
        j.id AS "jobId", j."jobNumber", ji."designId", ji."designName", ji.unit::text AS unit,
        rl."okQty"::float8 AS "okQty", rl."damagedQty"::float8 AS "damagedQty", rl."rejectedQty"::float8 AS "rejectedQty", rl."lostQty"::float8 AS "lostQty",
        rl."ratePaise", ji."ratePaise" AS "challanRatePaise", (${PAYABLE_SQL})::float8 AS payable, (${VALUE_SQL})::float8 AS value,
        (SELECT p.id FROM "ReturnPhoto" p WHERE p."returnId" = r.id AND p."voidedAt" IS NULL AND (p."returnLineId" IS NULL OR p."returnLineId" = rl.id)
          ORDER BY (p."returnLineId" IS NOT NULL) DESC, p."createdAt" LIMIT 1) AS "photoId",
        (SELECT COUNT(*) FROM "ReturnPhoto" p WHERE p."returnId" = r.id AND p."voidedAt" IS NULL AND (p."returnLineId" IS NULL OR p."returnLineId" = rl.id))::int AS "photoCount"
      ${RL_FROM}
      WHERE TRUE ${where}
      ORDER BY r.date DESC, r."receivedAt" DESC, r."returnNumber" DESC, ji."sortOrder"
      ${limit}`,
    prisma.$queryRaw<{ unit: string; n: number; qty: number; ok: number; payable: number; value: number }[]>`
      SELECT ji.unit::text AS unit, COUNT(*)::int AS n,
        SUM(rl."okQty" + rl."damagedQty" + rl."rejectedQty" + rl."lostQty")::float8 AS qty, SUM(rl."okQty")::float8 AS ok,
        SUM(${PAYABLE_SQL})::float8 AS payable, SUM(${VALUE_SQL})::float8 AS value
      ${RL_FROM}
      WHERE TRUE ${where}
      GROUP BY 1`,
  ]);
  const lines: (ArrivalRow & { damagedQty: number; rejectedQty: number; lostQty: number; challanRatePaise: number })[] = rows.map((r) => ({
    returnLineId: r.returnLineId,
    returnId: r.returnId,
    returnNumber: r.returnNumber,
    date: dayOf(r.date),
    receivedAt: r.receivedAt.toISOString(),
    client: { id: r.clientId, name: r.clientName },
    job: { id: r.jobId, jobNumber: r.jobNumber },
    designId: r.designId,
    designName: r.designName,
    unit: r.unit as Unit,
    okQty: q(r.okQty),
    damagedQty: q(r.damagedQty),
    rejectedQty: q(r.rejectedQty),
    lostQty: q(r.lostQty),
    qty: q(r.okQty + r.damagedQty + r.rejectedQty + r.lostQty),
    payableQty: q(r.payable),
    ratePaise: r.ratePaise,
    challanRatePaise: r.challanRatePaise,
    valuePaise: money(r.value),
    photoId: r.photoId,
    photoCount: r.photoCount,
  }));
  return {
    rows: lines,
    total: totals.reduce((s, t) => s + t.n, 0),
    valuePaise: totals.reduce((s, t) => s + money(t.value), 0),
    byUnit: totals.map((t) => ({ unit: t.unit as Unit, qty: q(t.qty), ok: q(t.ok), payable: q(t.payable), value: money(t.value) })),
  };
}

// ───────────────────────── Completion & quality ─────────────────────────

export interface CompletionRow {
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  jobDate: string;
  status: string;
  firstReturnDate: string | null;
  lastReturnDate: string | null;
  returns: number;
  daysToFirst: number | null;
  /** Days from challan to the return that completed it (completed challans only). */
  daysToComplete: number | null;
}

/** Challans dated in the range that have at least one return. */
export async function completionRows(f: Filters, today: string): Promise<CompletionRow[]> {
  const rows = await prisma.$queryRaw<{ jobId: string; jobNumber: string; clientId: string; clientName: string; jobDate: Date; status: string; first: Date; last: Date; n: number }[]>`
    SELECT j.id AS "jobId", j."jobNumber", j."clientId", c.name AS "clientName", j."jobDate", j.status::text AS status,
      MIN(r.date) AS first, MAX(r.date) AS last, COUNT(*)::int AS n
    FROM "Return" r JOIN "Job" j ON j.id = r."jobId" JOIN "Client" c ON c.id = j."clientId"
    WHERE r."voidedAt" IS NULL AND j.status::text <> 'CANCELLED' ${and(jobConds(f, today, { jobDate: true }))}
    GROUP BY j.id, c.name
    ORDER BY j."jobDate" DESC, j."jobNumber" DESC`;
  return rows.map((r) => {
    const jobDate = dayOf(r.jobDate);
    const first = dayOf(r.first);
    const last = dayOf(r.last);
    return {
      jobId: r.jobId,
      jobNumber: r.jobNumber,
      clientId: r.clientId,
      clientName: r.clientName,
      jobDate,
      status: r.status,
      firstReturnDate: first,
      lastReturnDate: last,
      returns: r.n,
      daysToFirst: diffDays(first, jobDate),
      daysToComplete: r.status === "COMPLETED" ? diffDays(last, jobDate) : null,
    };
  });
}
