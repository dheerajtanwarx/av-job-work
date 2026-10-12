import { formatINR, formatQty, lineAmount, paiseToRupees, qtyFitsUnit, roundQty, rupeesToPaise, todayISO, UNIT_DECIMALS, type JobDetail, type JobItemPhotoKind, type JobItemPhotoView, type PaymentPolicy, type Unit } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Camera, Plus, Trash2, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { AuthedImage, Button, Card, DateField, Field, FormScreen, PickerField, QtyInput, ReasonSheet, Text, toast, ToggleRow, type SheetRef } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { invalidateWork, useClients, useDesigns, useJobWorkTypes, useMaterials, useProducts, useSettings } from "@/lib/queries";
import { termsLabel } from "@/lib/terms";
import { compressPhoto, uploads } from "@/lib/uploads";
import { radius, space, useTheme } from "@/theme";
import { QuickCreate, type QuickCreateRef } from "./quick-create";
import { TermsFields } from "./terms-fields";

interface LocalPhoto {
  key: string;
  kind: JobItemPhotoKind;
  uri: string;
}
interface Line {
  key: string;
  id?: string;
  designId: string;
  materialId: string;
  jobWorkTypeId: string;
  quantity: string;
  rate: string;
  notes: string;
  locked?: boolean;
  minQty?: number;
  unit?: Unit;
  newPhotos: LocalPhoto[];
  savedPhotos: JobItemPhotoView[];
}
interface StockShort {
  materialId: string;
  name: string;
  unit: string;
  available: number;
  wanted: number;
}

let seq = 0;
const newLine = (): Line => ({ key: `l${++seq}`, designId: "", materialId: "", jobWorkTypeId: "", quantity: "", rate: "", notes: "", newPhotos: [], savedPhotos: [] });

