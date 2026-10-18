import { formatINR, formatQty, type AttentionItem, type DashboardV2, type HoldingStatus } from "@av/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ArrowDownToLine, ArrowUpRight, Boxes, Check, CircleCheck, FilePlus2, FileText, IndianRupee, Plus, Scissors, Search, Wallet } from "lucide-react-native";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Divider, IconButton, ListRow, SegmentedControl, Section, StatCard, StatGrid, StatusDot, StatusPill, type Status } from "@/components/ds";
import { ErrorBlock, Skeleton, Text } from "@/components/ui";
import { openHref } from "@/lib/links";
import { periodRange, PERIODS, todayLabel, type Period } from "@/lib/period";
import { useDashboard } from "@/lib/queries";
import { hairline, space, useTheme } from "@/theme";

export default function Home() {
  const { c } = useTheme();
  const [period, setPeriod] = useState<Period>("month");
  const q = useDashboard(periodRange(period));
  const d = q.data;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: space.xxxl * 2, gap: space.xxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={q.refetch} colors={[c.accentSolid]} progressBackgroundColor={c.surface} />}
      >
        <QuickActions />
        <View style={{ gap: space.md }}>
          <SegmentedControl value={period} options={PERIODS} onChange={setPeriod} />
          {d ? <Kpis d={d} period={period} /> : q.error ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : <KpiSkeleton />}
        </View>
        {d ? (
          <>
            <Attention items={d.attention} />
            <Holders d={d} />
            <Arrivals d={d} />
          </>
        ) : null}
      </ScrollView>
      {/* Hairline top border for the native tab bar, which has no border of its own on Android. */}
      <Divider />
    </View>
  );
}

/** Logo left, date under it in small muted text; search and create as ghost icon buttons. */
function Header() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.gutter, paddingBottom: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Image source={require("@/../assets/images/av-logo.png")} style={{ width: 100, height: 40 }} contentFit="contain" contentPosition="left" accessibilityRole="header" accessibilityLabel="AV Creation" />
        <Text variant="caption" tone="muted">
          {todayLabel()}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: space.xs }}>
        <IconButton icon={Search} label="Search" onPress={() => router.push("/search")} />
        <IconButton icon={Plus} label="Create" onPress={() => router.push("/create")} />
      </View>
    </View>
  );
}

/** The three jobs done many times a day, one tap each. Recording a return is the one primary action. */
function QuickActions() {
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <Button title="Record return" icon={ArrowDownToLine} variant="primary" onPress={() => router.push("/returns/new")} style={{ flex: 1.2 }} />
      <Button title="New challan" icon={FilePlus2} onPress={() => router.push("/jobs/new")} style={{ flex: 1 }} />
      <Button title="New payment" icon={IndianRupee} onPress={() => router.push("/bills/new")} style={{ flex: 1 }} />
    </View>
  );
}

function Kpis({ d, period }: { d: DashboardV2; period: Period }) {
  const { c } = useTheme();
  const k = d.kpis;
  const inPeriod = period === "all" ? "All time" : PERIODS.find((p) => p.value === period)!.label;
  const outside = k.materialOutside.map((m) => `${formatQty(m.qty)} ${m.unit}`).join(" · ") || "Nothing outside";
  return (
    <View style={{ gap: space.sm }}>
      <Card onPress={() => openHref("/reports?report=to-pay")} accessibilityLabel={`To pay now: ${formatINR(k.outstandingPaise)}`} style={{ padding: space.xl, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="label" tone="muted">
            To pay now
          </Text>
          <ArrowUpRight size={16} color={c.fgFaint} strokeWidth={1.75} />
        </View>
        <Text variant="hero" num numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {formatINR(k.outstandingPaise)}
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {k.overduePayments.count > 0 ? <StatusPill status="danger" label={`${formatINR(k.overduePayments.amountPaise)} overdue · ${k.overduePayments.count}`} /> : <StatusPill status="success" label="Nothing overdue" />}
          {k.advancePaise > 0 ? <StatusPill status="info" label={`${formatINR(k.advancePaise)} advance`} /> : null}
        </View>
      </Card>
      <StatGrid>
        <StatCard icon={Boxes} label="Material outside" value={formatINR(k.materialValueOutsidePaise)} sub={outside} onPress={() => openHref("/reports?report=material-outside")} />
        <StatCard
          icon={FileText}
          label="Active challans"
          value={formatQty(k.activeChallans)}
          sub={k.overdueChallans ? `${k.overdueChallans} overdue` : `${k.activeWorkers} worker${k.activeWorkers === 1 ? "" : "s"}`}
          subStatus={k.overdueChallans ? "danger" : undefined}
          onPress={() => openHref("/jobs?status=active")}
        />
        <StatCard icon={Scissors} label="Work done" value={formatINR(k.workValuePaise)} sub={inPeriod} onPress={() => openHref("/reports?report=job-work-by-worker")} />
        <StatCard icon={Wallet} label="Paid" value={formatINR(k.paidPaise)} sub={inPeriod} onPress={() => openHref("/bills")} />
      </StatGrid>
    </View>
  );
}

function KpiSkeleton() {
  return (
    <View style={{ gap: space.sm }} accessibilityLabel="Loading">
      <Card style={{ padding: space.xl, gap: space.md }}>
        <Skeleton width={80} height={12} />
        <Skeleton width={190} height={40} />
        <Skeleton width={120} height={20} r={10} />
      </Card>
      <StatGrid>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} style={{ flexBasis: "47%", flexGrow: 1, gap: space.md }}>
            <Skeleton width="60%" height={12} />
            <View style={{ gap: 6 }}>
              <Skeleton width="75%" height={22} />
              <Skeleton width="40%" height={10} />
            </View>
          </Card>
        ))}
      </StatGrid>
    </View>
  );
}

