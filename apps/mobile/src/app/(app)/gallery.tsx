import { formatDate, formatINR, formatQty, formatShortDate, L, rupeesToPaise, type PhotoView } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Images, SlidersHorizontal, X } from "lucide-react-native";
import { memo, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AuthedImage, Badge, Button, DateField, EmptyState, ErrorBlock, Field, IconButton, ListSkeleton, PickerField, Sheet, Text, ToggleRow, type SheetRef } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { useClients, useDesigns, useJobWorkTypes, usePhotoPages, useProducts } from "@/lib/queries";
import { font, type Palette, radius, space, useStyles, useTheme } from "@/theme";

/**
 * Design / return gallery: every photo of returned work, newest first, with qty and rate.
 * Other screens can open it pre-filtered: /gallery?clientId=…, ?jobId=…, ?returnId=… (minRate / maxRate are rupees).
 */
const KEYS = ["clientId", "jobId", "designId", "productId", "jobWorkTypeId", "returnId", "from", "to", "minRate", "maxRate", "voided"] as const;
type Key = (typeof KEYS)[number];
type Filters = Partial<Record<Key, string>>;

const useGalleryJobs = (clientId?: string) =>
  useQuery({ queryKey: ["jobs", "gallery", clientId ?? ""], queryFn: () => api.get<{ id: string; jobNumber: string; client: { name: string } }[]>(`/jobs${qs({ clientId })}`), staleTime: 60_000 });

export default function Gallery() {
  const { c } = useTheme();
  const params = useLocalSearchParams<Filters>();
  const { isManager } = useRole();
  const [filters, setFilters] = useState<Filters>(() => Object.fromEntries(KEYS.flatMap((k) => (typeof params[k] === "string" && params[k] ? [[k, params[k]]] : []))));
  const sheet = useRef<SheetRef>(null);

  const list = usePhotoPages({
    clientId: filters.clientId,
    jobId: filters.jobId,
    designId: filters.designId,
    productId: filters.productId,
    jobWorkTypeId: filters.jobWorkTypeId,
    returnId: filters.returnId,
    from: filters.from,
    to: filters.to,
    minRate: filters.minRate ? rupeesToPaise(filters.minRate) : undefined,
    maxRate: filters.maxRate ? rupeesToPaise(filters.maxRate) : undefined,
    includeVoided: isManager && filters.voided === "1",
  });
  const photos = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const ids = useMemo(() => photos.map((p) => p.id).join(","), [photos]);
  const names = useFilterNames(filters, photos);
  const active = KEYS.filter((k) => filters[k]);
  // A range shows as one chip on its lower bound; the upper bound only gets its own chip when it stands alone.
  const chips = active.filter((k) => !(k === "to" && filters.from) && !(k === "maxRate" && filters.minRate));
  const remove = (k: Key) => setFilters((f) => ({ ...f, [k]: undefined, ...(k === "from" ? { to: undefined } : k === "minRate" ? { maxRate: undefined } : null) }));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: "Design gallery",
          headerRight: () => <IconButton icon={SlidersHorizontal} label={`Filters${active.length ? ` (${active.length})` : ""}`} tone={active.length ? "accent" : "default"} onPress={() => sheet.current?.present()} />,
        }}
      />
      {chips.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: space.gutter, paddingBottom: space.md }}>
          {chips.map((k) => (
            <FilterChip key={k} label={names[k] ?? k} onRemove={() => remove(k)} />
          ))}
          <Button title="Clear all" variant="ghost" onPress={() => setFilters({})} />
        </View>
      ) : null}
      {list.isPending ? (
        <ListSkeleton />
      ) : list.error && !list.data ? (
        <ErrorBlock error={list.error} onRetry={list.refetch} />
      ) : (
        <FlashList
          data={photos}
          numColumns={2}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => (
            <View style={{ flex: 1, paddingLeft: index % 2 ? space.sm / 2 : 0, paddingRight: index % 2 ? 0 : space.sm / 2, paddingBottom: space.sm }}>
              <PhotoCard p={item} onPress={() => router.push({ pathname: "/photo/[id]", params: { id: item.id, ids } })} />
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 48 }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <ActivityIndicator color={c.accent} style={{ margin: space.lg }} />
            ) : photos.length && !list.hasNextPage ? (
              <Text variant="caption" tone="muted" num style={{ textAlign: "center", padding: space.lg }}>
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={Images}
              title={active.length ? "No photos match these filters" : "No photos yet"}
              body={active.length ? "Try a wider date or rate range." : "Photos taken when receiving work back appear here with their rate."}
              action={active.length ? { title: "Clear filters", onPress: () => setFilters({}) } : undefined}
            />
          }
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={list.refetch} colors={[c.accentSolid]} progressBackgroundColor={c.surface} />}
        />
      )}
      <FilterSheet ref={sheet} filters={filters} isManager={isManager} onApply={(f) => setFilters({ ...f, returnId: filters.returnId })} />
    </View>
  );
}

