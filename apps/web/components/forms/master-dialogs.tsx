"use client";

import { paiseToRupees, rupeesToPaise, type Client, type Design, type Product } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

type Errors = Record<string, string>;

function useMasterSave<T>(path: string, keys: string[], existingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => (existingId ? api.put<T>(`${path}/${existingId}`, body) : api.post<T>(path, body)),
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

function ActiveToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-indigo" checked={value} onChange={(e) => onChange(e.target.checked)} />
      Active <span className="text-muted">(inactive items are hidden when creating jobs)</span>
    </label>
  );
}

// ───────────── Client ─────────────
const emptyClient = { name: "", businessName: "", phone: "", email: "", address: "", gstin: "", notes: "", isActive: true };

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
  const [form, setForm] = useState(emptyClient);
  const [errors, setErrors] = useState<Errors>({});
  const save = useMasterSave<Client>("/clients", ["clients", "client"], client?.id);
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(client ? { ...emptyClient, ...Object.fromEntries(Object.entries(client).map(([k, v]) => [k, v ?? ""])), isActive: client.isActive } : { ...emptyClient, name: initialName ?? "" });
    }
  }, [open, client, initialName]);
  const set = (k: keyof typeof emptyClient) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const c = await save.mutateAsync(form);
      toast.success(client ? "Client updated" : `${c.name} added`);
      onSaved?.(c);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={client ? "Edit client" : "New client"} description="The job worker / party you send material to." wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name}>
          <Input autoFocus value={form.name} onChange={set("name")} placeholder="e.g. Sharma Embroidery" />
        </Field>
        <Field label="Business name" error={errors.businessName}>
          <Input value={form.businessName} onChange={set("businessName")} />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Address" className="sm:col-span-2" error={errors.address}>
          <Textarea rows={2} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="GSTIN" hint="Optional" error={errors.gstin}>
          <Input value={form.gstin} onChange={set("gstin")} className="uppercase" />
        </Field>
        <Field label="Notes" error={errors.notes}>
          <Input value={form.notes} onChange={set("notes")} />
        </Field>
        {client && (
          <div className="sm:col-span-2">
            <ActiveToggle value={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {client ? "Save changes" : "Add client"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ───────────── Product ─────────────
const emptyProduct = { name: "", code: "", unit: "pcs", description: "", isActive: true };

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
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={product ? "Edit product" : "New product"} description="Something you send out for work, like Plain Blouse or Saree.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required error={errors.name}>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Plain Blouse" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" error={errors.code}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Unit" error={errors.unit}>
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs" />
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {product && <ActiveToggle value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {product ? "Save changes" : "Add product"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ───────────── Design ─────────────
const emptyDesign = { name: "", code: "", rate: "", description: "", isActive: true };

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
  const save = useMasterSave<Design>("/designs", ["designs"], design?.id);
  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(
        design
          ? { name: design.name, code: design.code ?? "", rate: String(paiseToRupees(design.defaultRatePaise)), description: design.description ?? "", isActive: design.isActive }
          : { ...emptyDesign, name: initialName ?? "" },
      );
    }
  }, [open, design, initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const d = await save.mutateAsync({ name: form.name, code: form.code, description: form.description, isActive: form.isActive, defaultRatePaise: rupeesToPaise(form.rate || 0) });
      toast.success(design ? "Design updated" : `${d.name} added`);
      onSaved?.(d);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={design ? "Edit design" : "New design"} description="A type of work with its usual rate per piece.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Design name" required error={errors.name}>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Floral Design" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default rate / piece" error={errors.defaultRatePaise}>
            <MoneyInput value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Code" error={errors.code}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
        </div>
        {design && <p className="rounded-lg bg-marigold-50 px-3 py-2 text-sm text-marigold-700">Changing the rate only affects new jobs. Existing jobs keep their own rate.</p>}
        <Field label="Notes" error={errors.description}>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {design && <ActiveToggle value={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {design ? "Save changes" : "Add design"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
