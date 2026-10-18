import { designSchema, jobWorkTypeSchema, paiseToRupees, productSchema, rupeesToPaise, UNIT_DECIMALS, UNITS, type Design, type JobWorkType, type Product, type Unit } from "@av/shared";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Plus } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import type { z } from "zod";
import { Badge, Button, Chip, ChipRow, EmptyState, ErrorBlock, Fab, Field, FormScreen, ListSkeleton, PickerField, SearchBar, Text, toast, ToggleRow } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useJobWorkTypes } from "@/lib/queries";
import { type Palette, radius, space, useStyles, useTheme } from "@/theme";

type Errors = Record<string, string>;

// ───────────── List ─────────────

/** What every master list row needs: products, designs and job work types all have these. */
interface MasterItem {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
}

/**
 * Searchable list of one kind of master (product, design, job work type). Active ones by default; inactive ones are
 * kept (nothing is deleted) and shown dimmed under "All".
 */
export function MasterList<T extends MasterItem>({
  title,
  query,
  icon,
  emptyTitle,
  emptyBody,
  newLabel,
  newHref,
  hrefFor,
  renderMeta,
  renderAside,
}: {
  title: string;
  query: { data?: T[]; isPending: boolean; error: unknown; isRefetching: boolean; refetch: () => unknown };
  icon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
  newLabel: string;
  newHref: string;
  hrefFor: (item: T) => string;
  renderMeta: (item: T) => string;
  renderAside?: (item: T) => ReactNode;
}) {
  const { c } = useTheme();
  const s = useStyles(styles);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "all">("active");
  const term = q.trim().toLowerCase();
  const rows = useMemo(
    () => (query.data ?? []).filter((x) => (show === "all" || x.isActive) && (!term || x.name.toLowerCase().includes(term) || (x.code ?? "").toLowerCase().includes(term))),
    [query.data, show, term],
  );
  const inactive = (query.data ?? []).filter((x) => !x.isActive).length;
  const add = () => router.push(newHref as never);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title }} />
      <View style={{ gap: space.md, paddingBottom: space.md }}>
        <View style={{ paddingHorizontal: space.gutter }}>
          <SearchBar value={q} onChange={setQ} placeholder="Name or code" />
        </View>
        {inactive > 0 ? (
          <ChipRow>
            <Chip label="Active" selected={show === "active"} onPress={() => setShow("active")} />
            <Chip label="All" count={query.data?.length} selected={show === "all"} onPress={() => setShow("all")} />
          </ChipRow>
        ) : null}
      </View>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.error && !query.data ? (
        <ErrorBlock error={query.error} onRetry={query.refetch} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          ListEmptyComponent={term ? <EmptyState icon={icon} title="Nothing matches" body={`No ${title.toLowerCase()} match "${q.trim()}".`} /> : <EmptyState icon={icon} title={emptyTitle} body={emptyBody} action={{ title: newLabel, onPress: add }} />}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} colors={[c.accentSolid]} />}
          renderItem={({ item }) => (
            <View style={[s.card, !item.isActive && { opacity: 0.6 }]}>
              <Pressable onPress={() => router.push(hrefFor(item) as never)} android_ripple={{ color: c.surface2 }} style={s.inner} accessibilityRole="button">
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {renderMeta(item)}
                  </Text>
                </View>
                {renderAside?.(item)}
                {!item.isActive ? <Badge label="Inactive" /> : null}
              </Pressable>
            </View>
          )}
        />
      )}
      <Fab icon={Plus} label={newLabel} onPress={add} />
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { borderRadius: radius.card, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    inner: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md + 2, minHeight: 64 },
  });

// ───────────── Saving ─────────────

/** Validates with the shared zod schema first (same messages as the API), then creates or updates. */
export function useMasterSave<T extends { id: string; name: string }>({ path, keys, schema, existingId, noun }: { path: string; keys: string[]; schema: z.ZodType; existingId?: string; noun: string }) {
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const m = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiError(422, parsed.error.issues[0].message, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
      return existingId ? api.put<T>(`${path}/${existingId}`, body) : api.post<T>(path, body);
    },
    onSuccess: (saved) => {
      for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
      toast.success(existingId ? `${noun} updated` : `${saved.name} added`);
      router.back();
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(errorMessage(e));
    },
  });
  return { ...m, errors, setErrors };
}

