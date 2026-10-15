import { formatDate, formatINR, formatQty, roundQty } from "@av/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { MinusCircle, PackagePlus, Pencil, Users } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { MovementLedger, useMaterial, useMovements } from "@/components/domain/materials";
import { Badge, Button, Card, EmptyState, ErrorBlock, IconButton, ListSkeleton, Section, Stat, StatGrid, Text } from "@/components/ui";
import { space, useTheme } from "@/theme";

const OUT = new Set(["INITIAL", "ADDITIONAL", "REWORK"]);
const BACK = new Set(["RETURN", "DAMAGED", "REJECTED", "LOST"]);

export default function MaterialDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const one = useMaterial(id);
  // All-time movements: drive both the per-worker split and the ledger (with running balance).
  const moves = useMovements({ materialId: id });

  if (one.isPending)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "Material" }} />
        <ListSkeleton rows={5} />
      </View>
    );
  if (one.error || !one.data)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: "Material" }} />
        <ErrorBlock error={one.error} onRetry={one.refetch} />
      </View>
    );

  const m = one.data;
  const s = m.stock;

  // Quantity with each worker, from the movement ledger.
  const byWorker = new Map<string, { id: string; name: string; qty: number; challans: Set<string>; since: string }>();
  for (const r of moves.data ?? []) {
    if (r.voided || !r.client) continue;
    const sign = OUT.has(r.type) ? 1 : BACK.has(r.type) ? -1 : 0;
    if (!sign) continue;
    const w = byWorker.get(r.client.id) ?? { id: r.client.id, name: r.client.name, qty: 0, challans: new Set<string>(), since: r.date };
    w.qty = roundQty(w.qty + sign * r.qty);
    if (r.job) w.challans.add(r.job.id);
    if (sign > 0 && r.date < w.since) w.since = r.date;
    byWorker.set(r.client.id, w);
  }
  const workers = [...byWorker.values()].filter((w) => w.qty > 0).sort((a, b) => b.qty - a.qty);
  const total = roundQty(Math.max(0, s.available) + s.withWorkers + s.damagedHeld);
  const facts = [m.fabricType, m.color, m.product?.name, m.design && `Design: ${m.design.name}`, m.lotNumber && `Lot ${m.lotNumber}`, m.rollNumber && `Roll ${m.rollNumber}`, m.supplier && `Supplier: ${m.supplier}`, m.location && `At: ${m.location}`].filter(Boolean).join(" · ");

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: m.code, headerRight: () => <IconButton icon={Pencil} label="Edit material" onPress={() => router.push(`/materials/${m.id}/edit`)} /> }} />
      <ScrollView
        contentContainerStyle={{ padding: space.gutter, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxxl }}
        refreshControl={
          <RefreshControl
            refreshing={one.isRefetching || moves.isRefetching}
            onRefresh={() => {
              one.refetch();
              moves.refetch();
            }}
            colors={[c.accentSolid]}
          />
        }
      >
        <View style={{ gap: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
            <Text variant="title">{m.name}</Text>
            {!m.isActive ? <Badge label="Inactive" /> : null}
          </View>
          <Text tone="muted">{[m.unit, facts].filter(Boolean).join(" · ")}</Text>
          {m.notes ? (
            <Text variant="caption" tone="muted">
              {m.notes}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Receive stock" icon={PackagePlus} onPress={() => router.push(`/materials/${m.id}/stock?action=RECEIPT`)} style={{ flex: 1 }} />
          <Button title="Adjust" icon={MinusCircle} variant="secondary" onPress={() => router.push(`/materials/${m.id}/stock?action=ADJUSTMENT`)} style={{ flex: 1 }} />
        </View>

        <StatGrid>
          <Stat label="In warehouse" value={`${formatQty(s.available)} ${m.unit}`} tone={s.available < 0 ? "danger" : "default"} sub="Good stock, ready to issue" />
          <Stat label="With job workers" value={`${formatQty(s.withWorkers)} ${m.unit}`} tone={s.withWorkers ? "warning" : "default"} sub={`${m.workers} worker${m.workers === 1 ? "" : "s"}`} />
          <Stat label="Damaged / rejected" value={`${formatQty(s.damagedHeld)} ${m.unit}`} tone={s.damagedHeld ? "danger" : "default"} sub="Back, not sent for rework" />
          <Stat label="Lost" value={`${formatQty(s.lost)} ${m.unit}`} tone={s.lost ? "danger" : "default"} sub="Written off" />
          <Stat label="Value outside" value={formatINR(m.outsideValuePaise)} sub="At challan rates" />
        </StatGrid>

        {total > 0 ? (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 1, backgroundColor: c.surface3 }}>
              {s.available > 0 ? <View style={{ flex: s.available / total, backgroundColor: c.success }} /> : null}
              {s.withWorkers > 0 ? <View style={{ flex: s.withWorkers / total, backgroundColor: c.warningSolid }} /> : null}
              {s.damagedHeld > 0 ? <View style={{ flex: s.damagedHeld / total, backgroundColor: c.danger }} /> : null}
            </View>
            <View style={{ flexDirection: "row", gap: space.lg, flexWrap: "wrap" }}>
              <Legend color={c.success} label="Warehouse" />
              <Legend color={c.warningSolid} label="With workers" />
              <Legend color={c.danger} label="Damaged held" />
            </View>
          </View>
        ) : null}

        <Section title="Where it is">
          <Card padded={false}>
            <Place title="Warehouse" sub={m.location ?? "Good stock"} qty={s.available} unit={m.unit} tone={s.available < 0 ? "danger" : "default"} />
            {s.damagedHeld > 0 ? <Place title="Warehouse – damaged / rejected" sub="Can be sent for rework" qty={s.damagedHeld} unit={m.unit} tone="danger" /> : null}
            {moves.isPending ? (
              <Text variant="caption" tone="muted" style={{ padding: space.lg }}>
                Loading workers…
              </Text>
            ) : workers.length === 0 ? (
              <EmptyState icon={Users} title="Nothing with job workers" />
            ) : (
              workers.map((w, i) => (
                <Place
                  key={w.id}
                  title={w.name}
                  sub={`${w.challans.size} challan${w.challans.size === 1 ? "" : "s"} · since ${formatDate(w.since)}`}
                  qty={w.qty}
                  unit={m.unit}
                  tone="warning"
                  last={i === workers.length - 1}
                  onPress={() => router.push(`/clients/${w.id}`)}
                />
              ))
            )}
          </Card>
        </Section>

        <Section title="Movement ledger">
          <MovementLedger rows={moves.data} isPending={moves.isPending} error={moves.error} onRetry={moves.refetch} showBalance />
        </Section>
      </ScrollView>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function Place({ title, sub, qty, unit, tone, last, onPress }: { title: string; sub: string; qty: number; unit: string; tone: "default" | "warning" | "danger"; last?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      android_ripple={{ color: c.surface3 }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: c.borderStrong }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text variant="headline" num tone={tone}>
        {formatQty(qty)}{" "}
        <Text variant="caption" tone="muted">
          {unit}
        </Text>
      </Text>
    </Pressable>
  );
}