const PhotoCard = memo(function PhotoCard({ p, onPress }: { p: PhotoView; onPress: () => void }) {
  const s = useStyles(styles);
  const { c } = useTheme();
  return (
    <View style={s.card}>
      <Pressable onPress={onPress} android_ripple={{ color: c.surface2 }} accessibilityRole="button" accessibilityLabel={`${p.design?.name ?? "Design"}, ${p.client.name}`}>
        <View style={{ aspectRatio: 1 }}>
          <AuthedImage path={`/photos/${p.id}/thumb`} style={{ width: "100%", height: "100%", opacity: p.voidedAt ? 0.45 : 1 }} />
          <View style={s.rate}>
            <Text variant="caption" num style={{ color: "#fff", fontFamily: font.semibold }}>
              {p.ratePaise != null ? `${formatINR(p.ratePaise)} / ${p.unit}` : "Mixed rates"}
            </Text>
          </View>
          {p.voidedAt || p.returnVoided ? (
            <View style={{ position: "absolute", top: space.sm, left: space.sm }}>
              <Badge tone="danger" label={p.voidedAt ? "Voided" : "Return voided"} />
            </View>
          ) : null}
        </View>
        <View style={{ padding: space.sm + 2, gap: 1 }}>
          <Text variant="label" numberOfLines={1} style={{ color: c.fg }}>
            {p.client.name}
          </Text>
          <Text variant="caption" tone="muted" num numberOfLines={1}>
            {p.job.jobNumber} · {p.returnNumber}
          </Text>
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {p.design?.name ?? "Whole return"}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.xs, marginTop: 2 }}>
            <Text variant="caption" num style={{ color: c.fg }}>
              {formatQty(p.qty)} {p.unit}
            </Text>
            <Text variant="caption" tone="faint" num numberOfLines={1}>
              {formatShortDate(p.receivedDate)}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
});

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onRemove}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Remove filter ${label}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface }}
    >
      <Text variant="label" tone="secondary" numberOfLines={1} style={{ maxWidth: 220 }}>
        {label}
      </Text>
      <X size={14} color={c.fgMuted} />
    </Pressable>
  );
}

/** Human labels for the active filter chips. */
function useFilterNames(f: Filters, photos: PhotoView[]): Partial<Record<Key, string>> {
  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);
  const types = useJobWorkTypes(false);
  const jobs = useGalleryJobs();
  const rs = (v?: string) => (v ? formatINR(rupeesToPaise(v)) : "");
  return {
    clientId: `${L.worker}: ${clients.data?.find((x) => x.id === f.clientId)?.name ?? photos[0]?.client.name ?? "…"}`,
    jobId: `${L.job}: ${jobs.data?.find((j) => j.id === f.jobId)?.jobNumber ?? photos[0]?.job.jobNumber ?? "…"}`,
    designId: `Design: ${designs.data?.find((d) => d.id === f.designId)?.name ?? "…"}`,
    productId: `Product: ${products.data?.find((p) => p.id === f.productId)?.name ?? "…"}`,
    jobWorkTypeId: `${L.jobWorkType}: ${types.data?.find((t) => t.id === f.jobWorkTypeId)?.name ?? "…"}`,
    returnId: `Return: ${photos.find((p) => p.returnId === f.returnId)?.returnNumber ?? "…"}`,
    from: f.to ? `${formatDate(f.from)} – ${formatDate(f.to)}` : `From ${formatDate(f.from)}`,
    to: `Until ${formatDate(f.to)}`,
    minRate: f.maxRate ? `Rate ${rs(f.minRate)} – ${rs(f.maxRate)}` : `Rate ≥ ${rs(f.minRate)}`,
    maxRate: `Rate ≤ ${rs(f.maxRate)}`,
    voided: "Including voided",
  };
}