/** Pick one of the units as chips; shows how many decimals the chosen one allows. */
export function UnitChips({ value, onChange, disabled, error }: { value: Unit; onChange: (u: Unit) => void; disabled?: boolean; error?: string }) {
  return (
    <View style={{ gap: space.xs + 2, opacity: disabled ? 0.5 : 1 }} pointerEvents={disabled ? "none" : "auto"}>
      <Text variant="label" tone="secondary">
        Unit
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {UNITS.map((u) => (
          <Chip key={u} label={u} selected={u === value} onPress={() => onChange(u)} />
        ))}
      </View>
      <Text variant="caption" tone={error ? "danger" : "muted"}>
        {error ?? (UNIT_DECIMALS[value] ? `Up to ${UNIT_DECIMALS[value]} decimals` : "Whole numbers only")}
      </Text>
    </View>
  );
}

/** Shown in edit forms: hiding instead of deleting keeps every old challan intact. */
function ActiveToggle({ value, onChange, hint = "Inactive items are hidden when creating challans. Nothing is deleted." }: { value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return <ToggleRow label="Active" hint={hint} value={value} onChange={onChange} />;
}

/** Edit screen for an id that isn't in the list (deleted link, or the list is still loading). */
export function MissingMaster({ loading, noun }: { loading: boolean; noun: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: noun }} />
      {loading ? <ListSkeleton rows={4} /> : <ErrorBlock error={new Error(`This ${noun.toLowerCase()} wasn't found.`)} onRetry={() => router.back()} />}
    </View>
  );
}

// ───────────── Product ─────────────

export function ProductForm({ product }: { product?: Product }) {
  const [f, setF] = useState({ name: product?.name ?? "", code: product?.code ?? "", unit: (product?.unit ?? "PCS") as Unit, description: product?.description ?? "", isActive: product?.isActive ?? true });
  const save = useMasterSave<Product>({ path: "/products", keys: ["products"], schema: productSchema, existingId: product?.id, noun: "Product" });
  return (
    <FormScreen
      title={product ? "Edit product" : "New product"}
      subtitle={product ? product.name : "Something you send out for work, like Saree, Blouse or Fabric."}
      footer={<Button title={product ? "Save changes" : "Add product"} size="lg" block loading={save.isPending} onPress={() => save.mutate(f)} style={{ flex: 1 }} />}
    >
      <Field label="Name *" value={f.name} onChangeText={(name) => setF({ ...f, name })} error={save.errors.name} placeholder="Plain Blouse" autoCapitalize="words" autoFocus={!product} />
      <Field label="Code" value={f.code} onChangeText={(code) => setF({ ...f, code })} error={save.errors.code} autoCapitalize="characters" />
      <UnitChips value={f.unit} onChange={(unit) => setF({ ...f, unit })} error={save.errors.unit} />
      <Field label="Description" value={f.description} onChangeText={(description) => setF({ ...f, description })} error={save.errors.description} multiline />
      {product ? <ActiveToggle value={f.isActive} onChange={(isActive) => setF({ ...f, isActive })} /> : null}
    </FormScreen>
  );
}

// ───────────── Job work type ─────────────

