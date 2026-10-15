import { formatDate, formatINR, formatQty, todayISO, type DashboardCharts } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ChartCard, Columns, HBars, LegendItem, rupeesShort, topN } from "@/components/domain/charts";
import { Card, Chip, ChipRow, ErrorBlock, Skeleton, Text } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { periodRange } from "@/lib/period";
import { space, useTheme } from "@/theme";

type Preset = "12m" | "fy" | "90d" | "month";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "12m", label: "12 months" },
  { value: "fy", label: "This FY" },
  { value: "90d", label: "90 days" },
  { value: "month", label: "This month" },
];
const rangeOf = (p: Preset) => {
  if (p !== "12m") return periodRange(p);
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() - 11, 1);
  return { from: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`, to: todayISO() };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
const BUCKET: Record<string, string> = { "0-3": "0–3 d", "4-7": "4–7 d", "8-15": "8–15 d", "16-30": "16–30 d", "30+": "30+ d" };
const pct = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
const days = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} d`;

/** The web dashboard's Analytics tab: ten charts from GET /dashboard/charts for a period. */
export default function Analytics() {
  const { c } = useTheme();
  const [preset, setPreset] = useState<Preset>("12m");
  const range = rangeOf(preset);
  const q = useQuery({
    queryKey: ["dashboard", "charts", range.from ?? "", range.to ?? ""],
    queryFn: () => api.get<DashboardCharts>(`/dashboard/charts${qs(range)}`),
    placeholderData: (p) => p,
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Analytics" }} />
      <View style={{ paddingBottom: space.md, gap: space.sm }}>
        <ChipRow>
          {PRESETS.map((p) => (
            <Chip key={p.value} label={p.label} selected={preset === p.value} onPress={() => setPreset(p.value)} />
          ))}
        </ChipRow>
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: space.gutter }}>
          {q.data ? `${formatDate(q.data.range.from)} – ${formatDate(q.data.range.to)}` : " "}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.md, paddingBottom: space.xxxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={q.refetch} colors={[c.accentSolid]} />}
      >
        {q.error && !q.data ? (
          <ErrorBlock error={q.error} onRetry={q.refetch} />
        ) : !q.data ? (
          [0, 1, 2].map((i) => (
            <Card key={i} contentStyle={{ gap: space.md }}>
              <Skeleton width="60%" height={16} />
              <Skeleton height={140} />
            </Card>
          ))
        ) : (
          <View style={{ gap: space.md, opacity: q.isFetching ? 0.7 : 1 }}>
            <AnalyticsCharts d={q.data} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function AnalyticsCharts({ d }: { d: DashboardCharts }) {
  const { c } = useTheme();
  const units = [...new Set(d.workerPending.map((w) => w.unit))];
  return (
    <>
      <ChartCard
        title="Job work value by month"
        subtitle="Value of work received (at each return's rate)"
        empty={d.monthlyWork.every((m) => m.valuePaise === 0)}
        table={{ columns: [{ label: "Month" }, { label: "Work value", right: true }], rows: d.monthlyWork.map((m) => [monthLabel(m.month), formatINR(m.valuePaise)]) }}
      >
        <Columns data={d.monthlyWork} category="month" value="valuePaise" format={formatINR} tickLabel={monthLabel} />
      </ChartCard>

      <ChartCard
        title="Payments by month"
        subtitle="Payment vouchers (voided ones left out)"
        empty={d.monthlyPayments.every((m) => m.paidPaise === 0)}
        table={{ columns: [{ label: "Month" }, { label: "Paid", right: true }], rows: d.monthlyPayments.map((m) => [monthLabel(m.month), formatINR(m.paidPaise)]) }}
      >
        <Columns data={d.monthlyPayments} category="month" value="paidPaise" format={formatINR} tickLabel={monthLabel} />
      </ChartCard>

      <ChartCard
        title="Material issued, returned and pending"
        subtitle="Issued and returned in the period; pending right now. One chart per unit."
        empty={d.materialFlow.length === 0}
        table={{
          columns: [{ label: "Unit" }, { label: "Issued", right: true }, { label: "Returned", right: true }, { label: "Dmg/rej/lost", right: true }, { label: "Pending", right: true }],
          rows: d.materialFlow.map((m) => [m.unit, formatQty(m.issued), formatQty(m.returned), formatQty(m.exceptions), formatQty(m.pending)]),
        }}
      >
        <View style={{ gap: space.lg }}>
          {d.materialFlow.map((m) => (
            <View key={m.unit} style={{ gap: space.sm }}>
              <Text variant="label">{m.unit}</Text>
              <HBars
                data={[
                  { k: "Issued", v: m.issued },
                  { k: "Returned good", v: m.returned },
                  { k: "Damaged / rejected / lost", v: m.exceptions },
                  { k: "Pending now", v: m.pending },
                ]}
                category="k"
                series={[{ key: "v", label: m.unit }]}
                format={(n) => `${formatQty(n)} ${m.unit}`}
              />
            </View>
          ))}
        </View>
      </ChartCard>

      <ChartCard
        title="Challan aging"
        subtitle="Challans with material outside, by days since issue"
        empty={d.challanAging.every((a) => a.challans === 0)}
        table={{
          columns: [{ label: "Days out" }, { label: "Challans", right: true }, { label: "Pending", right: true }, { label: "Value", right: true }],
          rows: d.challanAging.map((a) => [BUCKET[a.bucket] ?? a.bucket, a.challans, a.pending.map((p) => `${formatQty(p.qty)} ${p.unit}`).join(", ") || "—", formatINR(a.valuePaise)]),
        }}
      >
        <Columns data={d.challanAging} category="bucket" value="challans" format={(n) => `${formatQty(n)} challan${n === 1 ? "" : "s"}`} tickLabel={(b) => BUCKET[b] ?? b} />
      </ChartCard>

      <ChartCard
        title="Outstanding by worker"
        subtitle="Still payable right now (net of advances)"
        empty={d.workerOutstanding.length === 0}
        table={{ columns: [{ label: "Job worker" }, { label: "Outstanding", right: true }], rows: d.workerOutstanding.map((w) => [w.clientName, formatINR(w.outstandingPaise)]) }}
      >
        <HBars data={topN(d.workerOutstanding, 10, "outstandingPaise", "clientName")} category="clientName" series={[{ key: "outstandingPaise", label: "Outstanding" }]} format={rupeesShort} />
      </ChartCard>

      <ChartCard
        title="Pending material by worker"
        subtitle="Quantity with each worker right now, per unit"
        empty={d.workerPending.length === 0}
        table={{ columns: [{ label: "Job worker" }, { label: "Unit" }, { label: "Pending", right: true }], rows: d.workerPending.map((w) => [w.clientName, w.unit, formatQty(w.pending)]) }}
      >
        <View style={{ gap: space.lg }}>
          {units.map((u) => (
            <View key={u} style={{ gap: space.sm }}>
              <Text variant="label">{u}</Text>
              <HBars data={topN(d.workerPending.filter((w) => w.unit === u), 8, "pending", "clientName")} category="clientName" series={[{ key: "pending", label: u }]} format={(n) => `${formatQty(n)} ${u}`} />
            </View>
          ))}
        </View>
      </ChartCard>

      <ChartCard
        title="Average days to complete"
        subtitle="Challan date to the return that completed it (challans dated in the period)"
        empty={d.completionDays.length === 0}
        table={{ columns: [{ label: "Job worker" }, { label: "Avg days", right: true }, { label: "Challans", right: true }], rows: d.completionDays.map((w) => [w.clientName, w.avgDays, w.challans]) }}
      >
        <HBars data={d.completionDays.slice(0, 10)} category="clientName" series={[{ key: "avgDays", label: "Avg days" }]} format={days} />
      </ChartCard>

      <ChartCard
        title="Defects and rejections by worker"
        subtitle="Share of everything returned (challans dated in the period)"
        empty={d.defects.length === 0}
        legend={
          <>
            <LegendItem color={c.chart[1]} label="Defect % (damaged + lost)" />
            <LegendItem color={c.chart[0]} label="Rejection %" />
          </>
        }
        table={{ columns: [{ label: "Job worker" }, { label: "Returned", right: true }, { label: "Defect %", right: true }, { label: "Rejection %", right: true }], rows: d.defects.map((w) => [w.clientName, formatQty(w.accounted), pct(w.defectPct), pct(w.rejectionPct)]) }}
      >
        <HBars
          data={d.defects.slice(0, 10)}
          category="clientName"
          series={[
            { key: "defectPct", label: "Defect %", color: c.chart[1] },
            { key: "rejectionPct", label: "Rejection %", color: c.chart[0] },
          ]}
          format={pct}
        />
      </ChartCard>

      <ChartCard
        title="Job work value by design"
        subtitle="Work received in the period"
        empty={d.byDesign.length === 0}
        table={{ columns: [{ label: "Design" }, { label: "Work value", right: true }], rows: d.byDesign.map((x) => [x.designName, formatINR(x.valuePaise)]) }}
      >
        <HBars data={topN(d.byDesign, 10, "valuePaise", "designName")} category="designName" series={[{ key: "valuePaise", label: "Work value" }]} format={rupeesShort} />
      </ChartCard>

      <ChartCard
        title="Job work value by type"
        subtitle="Work received in the period"
        empty={d.byJobWorkType.length === 0}
        table={{ columns: [{ label: "Job work type" }, { label: "Work value", right: true }], rows: d.byJobWorkType.map((t) => [t.name, formatINR(t.valuePaise)]) }}
      >
        <HBars data={d.byJobWorkType} category="name" series={[{ key: "valuePaise", label: "Work value" }]} format={rupeesShort} />
      </ChartCard>
    </>
  );
}
