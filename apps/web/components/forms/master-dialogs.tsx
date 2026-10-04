"use client";

import {
  formatQty,
  L,
  paiseToRupees,
  qtyFitsUnit,
  rupeesToPaise,
  todayISO,
  UNIT_DECIMALS,
  UNITS,
  type Client,
  type Design,
  type JobWorkType,
  type Material,
  type MaterialRow,
  type PaymentPolicy,
  type Product,
  type Unit,
} from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { api, ApiError } from "@/lib/api";
import { useDesigns, useJobWorkTypes, useProducts, useSettings } from "@/lib/queries";
import { PaymentTermsFields, termsLabel } from "./payment-terms";

type Errors = Record<string, string>;

function useMasterSave<T>(path: string, keys: string[], existingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => (existingId ? api.put<T>(`${path}/${existingId}`, body) : api.post<T>(path, body)),
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

function ActiveToggle({ value, onChange, hint = "Inactive items are hidden when creating challans. Nothing is deleted." }: { value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px]">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent-solid)]" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium">Active</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
    </label>
  );
}

function FormFooter({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  return (
    <div className="-mx-5 -mb-5 flex justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:col-span-2">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" loading={saving}>
        {label}
      </Button>
    </div>
  );
}

function onSaveError(err: unknown, setErrors: (e: Errors) => void) {
  if (err instanceof ApiError) setErrors(err.fieldErrors);
  toast.error(err instanceof Error ? err.message : "Could not save");
}

// ───────────── Job worker ─────────────
const emptyClient = {
  name: "",
  businessName: "",
  phone: "",
  alternatePhone: "",
  email: "",
  address: "",
  gstin: "",
  pan: "",
  notes: "",
  paymentPolicy: "" as PaymentPolicy | "",
  paymentDays: "",
  isActive: true,
};
type ClientForm = typeof emptyClient;

export function ClientDialog({
  open,
  onOpenChange,
  client,
  initialName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: Client | null;
  initialName?: string;
  onSaved?: (c: Client) => void;
}) {
  const [form, setForm] = useState<ClientForm>(emptyClient);
  const [errors, setErrors] = useState<Errors>({});
  const settings = useSettings();
  const save = useMasterSave<Client>("/clients", ["clients", "client"], client?.id);
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(
        client
          ? {
              name: client.name,
              businessName: client.businessName ?? "",
              phone: client.phone ?? "",
              alternatePhone: client.alternatePhone ?? "",
              email: client.email ?? "",
              address: client.address ?? "",
              gstin: client.gstin ?? "",
              pan: client.pan ?? "",
              notes: client.notes ?? "",
              paymentPolicy: client.paymentPolicy ?? "",
              paymentDays: client.paymentDays != null ? String(client.paymentDays) : "",
              isActive: client.isActive,
            }
          : { ...emptyClient, name: initialName ?? "" },
      );
    }
  }, [open, client, initialName]);
  const set = (k: keyof ClientForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const def = settings.data ? termsLabel(settings.data.defaultPaymentPolicy, settings.data.defaultPaymentDays) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const c = await save.mutateAsync({
        ...form,
        paymentPolicy: form.paymentPolicy || null,
        paymentDays: form.paymentPolicy ? Number(form.paymentDays) || 0 : null,
      });
      toast.success(client ? `${L.client} updated` : `${c.name} added${c.workerCode ? ` as ${c.workerCode}` : ""}`);
      onSaved?.(c);
      onOpenChange(false);
    } catch (err) {
      onSaveError(err, setErrors);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={client ? `Edit ${L.client.toLowerCase()}${client.workerCode ? ` · ${client.workerCode}` : ""}` : `New ${L.client.toLowerCase()}`}
      description={client ? undefined : "The embroidery, printing or stitching unit you send material to. A worker code is given automatically."}
      wide
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name}>
          <Input autoFocus value={form.name} onChange={set("name")} placeholder="Ramesh Embroidery" />
        </Field>
        <Field label="Business name" error={errors.businessName}>
          <Input value={form.businessName} onChange={set("businessName")} />
        </Field>
        <Field label="Mobile" error={errors.phone}>
          <Input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Alternate mobile" error={errors.alternatePhone}>
          <Input type="tel" inputMode="tel" value={form.alternatePhone} onChange={set("alternatePhone")} />
        </Field>
        <Field label="Email" error={errors.email} hint="Payment vouchers can be emailed here">
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Notes" error={errors.notes}>
          <Input value={form.notes} onChange={set("notes")} />
        </Field>
        <Field label="Address" className="sm:col-span-2" error={errors.address}>
          <Textarea rows={2} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="GSTIN" hint="Optional" error={errors.gstin}>
          <Input value={form.gstin} onChange={set("gstin")} className="num uppercase" />
        </Field>
        <Field label="PAN" hint="Optional" error={errors.pan}>
          <Input value={form.pan} onChange={set("pan")} className="num uppercase" />
        </Field>
        <div className="sm:col-span-2">
          <PaymentTermsFields
            policy={form.paymentPolicy}
            days={form.paymentDays}
            onChange={(v) => setForm((f) => ({ ...f, paymentPolicy: v.policy, paymentDays: v.days }))}
            inheritLabel={`Business default${def ? ` (${def})` : ""}`}
            errors={{ policy: errors.paymentPolicy, days: errors.paymentDays }}
          />
          <p className="mt-1.5 text-xs text-fg-muted">Used for new challans to this worker. A challan can override it.</p>
        </div>
        {client && (
          <div className="sm:col-span-2">
            <ActiveToggle
              value={form.isActive}
              onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              hint="Inactive (archived) workers are hidden when creating challans. Their history is kept."
            />
          </div>
        )}
        <FormFooter onCancel={() => onOpenChange(false)} saving={save.isPending} label={client ? "Save changes" : `Add ${L.client.toLowerCase()}`} />
      </form>
    </Dialog>
  );
}