export function JobWorkTypeForm({ type }: { type?: JobWorkType }) {
  const [f, setF] = useState({ name: type?.name ?? "", code: type?.code ?? "", description: type?.description ?? "", isActive: type?.isActive ?? true });
  const save = useMasterSave<JobWorkType>({ path: "/job-work-types", keys: ["job-work-types", "designs"], schema: jobWorkTypeSchema, existingId: type?.id, noun: "Job work type" });
  return (
    <FormScreen
      title={type ? "Edit job work type" : "New job work type"}
      subtitle={type ? type.name : "The kind of work done, like Embroidery, Printing or Stitching."}
      footer={<Button title={type ? "Save changes" : "Add type"} size="lg" block loading={save.isPending} onPress={() => save.mutate(f)} style={{ flex: 1 }} />}
    >
      <Field label="Name *" value={f.name} onChangeText={(name) => setF({ ...f, name })} error={save.errors.name} placeholder="Embroidery" autoCapitalize="words" autoFocus={!type} />
      <Field label="Code" value={f.code} onChangeText={(code) => setF({ ...f, code })} error={save.errors.code} autoCapitalize="characters" />
      <Field label="Description" value={f.description} onChangeText={(description) => setF({ ...f, description })} error={save.errors.description} multiline />
      {type ? <ActiveToggle value={f.isActive} onChange={(isActive) => setF({ ...f, isActive })} /> : null}
    </FormScreen>
  );
}

// ───────────── Design ─────────────

export function DesignForm({ design }: { design?: Design }) {
  const { c } = useTheme();
  const types = useJobWorkTypes(false);
  const [f, setF] = useState({
    name: design?.name ?? "",
    code: design?.code ?? "",
    rate: design ? String(paiseToRupees(design.defaultRatePaise)) : "",
    jobWorkTypeId: design?.jobWorkTypeId ?? "",
    description: design?.description ?? "",
    isActive: design?.isActive ?? true,
  });
  const save = useMasterSave<Design>({ path: "/designs", keys: ["designs"], schema: designSchema, existingId: design?.id, noun: "Design" });
  const typeOptions = (types.data ?? []).filter((t) => t.isActive || t.id === f.jobWorkTypeId).map((t) => ({ value: t.id, label: t.isActive ? t.name : `${t.name} (inactive)`, sub: t.code ?? undefined }));
  const submit = () =>
    save.mutate({ name: f.name, code: f.code, description: f.description, isActive: f.isActive, jobWorkTypeId: f.jobWorkTypeId || null, defaultRatePaise: rupeesToPaise(f.rate || 0) });

  return (
    <FormScreen
      title={design ? "Edit design" : "New design"}
      subtitle={design ? design.name : "A design with its usual job work rate."}
      footer={<Button title={design ? "Save changes" : "Add design"} size="lg" block loading={save.isPending} onPress={submit} style={{ flex: 1 }} />}
    >
      <Field label="Design name *" value={f.name} onChangeText={(name) => setF({ ...f, name })} error={save.errors.name} placeholder="Floral Design" autoCapitalize="words" autoFocus={!design} />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Default rate" prefix={<Text tone="muted">₹</Text>} value={f.rate} onChangeText={(rate) => setF({ ...f, rate })} error={save.errors.defaultRatePaise} keyboardType="decimal-pad" num placeholder="0" hint="For new challans only" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Code" value={f.code} onChangeText={(code) => setF({ ...f, code })} error={save.errors.code} autoCapitalize="characters" />
        </View>
      </View>
      <PickerField label="Job work type" value={f.jobWorkTypeId || null} options={typeOptions} onChange={(v) => setF({ ...f, jobWorkTypeId: v ?? "" })} placeholder="Not set" loading={types.isPending} clearable error={save.errors.jobWorkTypeId} />
      {design ? (
        <View style={{ padding: space.md, borderRadius: radius.control, backgroundColor: c.surface2 }}>
          <Text variant="caption" tone="secondary">
            Changing the rate only affects new challans. Existing challans and returns keep their own rates.
          </Text>
        </View>
      ) : null}
      <Field label="Notes" value={f.description} onChangeText={(description) => setF({ ...f, description })} error={save.errors.description} multiline />
      {design ? <ActiveToggle value={f.isActive} onChange={(isActive) => setF({ ...f, isActive })} /> : null}
    </FormScreen>
  );
}

/** "1 challan", "4 challans". */
export const challanCount = (n: number | undefined) => `${n ?? 0} ${n === 1 ? "challan" : "challans"}`;
