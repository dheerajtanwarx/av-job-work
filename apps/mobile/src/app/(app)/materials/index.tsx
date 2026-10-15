import { formatINR, formatQty, type MaterialRow } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { router, Stack } from "expo-router";
import { Boxes, Plus } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { MovementFilters, MovementLedger, useMovements, type MovementFilter } from "@/components/domain/materials";
import { Badge, Chip, ChipRow, EmptyState, ErrorBlock, Fab, ListSkeleton, SearchBar, Segmented, Stat, StatGrid, Text } from "@/components/ui";
import { useMaterials } from "@/lib/queries";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

export default function Materials() {
  const { c } = useTheme();
  const [tab, setTab] = useState<"materials" | "movements">("materials");
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Materials & stock" }} />
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "materials", label: "Materials" },
            { value: "movements", label: "Stock movements" },
          ]}
        />
      </View>
      {tab === "materials" ? <MaterialList /> : <Movements />}
    </View>
  );
}

function MaterialList() {
  const { c } = useTheme();
  const [q, setQ] = useState("");
  const [active, setActive] = useState<"true" | "false" | "">("true");
  const list = useMaterials({ active: active === "" ? undefined : active === "true", q: q || undefined });
  const rows = list.data ?? [];
  const sums = { out: 0, withWorkers: 0, empty: 0 };
  for (const m of rows) {
    sums.out += m.outsideValuePaise;
    if (m.stock.withWorkers > 0) sums.withWorkers++;
    if (m.stock.available <= 0) sums.empty++;
  }
  const add = () => router.push("/materials/new");

  return (
    <>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.error && !list.data ? (
        <ErrorBlock error={list.error} onRetry={list.refetch} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MaterialCard m={item} />}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          ListHeaderComponent={
            <View style={{ gap: space.md, paddingBottom: space.md }}>
              {rows.length > 0 && !q ? (
                <StatGrid>
                  <Stat label="Value outside" value={formatINR(sums.out)} sub="at challan rates" />
                  <Stat label="With job workers" value={formatQty(sums.withWorkers)} sub="partly outside" tone={sums.withWorkers ? "warning" : "default"} />
                  <Stat label="Materials" value={formatQty(rows.length)} sub={active === "true" ? "active" : active === "false" ? "inactive" : "in all"} />
                  <Stat label="Out of stock" value={formatQty(sums.empty)} sub="nothing in warehouse" tone={sums.empty ? "warning" : "default"} />
                </StatGrid>
              ) : null}
              <SearchBar value={q} onChange={setQ} placeholder="Code, name, lot, roll, colour…" />
              <View style={{ marginHorizontal: -space.gutter }}>
                <ChipRow>
                  <Chip label="Active" selected={active === "true"} onPress={() => setActive("true")} />
                  <Chip label="Inactive" selected={active === "false"} onPress={() => setActive("false")} />
                  <Chip label="All" selected={active === ""} onPress={() => setActive("")} />
                </ChipRow>
              </View>
            </View>
          }
          ListEmptyComponent={
            q ? (
              <EmptyState icon={Boxes} title="No matching materials" />
            ) : (
              <EmptyState icon={Boxes} title="No materials yet" body="Add the fabric, sarees or blouses you issue to job workers, with their opening stock." action={{ title: "Add material", onPress: add }} />
            )
          }
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[c.accentSolid]} />}
        />
      )}
      <Fab icon={Plus} label="New material" onPress={add} />
    </>
  );
}

const MaterialCard = memo(function MaterialCard({ m }: { m: MaterialRow }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  const detail = [m.color, m.fabricType, m.lotNumber && `Lot ${m.lotNumber}`, m.rollNumber && `Roll ${m.rollNumber}`].filter(Boolean).join(" · ");
  return (
    <View style={[s.card, !m.isActive && { opacity: 0.6 }]}>
      <Pressable onPress={() => router.push(`/materials/${m.id}`)} android_ripple={{ color: c.surface3 }} style={s.inner} accessibilityRole="button">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {m.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[m.code, detail || m.product?.name].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {!m.isActive ? <Badge label="Inactive" /> : null}
        </View>
        <View style={s.figures}>
          <Figure label="Warehouse" value={formatQty(m.stock.available)} unit={m.unit} tone={m.stock.available < 0 ? "danger" : m.stock.available === 0 ? "muted" : "default"} />
          <Figure label={m.workers ? `With ${m.workers} worker${m.workers === 1 ? "" : "s"}` : "With workers"} value={formatQty(m.stock.withWorkers)} unit={m.unit} tone={m.stock.withWorkers ? "warning" : "muted"} />
          <Figure label="Damaged" value={formatQty(m.stock.damagedHeld)} tone={m.stock.damagedHeld ? "danger" : "muted"} />
        </View>
      </Pressable>
    </View>
  );
});

function Figure({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone: "default" | "muted" | "warning" | "danger" }) {
  return (
    <View style={{ flex: 1, gap: 1 }}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="bodyStrong" num tone={tone} numberOfLines={1}>
        {value}
        {unit ? (
          <Text variant="caption" tone="muted">
            {" "}
            {unit}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function Movements() {
  const [f, setF] = useState<MovementFilter>({});
  const q = useMovements(f);
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxxl, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <MovementFilters value={f} onChange={setF} />
      <MovementLedger rows={q.data} isPending={q.isPending} error={q.error} onRetry={q.refetch} showMaterial />
    </ScrollView>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border },
    inner: { padding: space.md + 2, gap: space.md },
    figures: { flexDirection: "row", gap: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
  });
