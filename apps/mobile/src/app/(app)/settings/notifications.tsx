import { NOTIFY_CHANNEL_LABEL, NOTIFY_KIND_LABEL, NOTIFY_STATUS_LABEL, type NotificationLogRow, type NotifyStatus } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Inbox } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Badge, Chip, ChipRow, EmptyState, ErrorBlock, ListSkeleton, Text, type Tone } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { openHref } from "@/lib/links";
import { radius, space, useTheme } from "@/theme";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Not sent" },
  { value: "sent", label: "Sent" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const STATUS_TONE: Record<NotifyStatus, Tone> = { sent: "success", failed: "danger", skipped: "neutral", pending: "info" };
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const channel = (ch: string) => NOTIFY_CHANNEL_LABEL[ch as keyof typeof NOTIFY_CHANNEL_LABEL] ?? ch;

/** Settings → Notification log: every WhatsApp message attempt, newest first, with WhatsApp's error on failures. */
export default function Notifications() {
  const { c } = useTheme();
  const [status, setStatus] = useState<Filter>("all");
  const q = useQuery({
    queryKey: ["notifications", status],
    queryFn: () => api.get<NotificationLogRow[]>(`/notifications${qs({ status: status === "all" ? undefined : status, take: 100 })}`),
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Notification log" }} />
      <View style={{ paddingBottom: space.md }}>
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={status === f.value} onPress={() => setStatus(f.value)} />
          ))}
        </ChipRow>
      </View>
      {q.isPending ? (
        <ListSkeleton />
      ) : q.error && !q.data ? (
        <ErrorBlock error={q.error} onRetry={q.refetch} />
      ) : (
        <FlashList
          data={q.data}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} colors={[c.accentSolid]} />}
          ListEmptyComponent={<EmptyState icon={Inbox} title={status === "all" ? "Nothing sent yet" : "No matching notifications"} body="WhatsApp messages will be listed here." />}
          renderItem={({ item }) => <Entry n={item} />}
        />
      )}
    </View>
  );
}

function Entry({ n }: { n: NotificationLogRow }) {
  const { c } = useTheme();
  const s = (n.status in STATUS_TONE ? n.status : "skipped") as NotifyStatus;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Pressable disabled={!n.href} onPress={() => n.href && openHref(n.href)} android_ripple={{ color: c.surface2 }} style={{ padding: space.md + 2, gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text variant="bodyStrong" tone={n.href ? "accent" : "default"} numberOfLines={1} style={{ flex: 1 }}>
            {NOTIFY_KIND_LABEL[n.kind] ?? n.kind}
            {n.ref ? ` ${n.ref}` : ""}
          </Text>
          <Badge tone={STATUS_TONE[s]} label={NOTIFY_STATUS_LABEL[s]} />
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {channel(n.channel)} · {n.recipient ?? "no recipient"} · {n.auto ? "Automatic" : `Manual${n.user ? ` · ${n.user}` : ""}`}
        </Text>
        <Text variant="caption" tone="faint" num>
          {when(n.createdAt)}
        </Text>
        {n.error ? <Text variant="caption" tone="secondary">{n.error}</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: "hidden", borderWidth: 1 },
});