/** New challan, or edit one (drafts fully; started challans: quantities and rates, with a reason). Ported from apps/web/components/forms/job-form.tsx. */
export function ChallanForm({ job, defaultClientId }: { job?: JobDetail; defaultClientId?: string }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const clients = useClients();
  const products = useProducts();
  const designs = useDesigns();
  const types = useJobWorkTypes();
  const materials = useMaterials({ active: true });
  const settings = useSettings();
  const editing = !!job;
  const started = !!job && job.status !== "DRAFT";
  const quick = useRef<QuickCreateRef>(null);
  const shortSheet = useRef<SheetRef>(null);

  const [clientId, setClientId] = useState(job?.client.id ?? defaultClientId ?? "");
  const [productId, setProductId] = useState(job?.product.id ?? "");
  const [jobWorkTypeId, setJobWorkTypeId] = useState(job?.jobWorkType?.id ?? "");
  const [jobDate, setJobDate] = useState(job ? job.jobDate.slice(0, 10) : todayISO());
  const [expected, setExpected] = useState<string | null>(job?.expectedReturnDate?.slice(0, 10) ?? null);
  const [terms, setTerms] = useState<{ policy: PaymentPolicy | ""; days: string }>({ policy: job?.paymentPolicy ?? "", days: job?.paymentDays != null ? String(job.paymentDays) : "" });
  const [notes, setNotes] = useState(job?.notes ?? "");
  const [dispatchNow, setDispatchNow] = useState(true);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(
    job
      ? job.items.map((i) => ({
          key: i.id,
          id: i.id,
          designId: i.designId,
          materialId: i.material?.id ?? "",
          jobWorkTypeId: i.jobWorkType?.id ?? "",
          quantity: String(i.quantity),
          rate: String(paiseToRupees(i.ratePaise)),
          notes: i.notes ?? "",
          locked: started,
          minQty: i.initialSent,
          unit: i.unit,
          newPhotos: [],
          savedPhotos: i.photos,
        }))
      : [newLine()],
  );
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [short, setShort] = useState<StockShort[]>([]);

  const designById = useMemo(() => new Map((designs.data ?? []).map((d) => [d.id, d])), [designs.data]);
  const matById = useMemo(() => new Map((materials.data ?? []).map((m) => [m.id, m])), [materials.data]);
  const unitOf = (l: Line): Unit => matById.get(l.materialId)?.unit ?? l.unit ?? "PCS";
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const lineValue = (l: Line) => lineAmount(Number(l.quantity) || 0, rupeesToPaise(l.rate || 0));
  const byUnit = new Map<Unit, number>();
  let total = 0;
  for (const l of lines) {
    const q = Number(l.quantity) || 0;
    if (q > 0) byUnit.set(unitOf(l), roundQty((byUnit.get(unitOf(l)) ?? 0) + q));
    total += lineValue(l);
  }
  const qtySummary = [...byUnit].map(([u, q]) => `${formatQty(q)} ${u}`).join(" · ") || "Nothing yet";

  const wanted = new Map<string, number>();
  if (!editing && dispatchNow) for (const l of lines) if (l.materialId && Number(l.quantity) > 0) wanted.set(l.materialId, roundQty((wanted.get(l.materialId) ?? 0) + Number(l.quantity)));
  const liveShort = new Map([...wanted].filter(([id, q]) => matById.has(id) && q > matById.get(id)!.stock.available + 1e-9));

  const client = clients.data?.find((x) => x.id === clientId);
  const defaultTerms = settings.data ? termsLabel(settings.data.defaultPaymentPolicy, settings.data.defaultPaymentDays) : "business default";
  const inheritLabel = client?.paymentPolicy ? `Worker's terms (${termsLabel(client.paymentPolicy, client.paymentDays)})` : `Worker's terms (default: ${defaultTerms})`;

  const addPhoto = async (key: string, kind: JobItemPhotoKind) => {
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return toast.error("Allow camera access to take photos");
    Alert.alert(kind === "ITEM" ? "Item / material photo" : "Design / sample photo", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Gallery", onPress: () => go(false) },
      { text: "Camera", onPress: () => go(true) },
    ]);
    async function go(camera: boolean) {
      const res = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 6 });
      if (res.canceled) return;
      const uris = await Promise.all(res.assets.map((a) => compressPhoto(a.uri)));
      setLines((ls) => ls.map((l) => (l.key === key ? { ...l, newPhotos: [...l.newPhotos, ...uris.map((uri) => ({ key: `p${++seq}`, kind, uri }))] } : l)));
    }
  };

  async function submit(stockOverrideReason?: string) {
    const errs: Record<string, string> = {};
    if (!clientId) errs.clientId = "Choose a job worker";
    if (!productId) errs.productId = "Choose a product";
    if (expected && expected < jobDate) errs.expected = "Can't be before the challan date";
    const filled = lines.filter((l) => l.designId || l.quantity || l.materialId);
    if (!filled.length) errs.items = "Add at least one design";
    for (const l of filled) {
      if (!l.designId) errs[`${l.key}.design`] = "Choose a design";
      if (!l.materialId && (!l.id || !started)) errs[`${l.key}.material`] = "Choose the material";
      const q = Number(l.quantity);
      const u = unitOf(l);
      if (!(q > 0)) errs[`${l.key}.qty`] = "Enter quantity";
      else if (!qtyFitsUnit(q, u)) errs[`${l.key}.qty`] = UNIT_DECIMALS[u] ? `Max ${UNIT_DECIMALS[u]} decimals in ${u}` : `Whole ${u} only`;
      else if (l.minQty && q < l.minQty) errs[`${l.key}.qty`] = `At least ${formatQty(l.minQty)} (already issued)`;
    }
    if (started && !reason.trim()) errs.reason = "Say why you're changing an issued challan";
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error(Object.values(errs)[0]);

    const items = filled.map((l) => ({ id: l.id, designId: l.designId, materialId: l.materialId || null, jobWorkTypeId: l.jobWorkTypeId || null, quantity: Number(l.quantity), ratePaise: rupeesToPaise(l.rate || 0), notes: l.notes || null }));
    const body = { clientId, productId, jobWorkTypeId: jobWorkTypeId || null, jobDate, expectedReturnDate: expected || null, notes, paymentPolicy: terms.policy || null, paymentDays: terms.policy ? Number(terms.days) || 0 : null, items };
    setSaving(true);
    try {
      const saved = editing
        ? await api.patch<JobDetail>(`/jobs/${job!.id}`, { ...body, reason: reason || null })
        : await api.post<JobDetail>("/jobs", { ...body, items: items.map(({ id: _id, ...i }) => i), dispatchNow, stockOverrideReason: stockOverrideReason || null });
      // Photos: kept lines keep their ids; new lines map to the new items in form order.
      const before = new Set(job?.items.map((i) => i.id) ?? []);
      const kept = saved.items.filter((i) => before.has(i.id));
      const fresh = saved.items.filter((i) => !before.has(i.id)).sort((a, b) => a.sortOrder - b.sortOrder);
      let n = 0;
      const queue: Parameters<typeof uploads.enqueue>[0] = [];
      for (const l of filled) {
        const itemId = kept.length && l.id ? l.id : fresh[n++]?.id;
        if (itemId) for (const p of l.newPhotos) queue.push({ uri: p.uri, target: { kind: "job-item", jobId: saved.id, jobItemId: itemId, photoKind: p.kind } });
      }
      if (queue.length) uploads.enqueue(queue);
      await Promise.all(removedPhotoIds.map((id) => api.post(`/job-photos/${id}/remove`, {}).catch(() => {})));
      invalidateWork(qc, saved.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(editing ? "Challan updated" : `${saved.jobNumber} created${dispatchNow ? " · material issued" : " as draft"}`);
      router.replace(`/jobs/${saved.id}`);
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError) {
        const d = e.body.details as { stockShort?: StockShort[] } | undefined;
        if (e.status === 422 && d?.stockShort?.length) {
          setShort(d.stockShort);
          shortSheet.current?.present();
          return;
        }
        setErrors(e.fieldErrors);
      }
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const clientOpts = (clients.data ?? []).map((x) => ({ value: x.id, label: x.name, sub: [x.workerCode, x.phone].filter(Boolean).join(" · ") }));
  const productOpts = (products.data ?? []).map((p) => ({ value: p.id, label: p.name, sub: [p.code, p.unit].filter(Boolean).join(" · ") }));
  const typeOpts = (types.data ?? []).map((t) => ({ value: t.id, label: t.name, sub: t.code ?? undefined }));
  const designOpts = (designs.data ?? []).map((d) => ({ value: d.id, label: d.name, sub: `Default rate ${formatINR(d.defaultRatePaise)}${d.jobWorkType ? ` · ${d.jobWorkType.name}` : ""}`, keywords: [d.code ?? ""] }));
  const materialOpts = (materials.data ?? []).map((m) => ({
    value: m.id,
    label: `${m.code} · ${m.name}`,
    sub: [m.color, m.lotNumber && `Lot ${m.lotNumber}`, m.rollNumber && `Roll ${m.rollNumber}`].filter(Boolean).join(" · ") || m.unit,
    aside: `${formatQty(m.stock.available)} ${m.unit}`,
    asideTone: (m.stock.available > 0 ? "muted" : "warning") as "muted" | "warning",
  }));

  return (
    <FormScreen
      title={editing ? `Edit ${job!.jobNumber}` : "New challan"}
      subtitle={started ? "Material already issued: quantities and rates only" : undefined}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" num numberOfLines={1}>
              {qtySummary}
            </Text>
            <Text variant="caption" tone={liveShort.size ? "danger" : "muted"} num>
              {liveShort.size ? "Some material is short in stock" : `Work value ${formatINR(total)}`}
            </Text>
          </View>
          <Button title={editing ? "Save" : dispatchNow ? "Create & issue" : "Save draft"} size="lg" loading={saving} onPress={() => submit()} style={{ minWidth: 150 }} />
        </>
      }
    >
      <PickerField label="Job worker *" value={clientId} options={clientOpts} loading={clients.isPending} onChange={(v) => setClientId(v ?? "")} error={errors.clientId} onCreate={(name) => quick.current?.open("client", name, (x) => setClientId(x.id))} createLabel="New job worker" disabled={started} />
      <PickerField label="Product *" value={productId} options={productOpts} loading={products.isPending} onChange={(v) => setProductId(v ?? "")} error={errors.productId} onCreate={(name) => quick.current?.open("product", name, (x) => setProductId(x.id))} createLabel="New product" disabled={started} />
      <PickerField label="Job work type" value={jobWorkTypeId} options={typeOpts} onChange={(v) => setJobWorkTypeId(v ?? "")} clearable placeholder="Optional" onCreate={(name) => quick.current?.open("type", name, (x) => setJobWorkTypeId(x.id))} createLabel="New job work type" />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <DateField label="Challan date" value={jobDate} onChange={(d) => d && setJobDate(d)} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="Expected back" value={expected} onChange={setExpected} clearable placeholder="Optional" error={errors.expected} minimumDate={new Date(jobDate)} />
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <Text variant="title">Designs</Text>
        {errors.items ? (
          <Text variant="caption" tone="danger">
            {errors.items}
          </Text>
        ) : null}
        {lines.map((l, idx) => {
          const mat = matById.get(l.materialId);
          const sh = l.materialId ? liveShort.get(l.materialId) : undefined;
          return (
            <Card key={l.key} contentStyle={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text variant="overline" tone="muted">
                  Design {idx + 1}
                </Text>
                {lines.length > 1 && !l.locked ? (
                  <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} hitSlop={10} accessibilityLabel={`Remove design ${idx + 1}`}>
                    <Trash2 size={18} color={c.danger} />
                  </Pressable>
                ) : null}
              </View>
              <PickerField
                label="Design *"
                value={l.designId}
                options={designOpts}
                disabled={l.locked}
                error={errors[`${l.key}.design`]}
                onChange={(v) => {
                  const d = v ? designById.get(v) : undefined;
                  update(l.key, { designId: v ?? "", rate: d ? String(paiseToRupees(d.defaultRatePaise)) : l.rate, jobWorkTypeId: l.jobWorkTypeId || d?.jobWorkTypeId || "" });
                }}
                onCreate={(name) => quick.current?.open("design", name, (d) => update(l.key, { designId: d.id, rate: String(paiseToRupees(d.defaultRatePaise)) }))}
                createLabel="New design"
              />
              <PickerField
                label="Material *"
                value={l.materialId}
                options={materialOpts}
                disabled={l.locked}
                error={errors[`${l.key}.material`]}
                hint={mat ? `${formatQty(mat.stock.available)} ${mat.unit} in warehouse${sh !== undefined ? ` · ${formatQty(roundQty(sh - mat.stock.available))} short` : ""}` : undefined}
                onChange={(v) => update(l.key, { materialId: v ?? "", unit: v ? matById.get(v)?.unit : undefined })}
                onCreate={(name) => quick.current?.open("material", name, (m) => update(l.key, { materialId: m.id, unit: m.unit }))}
                createLabel="New material"
              />
              <View style={{ gap: space.xs + 2 }}>
                <Text variant="label" tone="secondary">
                  Quantity ({unitOf(l)})
                </Text>
                <QtyInput label={`Quantity for design ${idx + 1}`} value={l.quantity} onChange={(v) => update(l.key, { quantity: v })} decimals={UNIT_DECIMALS[unitOf(l)]} size="md" error={!!errors[`${l.key}.qty`]} />
                {errors[`${l.key}.qty`] ? (
                  <Text variant="caption" tone="danger">
                    {errors[`${l.key}.qty`]}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Field label="Rate" prefix="₹" value={l.rate} onChangeText={(v) => update(l.key, { rate: v })} keyboardType="decimal-pad" num />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end", paddingBottom: 12 }}>
                  <Text variant="caption" tone="muted">
                    Value
                  </Text>
                  <Text variant="headline" num>
                    {formatINR(lineValue(l))}
                  </Text>
                </View>
              </View>
              <PhotoRow line={l} onAdd={(kind) => addPhoto(l.key, kind)} onRemoveNew={(key) => update(l.key, { newPhotos: l.newPhotos.filter((p) => p.key !== key) })} onRemoveSaved={(id) => (setRemovedPhotoIds((x) => [...x, id]), update(l.key, { savedPhotos: l.savedPhotos.filter((p) => p.id !== id) }))} />
              <Field label="Notes" value={l.notes} onChangeText={(v) => update(l.key, { notes: v })} placeholder="Optional, printed on the challan" />
            </Card>
          );
        })}
        <Button
          title="Add another design"
          icon={Plus}
          variant="secondary"
          onPress={() => {
            Haptics.selectionAsync();
            setLines((ls) => [...ls, newLine()]);
          }}
        />
      </View>

      <TermsFields policy={terms.policy} days={terms.days} onChange={setTerms} inheritLabel={inheritLabel} />
      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Printed on the challan" multiline />
      {!editing ? <ToggleRow label="Issue material now" hint={dispatchNow ? "Stock leaves the warehouse when you save." : "Saved as a draft. Issue material later from the challan."} value={dispatchNow} onChange={setDispatchNow} /> : null}
      {started ? <Field label="Reason for change *" value={reason} onChangeText={setReason} placeholder="e.g. Worker agreed to a new rate" error={errors.reason} /> : null}

      <QuickCreate ref={quick} />
      <ReasonSheet
        ref={shortSheet}
        title="Not enough stock"
        body={short.map((s) => `${s.name}: ${formatQty(s.available)} in stock, issuing ${formatQty(s.wanted)} ${s.unit} (${formatQty(roundQty(s.wanted - s.available))} short)`).join("\n")}
        placeholder="Reason to issue anyway, e.g. stock arrived today"
        confirmLabel="Issue anyway"
        onConfirm={async (r) => {
          shortSheet.current?.dismiss();
          await submit(r);
        }}
      />
    </FormScreen>
  );
}

function PhotoRow({ line, onAdd, onRemoveNew, onRemoveSaved }: { line: Line; onAdd: (k: JobItemPhotoKind) => void; onRemoveNew: (key: string) => void; onRemoveSaved: (id: string) => void }) {
  const { c } = useTheme();
  const thumbs = [...line.savedPhotos.map((p) => ({ key: p.id, kind: p.kind, saved: true, uri: p.id })), ...line.newPhotos.map((p) => ({ key: p.key, kind: p.kind, saved: false, uri: p.uri }))];
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Item photo" icon={Camera} variant="secondary" style={{ flex: 1 }} onPress={() => onAdd("ITEM")} />
        <Button title="Design photo" icon={Camera} variant="secondary" style={{ flex: 1 }} onPress={() => onAdd("DESIGN")} />
      </View>
      {thumbs.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {thumbs.map((t) => (
            <View key={t.key} style={{ gap: 2 }}>
              {t.saved ? <AuthedImage path={`/job-photos/${t.uri}/thumb`} size={72} /> : <Image source={{ uri: t.uri }} style={{ width: 72, height: 72, borderRadius: radius.md }} />}
              <Pressable onPress={() => (t.saved ? onRemoveSaved(t.key) : onRemoveNew(t.key))} hitSlop={8} accessibilityLabel="Remove photo" style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
                <X size={12} color="#fff" />
              </Pressable>
              <Text variant="caption" tone="faint" style={{ fontSize: 10 }}>
                {t.kind === "DESIGN" ? "Design" : "Item"}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text variant="caption" tone="faint" style={{ color: c.fgFaint }}>
          Photos of the material sent and the design to make (optional).
        </Text>
      )}
    </View>
  );
}