/** Edits a draft; nothing changes until "Show photos". */
function FilterSheet({ ref, filters, isManager, onApply }: { ref: React.Ref<SheetRef>; filters: Filters; isManager: boolean; onApply: (f: Filters) => void }) {
  const [draft, setDraft] = useState<Filters>(filters);
  const set = (patch: Filters) => setDraft((d) => ({ ...d, ...patch }));
  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);
  const types = useJobWorkTypes(false);
  const jobs = useGalleryJobs(draft.clientId);
  const rateError = draft.minRate && draft.maxRate && Number(draft.minRate) > Number(draft.maxRate) ? "Minimum is above maximum" : undefined;
  const close = () => (ref && "current" in ref ? ref.current?.dismiss() : undefined);

  return (
    <Sheet ref={ref} title="Filter photos" onDismiss={() => setDraft(filters)}>
      <PickerField label={L.client} value={draft.clientId ?? null} options={(clients.data ?? []).map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => set({ clientId: v ?? undefined, jobId: undefined })} placeholder="Any" clearable loading={clients.isPending} />
      <PickerField label={L.job} value={draft.jobId ?? null} options={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.jobNumber, sub: j.client.name, keywords: [j.client.name] }))} onChange={(v) => set({ jobId: v ?? undefined })} placeholder="Any" clearable loading={jobs.isPending} />
      <PickerField label="Design" value={draft.designId ?? null} options={(designs.data ?? []).map((d) => ({ value: d.id, label: d.name, sub: d.code ?? undefined }))} onChange={(v) => set({ designId: v ?? undefined })} placeholder="Any" clearable loading={designs.isPending} />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <PickerField label="Product" value={draft.productId ?? null} options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => set({ productId: v ?? undefined })} placeholder="Any" clearable loading={products.isPending} />
        </View>
        <View style={{ flex: 1 }}>
          <PickerField label={L.jobWorkType} value={draft.jobWorkTypeId ?? null} options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set({ jobWorkTypeId: v ?? undefined })} placeholder="Any" clearable loading={types.isPending} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <DateField label="Returned from" value={draft.from ?? null} onChange={(v) => set({ from: v ?? undefined })} clearable placeholder="Start" maximumDate={new Date()} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={draft.to ?? null} onChange={(v) => set({ to: v ?? undefined })} clearable placeholder="Today" maximumDate={new Date()} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Rate from (₹)" value={draft.minRate ?? ""} onChangeText={(v) => set({ minRate: v || undefined })} keyboardType="decimal-pad" placeholder="0" num error={rateError} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Rate up to (₹)" value={draft.maxRate ?? ""} onChangeText={(v) => set({ maxRate: v || undefined })} keyboardType="decimal-pad" placeholder="Any" num />
        </View>
      </View>
      {isManager ? <ToggleRow label="Include voided photos" value={draft.voided === "1"} onChange={(v) => set({ voided: v ? "1" : undefined })} /> : null}
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Button title="Clear" variant="ghost" size="lg" onPress={() => setDraft({})} style={{ flex: 1 }} />
        <Button
          title="Show photos"
          size="lg"
          disabled={!!rateError}
          onPress={() => {
            onApply(draft);
            close();
          }}
          style={{ flex: 2 }}
        />
      </View>
    </Sheet>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { borderRadius: radius.card, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    rate: { position: "absolute", left: space.sm, bottom: space.sm, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: "rgba(0,0,0,0.7)" },
  });
