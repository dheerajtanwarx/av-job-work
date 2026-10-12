import { formatINR, formatQty, formatShortDate, todayISO, type ReturnRow } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowDownToLine, Camera, Inbox, Search } from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { PayStatusBadge } from "@/components/domain/status";
import { AuthedImage, Badge, EmptyState, ErrorBlock, Fab, IconButton, ListSkeleton, SearchBar, Segmented, TabHeader, Text } from "@/components/ui";
import { useReturnsInfinite } from "@/lib/queries";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

type Tab = "today" | "all";

export default function Returns() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "today" ? "today" : "all");
  const [q, setQ] = useState("");
  const today = todayISO();
  const list = useReturnsInfinite(tab === "today" ? { from: today, to: today, q: q || undefined } : { q: q || undefined });
  const rows = list.data?.pages.flatMap((p) => p.rows);
  const total = list.data?.pages[0]?.total ?? 0;
  const value = (rows ?? []).filter((r) => !r.voidedAt).reduce((s, r) => s + r.valuePaise, 0);
  const renderItem = useCallback(({ item }: { item: ReturnRow }) => <ReturnCard r={item} showDate={tab === "all"} />, [tab]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="Returns" right={<IconButton icon={Search} label="Search everything" onPress={() => router.push("/search")} />} />
      <View style={{ gap: space.md, paddingHorizontal: space.gutter, paddingBottom: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "today", label: "Today" },
            { value: "all", label: "All returns" },
          ]}
        />
        <SearchBar value={q} onChange={setQ} placeholder="Return no., worker, challan…" />
      </View>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.error && !rows ? (
        <ErrorBlock error={list.error} onRetry={list.refetch} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            rows?.length ? (
              <Text variant="caption" tone="muted" num style={{ paddingBottom: space.md, paddingHorizontal: space.xs }}>
                {total} return{total === 1 ? "" : "s"} · {formatINR(value)} of work{tab === "all" && rows.length < total ? " (loaded so far)" : ""}
              </Text>
            ) : null
          }
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={c.accent} style={{ margin: space.lg }} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon={Inbox}
              title={tab === "today" ? "Nothing returned today" : q ? "No returns match" : "No returns yet"}
              body={tab === "today" ? "When a job worker brings work back, record it here." : undefined}
              action={{ title: "Record return", onPress: () => router.push("/returns/new") }}
            />
          }
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={list.refetch} colors={[c.accentSolid]} progressBackgroundColor={c.surface} />}
        />
      )}
      <Fab icon={ArrowDownToLine} label="Record return" onPress={() => router.push("/returns/new")} />
    </View>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

const ReturnCard = memo(function ReturnCard({ r, showDate }: { r: ReturnRow; showDate: boolean }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  const bad = r.damagedQty + r.rejectedQty + r.lostQty;
  return (
    <View style={[s.card, r.voidedAt && { opacity: 0.55 }]}>
      <Pressable onPress={() => router.push(`/returns/${r.id}`)} android_ripple={{ color: c.surface3 }} style={s.inner} accessibilityRole="button">
        <View>
          <AuthedImage path={r.coverPhotoId ? `/photos/${r.coverPhotoId}/thumb` : null} size={56} />
          {r.photoCount > 1 ? (
            <View style={s.count}>
              <Camera size={10} color="#fff" />
              <Text variant="caption" style={{ color: "#fff", fontSize: 10, lineHeight: 12 }}>
                {r.photoCount}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={s.row}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {r.client.name}
            </Text>
            <Text variant="bodyStrong" num>
              {formatINR(r.valuePaise)}
            </Text>
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {r.returnNumber} · {r.job.jobNumber} · {r.designs.join(", ")}
          </Text>
          <View style={[s.row, { marginTop: 4 }]}>
            <Text variant="label" tone="secondary" num>
              {formatQty(r.okQty)} {r.unit} good
              {bad ? <Text variant="label" tone="danger">{`  ·  ${formatQty(bad)} not good`}</Text> : null}
            </Text>
            {r.voidedAt ? <Badge tone="danger" label="Voided" /> : r.payment ? <PayStatusBadge status={r.payment.status} /> : null}
          </View>
          <Text variant="caption" tone="faint" num>
            {showDate ? `${formatShortDate(r.date)}, ` : ""}
            {time(r.receivedAt)}
          </Text>
        </View>
      </Pressable>
    </View>
  );
});

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border },
    inner: { padding: space.md + 2, gap: space.md, flexDirection: "row" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
    count: { position: "absolute", right: 3, bottom: 3, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 4, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.55)" },
  });