// ───────────── Product ─────────────
const emptyProduct = { name: "", code: "", unit: "PCS" as Unit, description: "", isActive: true };

export function ProductDialog({
  open,
  onOpenChange,
  product,
  initialName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: Product | null;
  initialName?: string;
  onSaved?: (p: Product) => void;
}) {
  const [form, setForm] = useState(emptyProduct);
  const [errors, setErrors] = useState<Errors>({});
  const save = useMasterSave<Product>("/products", ["products"], product?.id);
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(product ? { name: product.name, code: product.code ?? "", unit: product.unit, description: product.description ?? "", isActive: product.isActive } : { ...emptyProduct, name: initialName ?? "" });
    }
  }, [open, product, initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = await save.mutateAsync(form);
      toast.success(product ? "Product updated" : `${p.name} added`);
      onSaved?.(p);
      onOpenChange(false);
    } catch (err) {
      onSaveError(err, setErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={product ? "Edit product" : "New product"} description="Something you send out for work, like Saree, Blouse or Fabric.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required error={errors.name}>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Plain Blouse" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" error={errors.code}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Unit" error={errors.unit} hint={UNIT_DECIMALS[form.unit] ? `Up to ${UNIT_DECIMALS[form.unit]} decimals` : "Whole numbers"}>
            <UnitSelect value={form.unit} onChange={(unit) => setForm({ ...form, unit })} />
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {product && <ActiveToggle value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
        <FormFooter onCancel={() => onOpenChange(false)} saving={save.isPending} label={product ? "Save changes" : "Add product"} />
      </form>
    </Dialog>
  );
}

export function UnitSelect({ value, onChange, disabled }: { value: Unit; onChange: (u: Unit) => void; disabled?: boolean }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Unit)} disabled={disabled} aria-label="Unit">
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </Select>
  );
}

// ───────────── Job work type ─────────────
const emptyType = { name: "", code: "", description: "", isActive: true };

