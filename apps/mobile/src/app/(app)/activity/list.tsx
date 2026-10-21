import type { ActivityRow } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { History } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useUsers } from "@/components/domain/users";
import { EmptyState, ErrorBlock, ListSkeleton, PickerField, SearchBar, Segmented, Text } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { openHref } from "@/lib/links";
import { radius, space, useTheme } from "@/theme";

const PAGE = 100;
const ACTION: Record<string, { label: string; tone: "secondary" | "warning" | "danger" | "success" | "muted" }> = {
  create: { label: "Added", tone: "secondary" },
  update: { label: "Edited", tone: "warning" },
  void: { label: "Voided", tone: "danger" },
  cancel: { label: "Cancelled", tone: "danger" },
  restore: { label: "Restored", tone: "secondary" },
  exception: { label: "Exception", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  reopened: { label: "Reopened", tone: "warning" },
  login: { label: "Signed in", tone: "muted" },
  whatsapp: { label: "WhatsApp", tone: "secondary" },
};
const actionOf = (a: string) => ACTION[a] ?? { label: a.replace(/_/g, " "), tone: "secondary" as const };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** One activity folder (a record type, one job worker, or everything), newest first. Owner only. */
export default function ActivityList() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ folder?: string; worker?: string; title?: string }>();
  const [kind, setKind] = useState<"all" | "edits">("all");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const users = useUsers();
  const filter = {
    folder: params.folder && params.folder !== "all" ? params.folder : undefined,
    clientId: params.worker || undefined,
    kind: kind === "edits" ? "edits" : undefined,
    userId: userId || undefined,
    q: search.trim() || undefined,
  };
  const q = useInfiniteQuery({
    queryKey: ["activity", filter],
    queryFn: ({ pageParam }) => api.get<{ rows: ActivityRow[]; more: boolean }>(`/activity${qs({ ...filter, take: PAGE, skip: pageParam })}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.more ? all.length * PAGE : undefined),
  });
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: params.title || "Activity" }} />
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
            <SearchBar value={search} onChange={setSearch} placeholder="Search details…" />
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "Everything" },
                { value: "edits", label: "Edits & voids" },
              ]}
            />
            <PickerField label="Done by" value={userId} options={[{ value: "", label: "Anyone" }, ...(users.data ?? []).map((u) => ({ value: u.id, label: u.name, sub: u.email }))]} onChange={(v) => setUserId(v ?? "")} loading={users.isPending} />
            {q.isPending ? <ListSkeleton rows={5} /> : q.error && !q.data ? <ErrorBlock error={q.error} onRetry={q.refetch} /> : null}
          </View>
        }
        ListEmptyComponent={q.isPending || q.error ? null : <EmptyState icon={History} title="No activity found" body={kind === "edits" ? "Nothing here has been edited or voided." : "Try another filter."} />}
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={c.accent} style={{ padding: space.lg }} /> : null}
        renderItem={({ item }) => <Entry r={item} showWorker={!params.worker} />}
      />
    </View>
  );
}

function Entry({ r, showWorker }: { r: ActivityRow; showWorker: boolean }) {
  const { c } = useTheme();
  const a = actionOf(r.action);
  const record = r.entity === "Job" && r.jobNumber ? `Challan ${r.jobNumber}` : r.jobNumber ? `${r.entityLabel} · ${r.jobNumber}` : r.entityLabel;
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
              {record}
            </Text>
          </Text>
          <Text variant="caption" tone="muted" num>
            {when(r.at)}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          by {r.user ?? "System"}
          {showWorker && r.worker ? ` · ${r.worker.name}` : ""}
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