const ATTENTION_STATUS: Record<AttentionItem["tone"], Status> = { danger: "danger", attention: "warning", warning: "warning" };

function Attention({ items }: { items: AttentionItem[] }) {
  const { c } = useTheme();
  return (
    <Section title="Needs attention">
      {items.length ? (
        <Card padded={false}>
          {items.map((it, i) => (
            <ListRow
              key={it.kind}
              first={!i}
              status={ATTENTION_STATUS[it.tone]}
              title={it.label}
              meta={String(it.count)}
              subtitle={`${it.records[0]?.label ?? it.hint}${it.count > 1 && it.records[0] ? ` +${it.count - 1} more` : ""}`}
              trailing={it.amountPaise ? formatINR(it.amountPaise) : undefined}
              accessibilityHint={it.hint}
              onPress={() => openHref(it.href)}
            />
          ))}
        </Card>
      ) : (
        <Card style={{ alignItems: "center", paddingVertical: space.xxl, gap: space.sm }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: hairline, borderColor: c.border, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
            <Check size={18} color={c.success} strokeWidth={2} />
          </View>
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text variant="bodyStrong">All clear</Text>
            <Text variant="label" tone="muted" align="center">
              Nothing overdue or waiting on you.
            </Text>
          </View>
        </Card>
      )}
    </Section>
  );
}

const HOLD_STATUS: Record<HoldingStatus, Status> = { OVERDUE: "danger", AGING: "warning", OK: "neutral" };

function Holders({ d }: { d: DashboardV2 }) {
  const rows = d.materialHolders.slice(0, 5);
  if (!rows.length) return null;
  return (
    <Section title="Who has my material" action={{ label: "View all", onPress: () => openHref("/reports?report=material-outside") }}>
      <Card padded={false}>
        {rows.map((h, i) => (
          <ListRow
            key={`${h.clientId}-${h.materialId ?? h.unit}`}
            first={!i}
            title={h.clientName}
            subtitle={`${h.materialName} · ${h.challans} challan${h.challans === 1 ? "" : "s"}`}
            onPress={() => openHref(`/clients/${h.clientId}`)}
            trailing={
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text variant="label" num>
                  {formatQty(h.qty)} <Text variant="caption" tone="muted">{h.unit}</Text>
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <StatusDot status={HOLD_STATUS[h.status]} />
                  <Text variant="caption" num tone={h.status === "OVERDUE" ? "danger" : "muted"}>
                    {h.daysOutside} days
                  </Text>
                </View>
              </View>
            }
          />
        ))}
      </Card>
    </Section>
  );
}

function Arrivals({ d }: { d: DashboardV2 }) {
  const { c } = useTheme();
  const rows = d.todayReturns;
  return (
    <Section title="Arrived today" action={rows.length ? { label: "Returns", onPress: () => router.push("/returns?tab=today") } : undefined}>
      {rows.length ? (
        <Card padded={false}>
          {rows.slice(0, 6).map((r, i) => (
            <ListRow
              key={r.returnLineId}
              first={!i}
              title={r.client.name}
              meta={new Date(r.receivedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              subtitle={`${r.designName} · ${r.job.jobNumber}`}
              onPress={() => openHref(`/returns/${r.returnId}`)}
              trailing={
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text variant="label" num>
                    {formatQty(r.okQty)} {r.unit}
                  </Text>
                  <Text variant="caption" tone="muted" num>
                    {formatINR(r.valuePaise)}
                  </Text>
                </View>
              }
            />
          ))}
        </Card>
      ) : (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <CircleCheck size={16} color={c.fgFaint} strokeWidth={1.75} />
          <Text variant="label" tone="muted">
            No returns yet today.
          </Text>
        </Card>
      )}
    </Section>
  );
}
