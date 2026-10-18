import { formatINR, formatQty, type ClientListRow } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { router, Stack } from "expo-router";
import { UserPlus, Users } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AuthedImage, Chip, ChipRow, EmptyState, ErrorBlock, Fab, ListSkeleton, SearchBar, Text } from "@/components/ui";
import { useClientList } from "@/lib/queries";
import { termsLabel } from "@/lib/terms";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

export default function Clients() {
  const { c } = useTheme();
  const [q, setQ] = useState("");
  const [active, setActive] = useState<"true" | "false" | "">("true");
  const list = useClientList({ q: q || undefined, active: active || undefined });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Job workers" }} />
      <View style={{ gap: space.md, paddingBottom: space.md }}>
        <View style={{ paddingHorizontal: space.gutter }}>
          <SearchBar value={q} onChange={setQ} placeholder="Name, code or mobile" />
        </View>
        <ChipRow>
          <Chip label="Active" selected={active === "true"} onPress={() => setActive("true")} />
          <Chip label="Archived" selected={active === "false"} onPress={() => setActive("false")} />
          <Chip label="All" selected={active === ""} onPress={() => setActive("")} />
        </ChipRow>
      </View>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.error && !list.data ? (
        <ErrorBlock error={list.error} onRetry={list.refetch} />
      ) : (
        <FlashList
          data={list.data}
          keyExtractor={(w) => w.id}
          renderItem={({ item }) => <WorkerRow w={item} />}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          ListEmptyComponent={<EmptyState icon={Users} title={q ? "No one matches" : "No job workers yet"} action={{ title: "Add job worker", onPress: () => router.push("/clients/new") }} />}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[c.accentSolid]} />}
        />
      )}
      <Fab icon={UserPlus} label="New worker" onPress={() => router.push("/clients/new")} />
    </View>
  );
}

const WorkerRow = memo(function WorkerRow({ w }: { w: ClientListRow }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  const initials = w.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={[s.card, !w.isActive && { opacity: 0.6 }]}>
      <Pressable onPress={() => router.push(`/clients/${w.id}`)} style={({ pressed }) => [s.inner, pressed && { backgroundColor: c.surface2 }]} accessibilityRole="button">
        {w.photoId ? (
          <AuthedImage path={`/worker-documents/${w.photoId}/thumb`} style={s.avatar} />
        ) : (
          <View style={[s.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border }]}>
            <Text variant="label" tone="secondary">
              {initials}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {w.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {[w.workerCode, w.phone, w.workItems].filter(Boolean).join(" · ")}
          </Text>
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {w.activeJobs} active · {termsLabel(w.paymentPolicy, w.paymentDays)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          {w.toPayPaise > 0 ? (
            <Text variant="bodyStrong" num>
              {formatINR(w.toPayPaise)}
            </Text>
          ) : null}
          {w.pendingPieces > 0 ? (
            <Text variant="caption" tone="muted" num>
              {formatQty(w.pendingPieces)} out
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { borderRadius: radius.card, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    inner: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
    avatar: { width: 40, height: 40, borderRadius: 20 },
  });
