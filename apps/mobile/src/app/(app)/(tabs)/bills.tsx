import { formatINR, formatShortDate, PAYMENT_METHOD_LABEL, type MainBillRow, type MoneySummary, type SubBillRow } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { IndianRupee, Search, Wallet } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Badge, EmptyState, ErrorBlock, Fab, IconButton, ListSkeleton, SearchBar, Segmented, TabHeader, Text } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

type Tab = "vouchers" | "settlements";

export default function Bills() {
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>("vouchers");
  const [q, setQ] = useState("");
  const filters = { q: q || undefined };
  const subBills = useQuery({ queryKey: ["sub-bills", filters], queryFn: () => api.get<SubBillRow[]>(`/sub-bills${qs(filters)}`), placeholderData: (p) => p });
  const mainBills = useQuery({
    queryKey: ["main-bills", filters],
    queryFn: () => api.get<MainBillRow[]>(`/main-bills${qs(filters)}`),
    placeholderData: (p) => p,
    enabled: tab === "settlements",
  });
  const money = useQuery({ queryKey: ["money", undefined], queryFn: () => api.get<{ money: MoneySummary }>("/dashboard").then((d) => d.money) });
  const list = tab === "vouchers" ? subBills : mainBills;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="Payments" right={<IconButton icon={Search} label="Search everything" onPress={() => router.push("/search")} />} />
      <View style={{ gap: space.md, paddingHorizontal: space.gutter, paddingBottom: space.md }}>
        <Summary m={money.data} />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "vouchers", label: "Payment vouchers" },
            { value: "settlements", label: "Final settlements" },
          ]}
        />
        <SearchBar value={q} onChange={setQ} placeholder="Voucher no., worker, challan…" />
      </View>
      {list.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.error && !list.data ? (
        <ErrorBlock error={list.error} onRetry={list.refetch} />
      ) : tab === "vouchers" ? (
        <FlashList
          data={subBills.data}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <VoucherRow b={item} />}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          ListEmptyComponent={<EmptyState icon={Wallet} title={q ? "No vouchers match" : "No payments yet"} body="Each payment to a job worker is saved as a payment voucher." />}
          refreshControl={<RefreshControl refreshing={subBills.isRefetching} onRefresh={() => (subBills.refetch(), money.refetch())} colors={[c.accentSolid]} progressBackgroundColor={c.surface} />}
        />
      ) : (
        <FlashList
          data={mainBills.data}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <SettlementRow b={item} />}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          ListEmptyComponent={<EmptyState icon={Wallet} title="No final settlements yet" body="A final settlement is made automatically once a challan is complete and fully paid." />}
          refreshControl={<RefreshControl refreshing={mainBills.isRefetching} onRefresh={mainBills.refetch} colors={[c.accentSolid]} progressBackgroundColor={c.surface} />}
        />
      )}
      <Fab icon={IndianRupee} label="New payment" onPress={() => router.push("/bills/new")} />
    </View>
  );
}

function Summary({ m }: { m?: MoneySummary }) {
  const s = useStyles(styles);
  const cell = (label: string, v: number | undefined, tone?: "warning") => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="headline" num tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {v === undefined ? "—" : formatINR(v)}
      </Text>
    </View>
  );
  return (
    <View style={s.summary}>
      {cell("Work done", m?.completedValuePaise)}
      <View style={s.divider} />
      {cell("Paid", m?.paidPaise)}
      <View style={s.divider} />
      {cell("To pay", m?.toPayPaise, m?.toPayPaise ? "warning" : undefined)}
    </View>
  );
}

const VoucherRow = memo(function VoucherRow({ b }: { b: SubBillRow }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  return (
    <View style={[s.card, b.voidedAt && { opacity: 0.55 }]}>
      <Pressable onPress={() => router.push(`/bills/sub/${b.id}`)} android_ripple={{ color: c.surface3 }} style={s.inner} accessibilityRole="button">
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {b.client.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {b.billNumber} · {b.job.jobNumber}
            {b.returnNumber ? ` · ${b.returnNumber}` : ""}
          </Text>
          <Text variant="caption" tone="faint">
            {formatShortDate(b.date)} · {PAYMENT_METHOD_LABEL[b.method]}
            {b.reference ? ` · ${b.reference}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text variant="headline" num style={b.voidedAt ? { textDecorationLine: "line-through" } : undefined}>
            {formatINR(b.amountPaise)}
          </Text>
          {b.voidedAt ? <Badge tone="danger" label="Voided" /> : b.edited ? <Badge label="Edited" /> : null}
        </View>
      </Pressable>
    </View>
  );
});

const SettlementRow = memo(function SettlementRow({ b }: { b: MainBillRow }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  return (
    <View style={[s.card, b.cancelledAt && { opacity: 0.55 }]}>
      <Pressable onPress={() => router.push(`/bills/main/${b.id}`)} android_ripple={{ color: c.surface3 }} style={s.inner} accessibilityRole="button">
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {b.client.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {b.billNumber} · {b.job.jobNumber} · {b.job.productName}
          </Text>
          <Text variant="caption" tone="faint">
            {formatShortDate(b.date)} · {b.subBillCount} voucher{b.subBillCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text variant="headline" num>
            {formatINR(b.totalPaise)}
          </Text>
          {b.cancelledAt ? <Badge tone="danger" label="Cancelled" /> : <Badge tone="success" label="Settled" />}
        </View>
      </Pressable>
    </View>
  );
});

const styles = (c: Palette) =>
  StyleSheet.create({
    summary: { flexDirection: "row", padding: space.lg, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border, gap: space.md },
    divider: { width: StyleSheet.hairlineWidth, backgroundColor: c.borderStrong },
    card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border },
    inner: { padding: space.lg, gap: space.md, flexDirection: "row", alignItems: "center" },
  });
