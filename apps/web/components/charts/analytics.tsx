"use client";

import { formatDate, formatINR, formatQty, type DashboardCharts } from "@av/shared";
import { Fragment } from "react";
import { ChartCard, Columns, fmt, HBars, LegendItem, SEQ, SERIES, VizStyle } from "./chart-kit";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
const BUCKET_LABEL: Record<string, string> = { "0-3": "0–3 d", "4-7": "4–7 d", "8-15": "8–15 d", "16-30": "16–30 d", "30+": "30+ d" };

/** Top n by value, the rest folded into one "Other" row (never a generated colour for a long tail). */
function topN<T extends Record<string, unknown>>(rows: T[], n: number, key: keyof T, label: keyof T): T[] {
  if (rows.length <= n) return rows;
  const rest = rows.slice(n - 1);
  const other = { ...rest[0], [label]: `Other (${rest.length})`, [key]: rest.reduce((s, r) => s + Number(r[key] ?? 0), 0) } as T;
  return [...rows.slice(0, n - 1), other];
}

const unitsOf = <T extends { unit: string }>(rows: T[]) => [...new Set(rows.map((r) => r.unit))];

/** The ten analytics charts (spec §42) from GET /dashboard/charts. */
export function AnalyticsCharts({ c }: { c: DashboardCharts }) {
  const workerPendingUnits = unitsOf(c.workerPending);
  const outstanding = topN(c.workerOutstanding, 10, "outstandingPaise", "clientName");
  const designs = topN(c.byDesign, 10, "valuePaise", "designName");
  const defects = c.defects.slice(0, 10);
  const completion = c.completionDays.slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VizStyle />

      <ChartCard
        title="Material issued, returned and pending"
        subtitle={`Issued and returned ${formatDate(c.range.from)} – ${formatDate(c.range.to)}; pending right now. One chart per unit.`}
        empty={c.materialFlow.length === 0}
        table={{
          columns: [{ label: "Unit" }, { label: "Issued", align: "right" }, { label: "Returned good", align: "right" }, { label: "Damaged/rejected/lost", align: "right" }, { label: "Pending now", align: "right" }],
          rows: c.materialFlow.map((m) => [m.unit, formatQty(m.issued), formatQty(m.returned), formatQty(m.exceptions), formatQty(m.pending)]),
        }}
      >
        <div className="space-y-3">
          {c.materialFlow.map((m) => (
            <div key={m.unit}>
              <div className="px-2 text-xs font-medium text-fg-2">{m.unit}</div>
              <HBars
                data={[
                  { k: "Issued", v: m.issued },
                  { k: "Returned good", v: m.returned },
                  { k: "Dmg/rej/lost", v: m.exceptions },
                  { k: "Pending now", v: m.pending },
                ]}
                category="k"
                series={[{ key: "v", label: m.unit }]}
                format={(n) => `${fmt.qty(n)} ${m.unit}`}
              />
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard
        title="Challan aging"
        subtitle="Challans with material outside, by days since issue"
        empty={c.challanAging.every((a) => a.challans === 0)}
        table={{
          columns: [{ label: "Days out" }, { label: "Challans", align: "right" }, { label: "Pending", align: "right" }, { label: "Pending value", align: "right" }],
          rows: c.challanAging.map((a) => [BUCKET_LABEL[a.bucket], a.challans, a.pending.map((p) => `${formatQty(p.qty)} ${p.unit}`).join(", ") || "—", formatINR(a.valuePaise)]),
        }}
      >
        <Columns
          data={c.challanAging.map((a) => ({ bucket: a.bucket, challans: a.challans, value: a.valuePaise, pending: a.pending.map((p) => `${formatQty(p.qty)} ${p.unit}`).join(", ") }))}
          category="bucket"
          value="challans"
          label="Challans"
          format={(n) => fmt.qty(n)}
          tickLabel={(b) => BUCKET_LABEL[b] ?? b}
          colors={[...SEQ]}
          tip={(d) => ({
            title: `${BUCKET_LABEL[String(d.bucket)]} outside`,
            rows: [
              { label: "Challans", value: fmt.qty(Number(d.challans)) },
              { label: "Pending", value: String(d.pending || "—") },
              { label: "Pending value", value: fmt.rupees(Number(d.value)) },
            ],
          })}
        />
      </ChartCard>

      <ChartCard
        title="Job work value by month"
        subtitle="Value of work received (at each return's rate)"
        empty={c.monthlyWork.every((m) => m.valuePaise === 0)}
        table={{ columns: [{ label: "Month" }, { label: "Work value", align: "right" }], rows: c.monthlyWork.map((m) => [monthLabel(m.month), formatINR(m.valuePaise)]) }}
      >
        <Columns data={c.monthlyWork} category="month" value="valuePaise" label="Work value" format={fmt.rupees} formatAxis={fmt.rupeesShort} tickLabel={monthLabel} />
      </ChartCard>

      <ChartCard
        title="Payments by month"
        subtitle="Payment vouchers (voided ones left out)"
        empty={c.monthlyPayments.every((m) => m.paidPaise === 0)}
        table={{ columns: [{ label: "Month" }, { label: "Paid", align: "right" }], rows: c.monthlyPayments.map((m) => [monthLabel(m.month), formatINR(m.paidPaise)]) }}
      >
        <Columns data={c.monthlyPayments} category="month" value="paidPaise" label="Paid" format={fmt.rupees} formatAxis={fmt.rupeesShort} tickLabel={monthLabel} />
      </ChartCard>

      <ChartCard
        title="Outstanding by worker"
        subtitle="Still payable right now (net of advances)"
        empty={c.workerOutstanding.length === 0}
        table={{ columns: [{ label: "Job worker" }, { label: "Outstanding", align: "right" }], rows: c.workerOutstanding.map((w) => [w.clientName, formatINR(w.outstandingPaise)]) }}
      >
        <HBars data={outstanding} category="clientName" series={[{ key: "outstandingPaise", label: "Outstanding" }]} format={fmt.rupeesShort} tip={(d) => ({ title: String(d.clientName), rows: [{ label: "Outstanding", value: fmt.rupees(Number(d.outstandingPaise)) }] })} />
      </ChartCard>

      <ChartCard
        title="Pending material by worker"
        subtitle="Quantity with each worker right now, per unit"
        empty={c.workerPending.length === 0}
        table={{ columns: [{ label: "Job worker" }, { label: "Unit" }, { label: "Pending", align: "right" }], rows: c.workerPending.map((w) => [w.clientName, w.unit, formatQty(w.pending)]) }}
      >
        <div className="space-y-3">
          {workerPendingUnits.map((u) => (
            <Fragment key={u}>
              <div className="px-2 text-xs font-medium text-fg-2">{u}</div>
              <HBars data={topN(c.workerPending.filter((w) => w.unit === u), 8, "pending", "clientName")} category="clientName" series={[{ key: "pending", label: u }]} format={(n) => `${fmt.qtyShort(n)}`} tip={(d) => ({ title: String(d.clientName), rows: [{ label: "Pending", value: `${fmt.qty(Number(d.pending))} ${u}` }] })} />
            </Fragment>
          ))}
        </div>
      </ChartCard>

      <ChartCard
        title="Average days to complete"
        subtitle="Challan date to the return that completed it (challans dated in the period)"
        empty={completion.length === 0}
        table={{ columns: [{ label: "Job worker" }, { label: "Avg days", align: "right" }, { label: "Completed challans", align: "right" }], rows: c.completionDays.map((w) => [w.clientName, w.avgDays, w.challans]) }}
      >
        <HBars data={completion} category="clientName" series={[{ key: "avgDays", label: "Avg days" }]} format={fmt.days} tip={(d) => ({ title: String(d.clientName), rows: [{ label: "Average", value: fmt.days(Number(d.avgDays)) }, { label: "Completed challans", value: String(d.challans) }] })} />
      </ChartCard>

      <ChartCard
        title="Defects and rejections by worker"
        subtitle="Share of everything returned (challans dated in the period)"
        empty={defects.length === 0}
        legend={
          <>
            <LegendItem color={SERIES[1]}>Defect % (damaged + lost)</LegendItem>
            <LegendItem color={SERIES[0]}>Rejection %</LegendItem>
          </>
        }
        table={{ columns: [{ label: "Job worker" }, { label: "Returned", align: "right" }, { label: "Defect %", align: "right" }, { label: "Rejection %", align: "right" }], rows: c.defects.map((w) => [w.clientName, formatQty(w.accounted), `${w.defectPct}%`, `${w.rejectionPct}%`]) }}
      >
        <HBars
          data={defects}
          category="clientName"
          series={[
            { key: "defectPct", label: "Defect %", color: SERIES[1] },
            { key: "rejectionPct", label: "Rejection %", color: SERIES[0] },
          ]}
          format={fmt.pct}
        />
      </ChartCard>

      <ChartCard
        title="Job work value by design"
        subtitle="Work received in the period"
        empty={c.byDesign.length === 0}
        table={{ columns: [{ label: "Design" }, { label: "Work value", align: "right" }], rows: c.byDesign.map((d) => [d.designName, formatINR(d.valuePaise)]) }}
      >
        <HBars data={designs} category="designName" series={[{ key: "valuePaise", label: "Work value" }]} format={fmt.rupeesShort} tip={(d) => ({ title: String(d.designName), rows: [{ label: "Work value", value: fmt.rupees(Number(d.valuePaise)) }] })} />
      </ChartCard>

      <ChartCard
        title="Job work value by type"
        subtitle="Work received in the period"
        empty={c.byJobWorkType.length === 0}
        table={{ columns: [{ label: "Job work type" }, { label: "Work value", align: "right" }], rows: c.byJobWorkType.map((t) => [t.name, formatINR(t.valuePaise)]) }}
      >
        <HBars data={c.byJobWorkType} category="name" series={[{ key: "valuePaise", label: "Work value" }]} format={fmt.rupeesShort} tip={(d) => ({ title: String(d.name), rows: [{ label: "Work value", value: fmt.rupees(Number(d.valuePaise)) }] })} />
      </ChartCard>
    </div>
  );
}
