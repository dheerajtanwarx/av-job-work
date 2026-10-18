import {
  formatDate,
  formatQty,
  materialSchema,
  MOVEMENT_TYPE_LABEL,
  qtyFitsUnit,
  roundQty,
  STOCK_MOVEMENT_TYPES,
  todayISO,
  UNIT_DECIMALS,
  type Material,
  type MaterialMovementRow,
  type MaterialRow,
  type Unit,
} from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeftRight } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Badge, Button, DateField, EmptyState, ErrorBlock, Field, FormScreen, ListSkeleton, PickerField, ReasonSheet, Segmented, Text, toast, ToggleRow, type SheetRef, type Tone } from "@/components/ui";
import { api, ApiError, errorMessage, qs } from "@/lib/api";
import { useRole } from "@/lib/auth";
import { useClients, useDesigns, useMaterials, useProducts } from "@/lib/queries";
import { radius, space, useTheme } from "@/theme";
import { UnitChips } from "./masters";

type Errors = Record<string, string>;

export const useMaterial = (id: string | undefined) => useQuery({ queryKey: ["materials", id], queryFn: () => api.get<MaterialRow>(`/materials/${id}`), enabled: !!id });

export interface MovementFilter {
  materialId?: string;
  clientId?: string;
  from?: string;
  to?: string;
}

/** Same key as the web's movement ledger, so a stock write (which invalidates ["materials"]) refreshes it. */
export const useMovements = (f: MovementFilter) =>
  useQuery({ queryKey: ["materials", "movements", f], queryFn: () => api.get<MaterialMovementRow[]>(`/stock/movements${qs({ ...f })}`), placeholderData: (p) => p });

const qtyError = (unit: Unit) => (UNIT_DECIMALS[unit] ? `Up to ${UNIT_DECIMALS[unit]} decimals in ${unit}` : `Whole ${unit} only`);

// ───────────── Material form ─────────────

