import type { ChangeLogRow } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { History } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useUsers } from "@/components/domain/users";
import { EmptyState, ErrorBlock, ListSkeleton, PickerField, Segmented, Text } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { openHref } from "@/lib/links";
import { radius, space, useTheme } from "@/theme";

const PAGE = 100;
const ENTITIES = [
  ["", "Everything"],
  ["SubBill", "Payments"],
  ["Job", "Challans"],
  ["Return", "Returns"],
  ["Client", "Job workers"],
  ["Design", "Designs"],
  ["Product", "Products"],
  ["Material", "Materials"],
  ["StockMovement", "Stock entries"],
  ["JobWorkType", "Job work types"],
  ["Settings", "Settings"],
  ["User", "Users"],
] as const;
const ACTION: Record<string, { label: string; tone: "secondary" | "warning" | "danger" }> = {
  create: { label: "Added", tone: "secondary" },
  update: { label: "Edited", tone: "warning" },
  void: { label: "Voided", tone: "danger" },
  cancel: { label: "Cancelled", tone: "danger" },
  restore: { label: "Restored", tone: "secondary" },
  exception: { label: "Exception", tone: "warning" },
};
const actionOf = (a: string) => ACTION[a] ?? { label: a.replace(/_/g, " "), tone: "secondary" as const };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Settings → Change log: every change anyone made, newest first. Owner only; nothing here can be edited. */
export default function ChangeLog() {
  const { c } = useTheme();
  const [kind, setKind] = useState<"edits" | "all">("edits");
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  const users = useUsers();
  const q = useInfiniteQuery({
    queryKey: ["change-log", kind, entity, userId],
    queryFn: ({ pageParam }) => api.get<{ rows: ChangeLogRow[]; more: boolean }>(`/change-log${qs({ kind: kind === "edits" ? "edits" : undefined, entity: entity || undefined, userId: userId || undefined, take: PAGE, skip: pageParam })}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.more ? all.length * PAGE : undefined),
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Change log" }} />
      <FlashList
        data={q.isPending || (q.error && !q.data) ? [] : rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxxl }}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={q.refetch} colors={[c.accentSolid]} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingBottom: space.md }}>
            <Text variant="caption" tone="muted">
              Who changed what, newest first. Nothing here can be edited or deleted.
            </Text>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "edits", label: "Edits & voids" },
                { value: "all", label: "Everything" },
              ]}
            />
            <View style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <PickerField label="Record" value={entity} options={ENTITIES.map(([value, label]) => ({ value, label }))} onChange={(v) => setEntity(v ?? "")} />
              </View>
              <View style={{ flex: 1 }}>
                <PickerField label="Made by" value={userId} options={[{ value: "", label: "Anyone" }, ...(users.data ?? []).map((u) => ({ value: u.id, label: u.name, sub: u.email }))]} onChange={(v) => setUserId(v ?? "")} loading={users.isPending} />
              </View>
            </View>
            {q.isPending ? <ListSkeleton rows={5} /> : q.error && !q.data ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : null}
          </View>
        }
        ListEmptyComponent={q.isPending || q.error ? null : <EmptyState icon={History} title="No changes found" body={kind === "edits" ? "Nothing has been edited or voided yet." : "Try another filter."} />}
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={c.accent} style={{ padding: space.lg }} /> : null}
        renderItem={({ item }) => <Entry r={item} />}
      />
    </View>
  );
}

function Entry({ r }: { r: ChangeLogRow }) {
  const { c } = useTheme();
  const a = actionOf(r.action);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Pressable disabled={!r.href} onPress={() => r.href && openHref(r.href)} android_ripple={{ color: c.surface2 }} style={{ padding: space.md + 2, gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            <Text variant="bodyStrong" tone={a.tone}>
              {a.label}
            </Text>
            {" · "}
            <Text variant="bodyStrong" tone={r.href ? "accent" : "default"}>
              {r.entityLabel}
            </Text>
          </Text>
          <Text variant="caption" tone="muted" num>
            {when(r.at)}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          by {r.user ?? "System"}
        </Text>
        {r.summary ? <Text variant="label">{r.summary}</Text> : null}
        {r.reason && !r.summary?.includes(r.reason) ? (
          <Text variant="caption" tone="muted">
            Reason: {r.reason}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: "hidden", borderWidth: 1 },
});
