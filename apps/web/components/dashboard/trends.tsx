"use client";

import { formatINR, type DashboardCharts } from "@av/shared";
import { AreaTrend, ChartCard, fmt, LegendItem, RingMeter, SERIES, VizStyle } from "@/components/charts/chart-kit";
import { Rupees } from "./panels";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;

/** Work received vs paid out by month, and how much of that work has been paid for. */
export function TrendPanel({ c }: { c: DashboardCharts }) {
  const paidBy = new Map(c.monthlyPayments.map((m) => [m.month, m.paidPaise]));
  const all = c.monthlyWork.map((m) => ({ month: m.month, work: m.valuePaise, paid: paidBy.get(m.month) ?? 0 }));
  // A new business has months of nothing before its first challan; start at the first active month (but show at least six).
  const first = all.findIndex((r) => r.work > 0 || r.paid > 0);
  const rows = first < 0 ? all : all.slice(Math.min(first, Math.max(0, all.length - 6)));
  const work = rows.reduce((s, r) => s + r.work, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const best = rows.reduce((b, r) => (r.work > b.work ? r : b), rows[0] ?? { month: "", work: 0, paid: 0 });
  const empty = work === 0 && paid === 0;
  const pct = work > 0 ? (paid / work) * 100 : 0;

  return (
    <div className="viz stagger grid gap-4 lg:grid-cols-3">
      <VizStyle />
      <ChartCard
        className="lg:col-span-2"
        title="Work received vs paid"
        subtitle="By month, at each return's rate and by payment voucher"
        empty={empty}
        legend={
          <>
            <LegendItem color={SERIES[0]}>Work received</LegendItem>
            <LegendItem color={SERIES[2]}>Paid</LegendItem>
          </>
        }
        table={{
          columns: [{ label: "Month" }, { label: "Work received", align: "right" }, { label: "Paid", align: "right" }],
          rows: rows.map((r) => [monthLabel(r.month), formatINR(r.work), formatINR(r.paid)]),
        }}
      >
        <AreaTrend
          data={rows}
          category="month"
          series={[
            { key: "work", label: "Work received", color: SERIES[0] },
            { key: "paid", label: "Paid", color: SERIES[2] },
          ]}
          format={fmt.rupees}
          formatAxis={fmt.rupeesShort}
          tickLabel={monthLabel}
        />
      </ChartCard>

      <section className="flex flex-col rounded-lg border border-border bg-surface px-4 py-3" aria-label="Paid against work received">
        <h3 className="text-[13px] font-semibold text-fg">Paid against work</h3>
        <p className="mt-0.5 text-xs text-fg-muted">{rows.length ? `${monthLabel(rows[0].month)} – ${monthLabel(rows[rows.length - 1].month)}` : "Same months as the chart"}</p>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-6 py-4 lg:flex-col lg:gap-4">
          <RingMeter pct={pct} label="paid" />
          <dl className="num grid min-w-40 grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-fg-muted">Work received</dt>
            <dd className="text-right font-medium">
              <Rupees paise={work} />
            </dd>
            <dt className="text-fg-muted">Paid</dt>
            <dd className="text-right font-medium">
              <Rupees paise={paid} />
            </dd>
            <dt className="text-fg-muted">Busiest month</dt>
            <dd className="text-right font-medium">{best.work > 0 ? monthLabel(best.month) : "—"}</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