/** Create or edit a material. A new one can carry its opening stock, recorded as stock received today. */
export function MaterialForm({ material }: { material?: Material }) {
  const qc = useQueryClient();
  const products = useProducts();
  const designs = useDesigns();
  const [f, setF] = useState({
    code: material?.code ?? "",
    name: material?.name ?? "",
    productId: material?.productId ?? "",
    designId: material?.designId ?? "",
    fabricType: material?.fabricType ?? "",
    color: material?.color ?? "",
    unit: (material?.unit ?? "MTR") as Unit,
    lotNumber: material?.lotNumber ?? "",
    rollNumber: material?.rollNumber ?? "",
    supplier: material?.supplier ?? "",
    location: material?.location ?? "",
    notes: material?.notes ?? "",
    isActive: material?.isActive ?? true,
  });
  const [opening, setOpening] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const n = opening ? Number(opening) : 0;
      if (opening && (!Number.isFinite(n) || n < 0 || !qtyFitsUnit(n, f.unit))) throw new ApiError(422, qtyError(f.unit), { fieldErrors: { openingQty: qtyError(f.unit) } });
      const body = { ...f, productId: f.productId || null, designId: f.designId || null, ...(material ? {} : { openingQty: n || undefined }) };
      const parsed = materialSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(422, parsed.error.issues[0].message, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
      return material ? api.put<Material>(`/materials/${material.id}`, body) : api.post<Material>("/materials", body);
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      const n = Number(opening) || 0;
      toast.success(material ? "Material updated" : `${m.code} ${m.name} added${n ? ` with ${formatQty(n)} ${m.unit} in stock` : ""}`);
      if (material) router.back();
      else router.replace(`/materials/${m.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(errorMessage(e));
    },
  });

  return (
    <FormScreen
      title={material ? `Edit ${material.code}` : "New material"}
      subtitle={material ? material.name : "Raw material you issue to job workers: fabric, sarees, blouses."}
      footer={<Button title={material ? "Save changes" : "Add material"} size="lg" block loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }} />}
    >
      <Field label="Name *" value={f.name} onChangeText={set("name")} error={errors.name} placeholder="Georgette fabric – red" autoFocus={!material} />
      <Field label="Code" value={f.code} onChangeText={set("code")} error={errors.code} placeholder="MAT-0001" autoCapitalize="characters" num hint={material ? undefined : "Leave blank to number it automatically"} />
      <UnitChips value={f.unit} onChange={(unit) => setF((x) => ({ ...x, unit }))} error={errors.unit} />
      {!material ? (
        <Field
          label={`Opening stock (${f.unit})`}
          value={opening}
          onChangeText={setOpening}
          error={errors.openingQty}
          keyboardType={UNIT_DECIMALS[f.unit] ? "decimal-pad" : "number-pad"}
          num
          placeholder="0"
          hint="What is in the warehouse right now. Recorded as stock received today."
        />
      ) : null}
      <PickerField label="Product" value={f.productId || null} options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name, sub: p.unit }))} onChange={(v) => setF((x) => ({ ...x, productId: v ?? "" }))} placeholder="Not set" clearable loading={products.isPending} error={errors.productId} />
      <PickerField
        label="Design"
        value={f.designId || null}
        options={(designs.data ?? []).map((d) => ({ value: d.id, label: d.name, sub: d.code ?? undefined }))}
        onChange={(v) => setF((x) => ({ ...x, designId: v ?? "" }))}
        placeholder="Any design"
        hint="Optional: if this material is for one design"
        clearable
        loading={designs.isPending}
        error={errors.designId}
      />
      <Row>
        <Field label="Fabric type" value={f.fabricType} onChangeText={set("fabricType")} placeholder="Georgette" />
        <Field label="Colour" value={f.color} onChangeText={set("color")} placeholder="Red" />
      </Row>
      <Row>
        <Field label="Lot no." value={f.lotNumber} onChangeText={set("lotNumber")} num />
        <Field label="Roll no." value={f.rollNumber} onChangeText={set("rollNumber")} num />
      </Row>
      <Row>
        <Field label="Supplier" value={f.supplier} onChangeText={set("supplier")} />
        <Field label="Location" value={f.location} onChangeText={set("location")} hint="Rack / godown" />
      </Row>
      <Field label="Notes" value={f.notes} onChangeText={set("notes")} multiline />
      {material ? <ToggleRow label="Active" hint="Inactive materials are hidden when creating challans. Nothing is deleted." value={f.isActive} onChange={(isActive) => setF((x) => ({ ...x, isActive }))} /> : null}
    </FormScreen>
  );
}

function Row({ children }: { children: React.ReactNode[] }) {
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      {children.map((c, i) => (
        <View key={i} style={{ flex: 1 }}>
          {c}
        </View>
      ))}
    </View>
  );
}

// ───────────── Receive / adjust stock ─────────────

export type StockAction = "RECEIPT" | "ADJUSTMENT";

export function StockForm({ material, action }: { material: MaterialRow; action: StockAction }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [dir, setDir] = useState<"ADJUSTMENT_IN" | "ADJUSTMENT_OUT">("ADJUSTMENT_IN");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const unit = material.unit;
  const n = Number(qty);
  const adding = action === "RECEIPT" || dir === "ADJUSTMENT_IN";
  const after = roundQty(material.stock.available + (adding ? n || 0 : -(n || 0)));

  const save = useMutation({
    mutationFn: async () => {
      const errs: Errors = {};
      if (!(n > 0)) errs.qty = "Enter a quantity";
      else if (!qtyFitsUnit(n, unit)) errs.qty = qtyError(unit);
      if (action === "ADJUSTMENT" && reason.trim().length < 3) errs.reason = "A reason is required for adjustments";
      if (Object.keys(errs).length) throw new ApiError(422, Object.values(errs)[0], { fieldErrors: errs });
      return api.post("/stock/movements", { materialId: material.id, type: action === "RECEIPT" ? "RECEIPT" : dir, qty: n, date, reason: reason.trim() || null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast.success(action === "RECEIPT" ? `${formatQty(n)} ${unit} received` : `Stock adjusted ${dir === "ADJUSTMENT_IN" ? "+" : "−"}${formatQty(n)} ${unit}`);
      router.back();
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(errorMessage(e));
    },
  });

  return (
    <FormScreen
      title={action === "RECEIPT" ? "Receive stock" : "Adjust stock"}
      subtitle={`${material.code} · ${material.name} · ${formatQty(material.stock.available)} ${unit} in warehouse`}
      footer={<Button title={action === "RECEIPT" ? "Receive stock" : "Save adjustment"} size="lg" block loading={save.isPending} onPress={() => save.mutate()} style={{ flex: 1 }} />}
    >
      {action === "ADJUSTMENT" ? (
        <Segmented
          value={dir}
          onChange={setDir}
          options={[
            { value: "ADJUSTMENT_IN", label: "Add (+)" },
            { value: "ADJUSTMENT_OUT", label: "Remove (−)" },
          ]}
        />
      ) : null}
      <Field label={`Quantity (${unit}) *`} value={qty} onChangeText={setQty} error={errors.qty} keyboardType={UNIT_DECIMALS[unit] ? "decimal-pad" : "number-pad"} num placeholder="0" autoFocus />
      <DateField label="Date" value={date} onChange={(v) => setDate(v ?? todayISO())} maximumDate={new Date()} error={errors.date} />
      <Field
        label={action === "RECEIPT" ? "Note" : "Reason *"}
        value={reason}
        onChangeText={setReason}
        error={errors.reason}
        multiline
        placeholder={action === "RECEIPT" ? "Bill no. 123 from supplier" : "Physical count difference"}
        hint={action === "RECEIPT" ? "Bill / supplier reference (optional)" : "Kept in the material ledger and the change log"}
      />
      {n > 0 ? (
        <View style={{ padding: space.md, borderRadius: radius.control, backgroundColor: after < 0 ? c.dangerSubtle : c.surface2 }}>
          <Text variant="caption" tone={after < 0 ? "danger" : "secondary"}>
            Warehouse stock after this:{" "}
            <Text variant="caption" num style={{ fontWeight: "600" }} tone={after < 0 ? "danger" : "default"}>
              {formatQty(after)} {unit}
            </Text>
            {after < 0 ? ". This is below zero." : ""}
          </Text>
        </View>
      ) : null}
    </FormScreen>
  );
}

// ───────────── Movement ledger ─────────────

const TYPE_TONE: Record<string, Tone> = {
  RECEIPT: "success",
  ADJUSTMENT_IN: "info",
  ADJUSTMENT_OUT: "warning",
  INITIAL: "info",
  ADDITIONAL: "info",
  REWORK: "warning",
  RETURN: "success",
  DAMAGED: "danger",
  REJECTED: "danger",
  LOST: "danger",
};
const isWarehouseEntry = (t: string) => (STOCK_MOVEMENT_TYPES as readonly string[]).includes(t);

/** Filters for the ledger: material (unless fixed), worker and dates. */
export function MovementFilters({ value, onChange, fixedMaterial }: { value: MovementFilter; onChange: (f: MovementFilter) => void; fixedMaterial?: boolean }) {
  const materials = useMaterials();
  const clients = useClients(false);
  return (
    <View style={{ gap: space.md }}>
      {!fixedMaterial ? (
        <PickerField
          label="Material"
          value={value.materialId ?? null}
          options={(materials.data ?? []).map((m) => ({ value: m.id, label: m.name, sub: m.code, keywords: [m.code] }))}
          onChange={(v) => onChange({ ...value, materialId: v ?? undefined })}
          placeholder="All materials"
          clearable
          loading={materials.isPending}
        />
      ) : null}
      <PickerField label="Where" value={value.clientId ?? null} options={(clients.data ?? []).map((w) => ({ value: w.id, label: w.name, sub: w.workerCode ?? undefined }))} onChange={(v) => onChange({ ...value, clientId: v ?? undefined })} placeholder="Warehouse & all workers" clearable loading={clients.isPending} />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={value.from ?? null} onChange={(v) => onChange({ ...value, from: v ?? undefined })} clearable placeholder="Start" maximumDate={new Date()} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={value.to ?? null} onChange={(v) => onChange({ ...value, to: v ?? undefined })} clearable placeholder="Today" maximumDate={new Date()} />
        </View>
      </View>
    </View>
  );
}

/**
 * Receipts, adjustments, issues and returns, newest first. For one material over all time (no filters) each row also
 * shows the warehouse balance after it. Warehouse entries can be voided with a reason.
 */
export function MovementLedger({ rows, isPending, error, onRetry, showMaterial, showBalance }: { rows: MaterialMovementRow[] | undefined; isPending: boolean; error: unknown; onRetry: () => void; showMaterial?: boolean; showBalance?: boolean }) {
  const qc = useQueryClient();
  const { isManager } = useRole();
  const voidSheet = useRef<SheetRef>(null);
  const [voiding, setVoiding] = useState<MaterialMovementRow | null>(null);

  if (isPending) return <ListSkeleton rows={4} />;
  if (error && !rows) return <ErrorBlock error={error} onRetry={onRetry} />;
  if (!rows?.length) return <EmptyState icon={ArrowLeftRight} title="No movements" body="Stock received, adjustments, issues to workers and returns show up here." />;

  const balance = new Map<string, number>();
  if (showBalance) {
    let b = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      b = roundQty(b + rows[i].warehouseEffect);
      balance.set(rows[i].id, b);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      {rows.map((r) => (
        <MovementRow
          key={r.id}
          r={r}
          showMaterial={showMaterial}
          balance={balance.get(r.id)}
          onVoid={
            isManager && isWarehouseEntry(r.type) && !r.voided
              ? () => {
                  setVoiding(r);
                  voidSheet.current?.present();
                }
              : undefined
          }
        />
      ))}
      <ReasonSheet
        ref={voidSheet}
        title="Void this stock entry?"
        body={voiding ? `${MOVEMENT_TYPE_LABEL[voiding.type] ?? voiding.type} of ${formatQty(voiding.qty)} ${voiding.unit} on ${formatDate(voiding.date)}. The warehouse stock is corrected. Nothing is deleted.` : undefined}
        confirmLabel="Void entry"
        danger
        onConfirm={async (reason) => {
          if (!voiding) return;
          await api.post(`/stock/movements/${voiding.id}/void`, { reason });
          qc.invalidateQueries({ queryKey: ["materials"] });
          voidSheet.current?.dismiss();
          toast.success("Stock entry voided");
        }}
      />
    </View>
  );
}

function MovementRow({ r, showMaterial, balance, onVoid }: { r: MaterialMovementRow; showMaterial?: boolean; balance?: number; onVoid?: () => void }) {
  const { c } = useTheme();
  const open = r.returnId ? `/returns/${r.returnId}` : r.job ? `/jobs/${r.job.id}` : null;
  const ref = r.job ? (r.ref && r.ref !== r.job.jobNumber ? `${r.ref} · ${r.job.jobNumber}` : r.job.jobNumber) : r.ref;
  const effect = r.warehouseEffect;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: r.voided ? 0.6 : 1 }]}>
      <Pressable disabled={!open} onPress={() => open && router.push(open as never)} android_ripple={{ color: c.surface2 }} style={{ padding: space.md + 2, gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Badge tone={r.voided ? "neutral" : (TYPE_TONE[r.type] ?? "neutral")} label={MOVEMENT_TYPE_LABEL[r.type] ?? r.type} />
          {r.voided ? <Badge tone="danger" label="Void" /> : null}
          <View style={{ flex: 1 }} />
          <Text variant="caption" tone="muted" num>
            {formatDate(r.date)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            {showMaterial ? (
              <Text variant="bodyStrong" numberOfLines={1}>
                {r.materialName}
              </Text>
            ) : null}
            <Text variant={showMaterial ? "label" : "bodyStrong"} tone={r.client ? "default" : "muted"} numberOfLines={1}>
              {r.client?.name ?? "Warehouse"}
            </Text>
            {ref || r.designName ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {[ref, r.designName].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            {r.notes ? (
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {r.notes}
              </Text>
            ) : null}
            {r.enteredBy ? (
              <Text variant="caption" tone="faint">
                by {r.enteredBy}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text variant="bodyStrong" num style={r.voided ? { textDecorationLine: "line-through" } : undefined}>
              {formatQty(r.qty)}{" "}
              <Text variant="caption" tone="muted">
                {r.unit}
              </Text>
            </Text>
            <Text variant="caption" num tone={effect > 0 ? "success" : effect < 0 ? "danger" : "faint"}>
              {effect === 0 ? "Warehouse 0" : `Warehouse ${effect > 0 ? "+" : "−"}${formatQty(Math.abs(effect))}`}
            </Text>
            {balance !== undefined ? (
              <Text variant="caption" tone="muted" num>
                Balance {formatQty(balance)}
              </Text>
            ) : null}
          </View>
        </View>
        {onVoid ? (
          <View style={{ alignItems: "flex-start", marginTop: space.xs }}>
            <Button title="Void" variant="dangerGhost" onPress={onVoid} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: "hidden", borderWidth: 1 },
});
