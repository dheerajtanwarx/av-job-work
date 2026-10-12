import { formatINR, formatQty, formatShortDate, type JobListRow } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import { FilePlus2, ReceiptText, Search } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { FlowBar } from "@/components/domain/flow-bar";
import { JobStatusBadge, PayStatusBadge } from "@/components/domain/status";
import { Chip, ChipRow, EmptyState, ErrorBlock, Fab, IconButton, ListSkeleton, SearchBar, TabHeader, Text } from "@/components/ui";
import { useJobs } from "@/lib/queries";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

const STATUS_CHIPS = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "DRAFT", label: "Draft" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
] as const;

export default function Jobs() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ status?: string; clientId?: string }>();
  const [status, setStatus] = useState<string>(params.status === "active" ? "open" : (params.status ?? "open"));
  const [q, setQ] = useState("");
  const list = useJobs({ status: status || undefined, q: q || undefined, clientId: params.clientId });
  const rows = list.data;

  const totals = useMemo(
    () => (rows ?? []).reduce((t, j) => ({ value: t.value + j.money.valuePaise, paid: t.paid + j.money.paidPaise, out: t.out + j.money.outstandingPaise }), { value: 0, paid: 0, out: 0 }),
    [rows],
  );
  const renderItem = useCallback(({ item }: { item: JobListRow }) => <JobCard j={item} />, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="Challans" right={<IconButton icon={Search} label="Search everything" onPress={() => router.push("/search")} />} />
      <View style={{ gap: space.md, paddingBottom: space.md }}>
        <View style={{ paddingHorizontal: space.gutter }}>
          <SearchBar value={q} onChange={setQ} placeholder="Challan no., worker, design…" />
        </View>
        <ChipRow>
          {STATUS_CHIPS.map((s) => (
            <Chip key={s.label} label={s.label} selected={status === s.value} onPress={() => setStatus(s.value)} />
          ))}
        </ChipRow>
      </View>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.error && !rows ? (
        <ErrorBlock error={list.error} onRetry={list.refetch} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(j) => j.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm + 2 }} />}
          ListHeaderComponent={rows?.length ? <Totals count={rows.length} {...totals} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon={ReceiptText}
              title={q || status ? "No challans match" : "No challans yet"}
              body={q || status ? "Try another filter or search." : "Issue material to a job worker to create the first challan."}
              action={q || status ? { title: "Show all", onPress: () => (setQ(""), setStatus("")) } : { title: "New challan", onPress: () => router.push("/jobs/new") }}
            />
          }
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[c.accentSolid]} progressBackgroundColor={c.surface} />}
        />
      )}
      <Fab icon={FilePlus2} label="New challan" onPress={() => router.push("/jobs/new")} />
    </View>
  );
}

function Totals({ count, value, paid, out }: { count: number; value: number; paid: number; out: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: space.md, paddingHorizontal: space.xs }}>
      <Text variant="caption" tone="muted">
        {count} challan{count === 1 ? "" : "s"}
      </Text>
      <Text variant="caption" tone="muted" num>
        Work {formatINR(value)} · Paid {formatINR(paid)} · <Text variant="caption" tone={out ? "warning" : "muted"}>Due {formatINR(out)}</Text>
      </Text>
    </View>
  );
}

const JobCard = memo(function JobCard({ j }: { j: JobListRow }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  const t = j.totals;
  return (
    <View style={s.card}>
      <Pressable onPress={() => router.push(`/jobs/${j.id}`)} android_ripple={{ color: c.surface3 }} style={s.inner} accessibilityRole="button" accessibilityLabel={`Challan ${j.jobNumber}, ${j.client.name}`}>
        <View style={s.row}>
          <Text variant="bodyStrong" num>
            {j.jobNumber}
          </Text>
          <JobStatusBadge status={j.status} overdue={j.overdue} />
        </View>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text variant="headline" numberOfLines={1}>
              {j.client.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {formatShortDate(j.jobDate)} · {j.product.name}
              {j.designs.length ? ` · ${j.designs.slice(0, 2).join(", ")}${j.designs.length > 2 ? ` +${j.designs.length - 2}` : ""}` : ""}
            </Text>
          </View>
        </View>
        <FlowBar sent={t.sent} ok={t.ok} exceptions={t.exceptions} pending={t.pending} />
        <View style={s.row}>
          <Text variant="label" tone="secondary" num>
            {t.pending > 0 ? (
              <>
                <Text variant="label" tone="warning" num>
                  {formatQty(t.pending)} {j.unit}
                </Text>{" "}
                out{j.daysOut ? ` · ${j.daysOut}d` : ""}
              </>
            ) : (
              `${formatQty(t.ok)} ${j.unit} back`
            )}
            <Text variant="label" tone="muted">
              {" "}
              of {formatQty(t.sent || t.quantity)}
            </Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text variant="label" num>
              {formatINR(j.money.valuePaise || t.expectedValuePaise)}
            </Text>
            {j.money.valuePaise ? <PayStatusBadge status={j.payStatus} /> : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
});

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border },
    inner: { padding: space.lg, gap: space.sm + 2 },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  });
