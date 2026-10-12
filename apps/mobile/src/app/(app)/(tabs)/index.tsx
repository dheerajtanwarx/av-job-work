import { formatINR, formatQty, type AttentionItem, type DashboardV2, type HoldingStatus } from "@av/shared";
import { router } from "expo-router";
import { ArrowDownToLine, ChevronRight, FilePlus2, IndianRupee, PackageCheck, Plus, Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Badge, Card, Chip, ChipRow, ErrorBlock, IconButton, Section, Skeleton, TabHeader, Text, toneColors, type Tone } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { openHref } from "@/lib/links";
import { greeting, periodRange, PERIODS, todayLabel, type Period } from "@/lib/period";
import { useDashboard } from "@/lib/queries";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

export default function Home() {
  const { user } = useAuth();
  const { c } = useTheme();
  const [period, setPeriod] = useState<Period>("month");
  const q = useDashboard(periodRange(period));
  const d = q.data;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader
        title={`${greeting()}, ${user?.name.split(" ")[0] ?? ""}`}
        subtitle={todayLabel()}
        right={
          <>
            <IconButton icon={Search} label="Search" onPress={() => router.push("/search")} />
            <IconButton icon={Plus} label="Create" onPress={() => router.push("/create")} />
          </>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxxl * 2, gap: space.xxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={q.refetch} colors={[c.accentSolid]} progressBackgroundColor={c.surface} />}
      >
        <QuickActions />
        <View style={{ gap: space.md }}>
          <ChipRow>
            {PERIODS.map((p) => (
              <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} />
            ))}
          </ChipRow>
          <View style={{ paddingHorizontal: space.gutter }}>{d ? <Kpis d={d} period={period} /> : q.error ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : <KpiSkeleton />}</View>
        </View>
        {d ? (
          <View style={{ paddingHorizontal: space.gutter, gap: space.xxl }}>
            <Attention items={d.attention} />
            <Holders d={d} />
            <Arrivals d={d} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The three jobs done many times a day, one tap each. */
function QuickActions() {
  const s = useStyles(styles);
  const { c } = useTheme();
  const actions = [
    { label: "Record\nreturn", icon: ArrowDownToLine, href: "/returns/new", primary: true },
    { label: "New\nchallan", icon: FilePlus2, href: "/jobs/new" },
    { label: "New\npayment", icon: IndianRupee, href: "/bills/new" },
  ] as const;
  return (
    <View style={s.quick}>
      {actions.map((a) => {
        const primary = "primary" in a;
        return (
          <Pressable
            key={a.href}
            accessibilityRole="button"
            accessibilityLabel={a.label.replace("\n", " ")}
            onPress={() => router.push(a.href)}
            android_ripple={{ color: primary ? "rgba(255,255,255,0.2)" : c.surface3 }}
            style={[s.quickBtn, primary ? { backgroundColor: c.accentSolid, borderColor: c.accentSolid } : null]}
          >
            <a.icon size={22} color={primary ? c.onAccent : c.accent} strokeWidth={2} />
            <Text variant="label" style={{ color: primary ? c.onAccent : c.fg, lineHeight: 17 }}>
              {a.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Kpis({ d, period }: { d: DashboardV2; period: Period }) {
  const s = useStyles(styles);
  const k = d.kpis;
  const inPeriod = period === "all" ? "all time" : PERIODS.find((p) => p.value === period)!.label.toLowerCase();
  const outside = k.materialOutside.map((m) => `${formatQty(m.qty)} ${m.unit}`).join(" · ") || "Nothing outside";
  return (
    <View style={{ gap: space.md }}>
      <Card onPress={() => openHref("/reports?report=to-pay")} contentStyle={s.hero}>
        <Text variant="overline" tone="muted">
          To pay now
        </Text>
        <Text variant="display" num style={{ fontSize: 34, lineHeight: 40 }}>
          {formatINR(k.outstandingPaise)}
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {k.overduePayments.count > 0 ? <Badge tone="danger" label={`${formatINR(k.overduePayments.amountPaise)} overdue · ${k.overduePayments.count}`} /> : <Badge tone="success" label="Nothing overdue" />}
          {k.advancePaise > 0 ? <Badge tone="info" label={`${formatINR(k.advancePaise)} advance`} /> : null}
        </View>
      </Card>
      <View style={s.grid}>
        <Tile label="Material outside" value={formatINR(k.materialValueOutsidePaise)} sub={outside} href="/reports?report=material-outside" />
        <Tile label="Active challans" value={formatQty(k.activeChallans)} sub={k.overdueChallans ? `${k.overdueChallans} overdue` : `${k.activeWorkers} worker${k.activeWorkers === 1 ? "" : "s"}`} subTone={k.overdueChallans ? "danger" : undefined} href="/jobs?status=active" />
        <Tile label="Work done" value={formatINR(k.workValuePaise)} sub={inPeriod} href="/reports?report=job-work-by-worker" />
        <Tile label="Paid" value={formatINR(k.paidPaise)} sub={inPeriod} href="/bills" />
      </View>
    </View>
  );
}

function Tile({ label, value, sub, subTone, href }: { label: string; value: string; sub: string; subTone?: "danger"; href: string }) {
  const s = useStyles(styles);
  return (
    <Card onPress={() => openHref(href)} style={s.tile} padded={false}>
      <View style={{ padding: space.md + 2, gap: 2 }}>
        <Text variant="label" tone="muted" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="headline" num numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 19, lineHeight: 25 }}>
          {value}
        </Text>
        <Text variant="caption" tone={subTone ?? "muted"} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Card>
  );
}

function KpiSkeleton() {
  const s = useStyles(styles);
  return (
    <View style={{ gap: space.md }}>
      <Card style={[s.hero, { gap: space.sm }]}>
        <Skeleton width={90} height={11} />
        <Skeleton width={180} height={34} />
        <Skeleton width={140} height={18} />
      </Card>
      <View style={s.grid}>
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} style={[s.tile, { gap: 6 }]}>
            <Skeleton width="60%" height={12} />
            <Skeleton width="75%" height={20} />
            <Skeleton width="40%" height={10} />
          </Card>
        ))}
      </View>
    </View>
  );
}

const ATTENTION_TONE: Record<AttentionItem["tone"], Tone> = { danger: "danger", attention: "warning", warning: "warning" };

function Attention({ items }: { items: AttentionItem[] }) {
  const { c } = useTheme();
  if (!items.length)
    return (
      <Section title="Needs attention">
        <Card style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <PackageCheck size={22} color={c.success} />
          <Text tone="secondary" style={{ flex: 1 }}>
            All clear. Nothing overdue or waiting on you.
          </Text>
        </Card>
      </Section>
    );
  return (
    <Section title="Needs attention">
      <Card padded={false}>
        {items.map((it, i) => {
          const t = toneColors(c, ATTENTION_TONE[it.tone]);
          return (
            <Pressable
              key={it.kind}
              onPress={() => openHref(it.href)}
              android_ripple={{ color: c.surface3 }}
              accessibilityRole="button"
              accessibilityHint={it.hint}
              style={{ flexDirection: "row", gap: space.md, padding: space.lg, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong, alignItems: "center" }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
                <Text variant="label" num style={{ color: t.fg }}>
                  {it.count}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="bodyStrong">{it.label}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {it.records[0]?.label ?? it.hint}
                  {it.count > 1 && it.records[0] ? ` +${it.count - 1} more` : ""}
                </Text>
              </View>
              {it.amountPaise ? (
                <Text variant="label" num style={{ color: t.fg }}>
                  {formatINR(it.amountPaise)}
                </Text>
              ) : null}
              <ChevronRight size={18} color={c.fgFaint} />
            </Pressable>
          );
        })}
      </Card>
    </Section>
  );
}

const HOLD_TONE: Record<HoldingStatus, Tone> = { OVERDUE: "danger", AGING: "warning", OK: "neutral" };

function Holders({ d }: { d: DashboardV2 }) {
  const { c } = useTheme();
  const rows = d.materialHolders.slice(0, 5);
  if (!rows.length) return null;
  return (
    <Section title="Who has my material" action={{ label: "All", onPress: () => openHref("/reports?report=material-outside") }}>
      <Card padded={false}>
        {rows.map((h, i) => (
          <Pressable
            key={`${h.clientId}-${h.materialId ?? h.unit}`}
            onPress={() => openHref(`/clients/${h.clientId}`)}
            android_ripple={{ color: c.surface3 }}
            style={{ flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong, alignItems: "center" }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {h.clientName}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {h.materialName} · {h.challans} challan{h.challans === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <Text variant="bodyStrong" num>
                {formatQty(h.qty)} <Text variant="caption" tone="muted">{h.unit}</Text>
              </Text>
              <Badge look="dot" tone={HOLD_TONE[h.status]} label={`${h.daysOutside} days`} />
            </View>
          </Pressable>
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
            <Pressable
              key={r.returnLineId}
              onPress={() => openHref(`/returns/${r.returnId}`)}
              android_ripple={{ color: c.surface3 }}
              style={{ flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c.borderStrong }}
            >
              <Text variant="caption" tone="muted" num style={{ width: 44, paddingTop: 2 }}>
                {new Date(r.receivedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {r.client.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {r.designName} · {r.job.jobNumber}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text variant="bodyStrong" num>
                  {formatQty(r.okQty)} {r.unit}
                </Text>
                <Text variant="caption" tone="muted" num>
                  {formatINR(r.valuePaise)}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Card>
          <Text tone="muted">No returns yet today.</Text>
        </Card>
      )}
    </Section>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    quick: { flexDirection: "row", gap: space.sm + 2, paddingHorizontal: space.gutter, paddingTop: space.sm },
    quickBtn: { flex: 1, minHeight: 84, padding: space.md, gap: space.sm, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden", justifyContent: "space-between" },
    hero: { gap: space.xs + 2, padding: space.xl },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
    tile: { flexBasis: "47%", flexGrow: 1 },
  });