export function JobWorkTypeDialog({
  open,
  onOpenChange,
  type,
  initialName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type?: JobWorkType | null;
  initialName?: string;
  onSaved?: (t: JobWorkType) => void;
}) {
  const [form, setForm] = useState(emptyType);
  const [errors, setErrors] = useState<Errors>({});
  const save = useMasterSave<JobWorkType>("/job-work-types", ["job-work-types"], type?.id);
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(type ? { name: type.name, code: type.code ?? "", description: type.description ?? "", isActive: type.isActive } : { ...emptyType, name: initialName ?? "" });
    }
  }, [open, type, initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const t = await save.mutateAsync(form);
      toast.success(type ? `${L.jobWorkType} updated` : `${t.name} added`);
      onSaved?.(t);
      onOpenChange(false);
    } catch (err) {
      onSaveError(err, setErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={type ? `Edit ${L.jobWorkType.toLowerCase()}` : `New ${L.jobWorkType.toLowerCase()}`} description="The kind of work done, like Embroidery, Printing or Stitching.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4">
          <Field label="Name" required error={errors.name}>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Embroidery" />
          </Field>
          <Field label="Code" error={errors.code}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {type && <ActiveToggle value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
        <FormFooter onCancel={() => onOpenChange(false)} saving={save.isPending} label={type ? "Save changes" : "Add type"} />
      </form>
    </Dialog>
  );
}

// ───────────── Design ─────────────
const emptyDesign = { name: "", code: "", rate: "", description: "", jobWorkTypeId: "", isActive: true };

export function DesignDialog({
  open,
  onOpenChange,
  design,
  initialName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  design?: Design | null;
  initialName?: string;
  onSaved?: (d: Design) => void;
}) {
  const [form, setForm] = useState(emptyDesign);
  const [errors, setErrors] = useState<Errors>({});
  const types = useJobWorkTypes(false);
  const save = useMasterSave<Design>("/designs", ["designs"], design?.id);
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(
        design
          ? {
              name: design.name,
              code: design.code ?? "",
              rate: String(paiseToRupees(design.defaultRatePaise)),
              description: design.description ?? "",
              jobWorkTypeId: design.jobWorkTypeId ?? "",
              isActive: design.isActive,
            }
          : { ...emptyDesign, name: initialName ?? "" },
      );
    }
  }, [open, design, initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const d = await save.mutateAsync({
        name: form.name,
        code: form.code,
        description: form.description,
        isActive: form.isActive,
        jobWorkTypeId: form.jobWorkTypeId || null,
        defaultRatePaise: rupeesToPaise(form.rate || 0),
      });
      toast.success(design ? "Design updated" : `${d.name} added`);
      onSaved?.(d);
      onOpenChange(false);
    } catch (err) {
      onSaveError(err, setErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={design ? "Edit design" : "New design"} description="A design with its usual job work rate.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Design name" required error={errors.name}>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Floral Design" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default rate" error={errors.defaultRatePaise} hint="Default for new challans only">
            <MoneyInput value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Code" error={errors.code}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
        </div>
        <Field label={L.jobWorkType} error={errors.jobWorkTypeId}>
          <Select value={form.jobWorkTypeId} onChange={(e) => setForm({ ...form, jobWorkTypeId: e.target.value })}>
            <option value="">Not set</option>
            {(types.data ?? [])
              .filter((t) => t.isActive || t.id === form.jobWorkTypeId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {!t.isActive ? " (inactive)" : ""}
                </option>
              ))}
          </Select>
        </Field>
        {design && <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-2">Changing the rate only affects new challans. Existing challans and returns keep their own rates.</p>}
        <Field label="Notes" error={errors.description}>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {design && <ActiveToggle value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
        <FormFooter onCancel={() => onOpenChange(false)} saving={save.isPending} label={design ? "Save changes" : "Add design"} />
      </form>
    </Dialog>
  );
}

// ───────────── Material ─────────────
const emptyMaterial = {
  code: "",
  name: "",
  productId: "",
  fabricType: "",
  color: "",
  designId: "",
  unit: "MTR" as Unit,
  lotNumber: "",
  rollNumber: "",
  supplier: "",
  location: "",
  notes: "",
  openingQty: "",
  isActive: true,
};

export function MaterialDialog({
  open,
  onOpenChange,
  material,
  initialName,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  material?: Material | null;
  initialName?: string;
  /** Prefill for a new material (e.g. the product/design of the challan line). */
  defaults?: { productId?: string; designId?: string; unit?: Unit };
  onSaved?: (m: Material) => void;
}) {
  const [form, setForm] = useState(emptyMaterial);
  const [errors, setErrors] = useState<Errors>({});
  const products = useProducts();
  const designs = useDesigns();
  const save = useMasterSave<Material>("/materials", ["materials"], material?.id);
  useEffect(() => {
    if (open) {
      setErrors({});
      if (material)
        setForm({
          code: material.code,
          name: material.name,
          productId: material.productId ?? "",
          fabricType: material.fabricType ?? "",
          color: material.color ?? "",
          designId: material.designId ?? "",
          unit: material.unit,
          lotNumber: material.lotNumber ?? "",
          rollNumber: material.rollNumber ?? "",
          supplier: material.supplier ?? "",
          location: material.location ?? "",
          notes: material.notes ?? "",
          openingQty: "",
          isActive: material.isActive,
        });
      else setForm({ ...emptyMaterial, name: initialName ?? "", productId: defaults?.productId ?? "", designId: defaults?.designId ?? "", unit: defaults?.unit ?? emptyMaterial.unit });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, material, initialName]);
  const set = (k: keyof typeof emptyMaterial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const opening = form.openingQty ? Number(form.openingQty) : 0;
    if (opening && (!Number.isFinite(opening) || opening < 0 || !qtyFitsUnit(opening, form.unit))) {
      setErrors({ openingQty: UNIT_DECIMALS[form.unit] ? `Up to ${UNIT_DECIMALS[form.unit]} decimals in ${form.unit}` : `Whole ${form.unit} only` });
      return;
    }
    const { openingQty: _o, ...rest } = form;
    try {
      const m = await save.mutateAsync({ ...rest, productId: form.productId || null, designId: form.designId || null, ...(material ? {} : { openingQty: opening || undefined }) });
      toast.success(material ? "Material updated" : `${m.code} ${m.name} added${opening ? ` with ${formatQty(opening)} ${m.unit} in stock` : ""}`);
      onSaved?.(m);
      onOpenChange(false);
    } catch (err) {
      onSaveError(err, setErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={material ? `Edit ${material.code}` : `New ${L.material.toLowerCase()}`} description={material ? material.name : "Raw material you issue to job workers – fabric, sarees, blouses."} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name}>
          <Input autoFocus value={form.name} onChange={set("name")} placeholder="Georgette fabric – red" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" error={errors.code} hint={material ? undefined : "Blank = automatic"}>
            <Input value={form.code} onChange={set("code")} placeholder="MAT-0001" className="num uppercase" />
          </Field>
          <Field label="Unit" required error={errors.unit}>
            <UnitSelect value={form.unit} onChange={(unit) => setForm((f) => ({ ...f, unit }))} />
          </Field>
        </div>
        <Field label="Product" error={errors.productId}>
          <Select value={form.productId} onChange={set("productId")}>
            <option value="">Not set</option>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Design" error={errors.designId} hint="Optional – if this material is for one design">
          <Select value={form.designId} onChange={set("designId")}>
            <option value="">Any design</option>
            {designs.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fabric type" error={errors.fabricType}>
          <Input value={form.fabricType} onChange={set("fabricType")} placeholder="Georgette" />
        </Field>
        <Field label="Colour" error={errors.color}>
          <Input value={form.color} onChange={set("color")} placeholder="Red" />
        </Field>
        <Field label="Lot no." error={errors.lotNumber}>
          <Input value={form.lotNumber} onChange={set("lotNumber")} className="num" />
        </Field>
        <Field label="Roll no." error={errors.rollNumber}>
          <Input value={form.rollNumber} onChange={set("rollNumber")} className="num" />
        </Field>
        <Field label="Supplier" error={errors.supplier}>
          <Input value={form.supplier} onChange={set("supplier")} />
        </Field>
        <Field label="Location" error={errors.location} hint="Rack / godown">
          <Input value={form.location} onChange={set("location")} />
        </Field>
        {!material && (
          <Field label={`Opening stock (${form.unit})`} error={errors.openingQty} hint="What is in the warehouse right now. Recorded as stock received today.">
            <Input type="number" inputMode="decimal" min={0} step={UNIT_DECIMALS[form.unit] ? 1 / 10 ** UNIT_DECIMALS[form.unit] : 1} value={form.openingQty} onChange={set("openingQty")} className="num" placeholder="0" />
          </Field>
        )}
        <Field label="Notes" error={errors.notes} className={material ? "sm:col-span-2" : undefined}>
          <Input value={form.notes} onChange={set("notes")} />
        </Field>
        {material && (
          <div className="sm:col-span-2">
            <ActiveToggle value={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
          </div>
        )}
        <FormFooter onCancel={() => onOpenChange(false)} saving={save.isPending} label={material ? "Save changes" : "Add material"} />
      </form>
    </Dialog>
  );
}

// ───────────── Stock movement (receive / adjust) ─────────────
export type StockAction = "RECEIPT" | "ADJUSTMENT";

export function StockMovementDialog({
  open,
  onOpenChange,
  material,
  action,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  material: MaterialRow | null;
  action: StockAction;
}) {
  const qc = useQueryClient();
  const [dir, setDir] = useState<"ADJUSTMENT_IN" | "ADJUSTMENT_OUT">("ADJUSTMENT_IN");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (open) {
      setDir("ADJUSTMENT_IN");
      setQty("");
      setDate(todayISO());
      setReason("");
      setErrors({});
    }
  }, [open]);
  const unit = material?.unit ?? "PCS";
  const m = useMutation({
    mutationFn: (body: unknown) => api.post("/stock/movements", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
  const n = Number(qty);
  const after = material ? material.stock.available + (action === "RECEIPT" || dir === "ADJUSTMENT_IN" ? n || 0 : -(n || 0)) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!(n > 0)) errs.qty = "Enter a quantity";
    else if (!qtyFitsUnit(n, unit)) errs.qty = UNIT_DECIMALS[unit] ? `Up to ${UNIT_DECIMALS[unit]} decimals in ${unit}` : `Whole ${unit} only`;
    if (action === "ADJUSTMENT" && reason.trim().length < 3) errs.reason = "A reason is required for adjustments";
    setErrors(errs);
    if (Object.keys(errs).length || !material) return;
    try {
      await m.mutateAsync({ materialId: material.id, type: action === "RECEIPT" ? "RECEIPT" : dir, qty: n, date, reason: reason.trim() || null });
      toast.success(action === "RECEIPT" ? `${formatQty(n)} ${unit} received` : `Stock adjusted ${dir === "ADJUSTMENT_IN" ? "+" : "−"}${formatQty(n)} ${unit}`);
      onOpenChange(false);
    } catch (err) {
      onSaveError(err, setErrors);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={action === "RECEIPT" ? "Receive stock" : "Adjust stock"}
      description={material ? `${material.code} · ${material.name} · ${formatQty(material.stock.available)} ${unit} in warehouse` : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        {action === "ADJUSTMENT" && (
          <Segmented
            label="Direction"
            value={dir}
            onChange={setDir}
            options={[
              { value: "ADJUSTMENT_IN", label: "Add (+)" },
              { value: "ADJUSTMENT_OUT", label: "Remove (−)" },
            ]}
          />
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Quantity (${unit})`} required error={errors.qty}>
            <Input autoFocus type="number" inputMode="decimal" min={0} step={UNIT_DECIMALS[unit] ? 1 / 10 ** UNIT_DECIMALS[unit] : 1} value={qty} onChange={(e) => setQty(e.target.value)} className="num" placeholder="0" />
          </Field>
          <Field label="Date" required error={errors.date}>
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={action === "RECEIPT" ? "Note" : "Reason"} required={action === "ADJUSTMENT"} error={errors.reason} hint={action === "RECEIPT" ? "Bill / supplier reference (optional)" : "Kept in the material ledger and audit log"}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === "RECEIPT" ? "Bill no. 123 from supplier" : "Physical count difference"} />
        </Field>
        {material && n > 0 && (
          <p className={after < 0 ? "rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger" : "rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-2"}>
            Warehouse stock after this: <span className="num font-semibold">{formatQty(after)} {unit}</span>
            {after < 0 && " – this is below zero."}
          </p>
        )}
        <FormFooter onCancel={() => onOpenChange(false)} saving={m.isPending} label={action === "RECEIPT" ? "Receive stock" : "Save adjustment"} />
      </form>
    </Dialog>
  );
}
