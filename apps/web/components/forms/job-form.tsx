"use client";

import {
  formatINR,
  formatQty,
  L,
  lineAmount,
  paiseToRupees,
  qtyFitsUnit,
  roundQty,
  rupeesToPaise,
  todayISO,
  UNIT_DECIMALS,
  type Design,
  type JobDetail,
  type Material,
  type PaymentPolicy,
  type Unit,
} from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClientDialog, DesignDialog, JobWorkTypeDialog, MaterialDialog, ProductDialog } from "@/components/forms/master-dialogs";
import { PaymentTermsFields, termsLabel } from "@/components/forms/payment-terms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useClients, useDesigns, useJobWorkTypes, useMaterials, useProducts, useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface Line {
  key: string;
  id?: string; // existing challan line
  designId: string;
  materialId: string;
  jobWorkTypeId: string;
  quantity: string;
  rate: string;
  notes: string;
  locked?: boolean; // material already issued – can't remove or change material
  minQty?: number;
  unit?: Unit; // known unit of an existing line
}

interface StockShort {
  materialId: string;
  name: string;
  unit: string;
  available: number;
  wanted: number;
}

let k = 0;
const newLine = (): Line => ({ key: `l${++k}`, designId: "", materialId: "", jobWorkTypeId: "", quantity: "", rate: "", notes: "" });
const stepFor = (u: Unit) => (UNIT_DECIMALS[u] ? 1 / 10 ** UNIT_DECIMALS[u] : 1);

export function JobForm({ job, defaultClientId }: { job?: JobDetail; defaultClientId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const clients = useClients();
  const products = useProducts();
  const designs = useDesigns();
  const types = useJobWorkTypes();
  const materials = useMaterials({ active: true });
  const settings = useSettings();
  const editing = !!job;
  const started = !!job && job.status !== "DRAFT";

  const [clientId, setClientId] = useState(job?.client.id ?? defaultClientId ?? "");
  const [productId, setProductId] = useState(job?.product.id ?? "");
  const [jobWorkTypeId, setJobWorkTypeId] = useState(job?.jobWorkType?.id ?? "");
  const [jobDate, setJobDate] = useState(job ? job.jobDate.slice(0, 10) : todayISO());
  const [expected, setExpected] = useState(job?.expectedReturnDate?.slice(0, 10) ?? "");
  const [policy, setPolicy] = useState<PaymentPolicy | "">(job?.paymentPolicy ?? "");
  const [days, setDays] = useState(job?.paymentDays != null ? String(job.paymentDays) : "");
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
        }))
      : [newLine()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [short, setShort] = useState<StockShort[] | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [dialog, setDialog] = useState<{ kind: "client" | "product" | "design" | "material" | "type"; name: string; lineKey?: string } | null>(null);

  const designById = useMemo(() => new Map((designs.data ?? []).map((d) => [d.id, d])), [designs.data]);
  const matById = useMemo(() => new Map((materials.data ?? []).map((m) => [m.id, m])), [materials.data]);

  const designOptions = (designs.data ?? []).map((d) => ({
    value: d.id,
    label: d.name,
    sub: `Default rate ${formatINR(d.defaultRatePaise)}${d.jobWorkType ? ` · ${d.jobWorkType.name}` : ""}`,
    keywords: [d.code ?? ""],
  }));
  for (const it of job?.items ?? []) if (!designById.has(it.designId)) designOptions.push({ value: it.designId, label: it.designName, sub: "Inactive design", keywords: [] });

  const materialOptions = (materials.data ?? []).map((m) => ({
    value: m.id,
    label: `${m.code} · ${m.name}`,
    sub: (
      <>
        {[m.color, m.lotNumber && `Lot ${m.lotNumber}`, m.rollNumber && `Roll ${m.rollNumber}`].filter(Boolean).join(" · ")}
        {(m.color || m.lotNumber || m.rollNumber) && " · "}
        <span className={m.stock.available > 0 ? "text-fg-2" : "text-danger"}>
          {formatQty(m.stock.available)} {m.unit} in stock
        </span>
      </>
    ),
    keywords: [m.code, m.lotNumber ?? "", m.rollNumber ?? "", m.color ?? "", m.fabricType ?? ""],
  }));
  for (const it of job?.items ?? [])
    if (it.material && !matById.has(it.material.id)) materialOptions.push({ value: it.material.id, label: `${it.material.code} · ${it.material.name}`, sub: <>Inactive material</>, keywords: [] });

  const unitOf = (l: Line): Unit => matById.get(l.materialId)?.unit ?? l.unit ?? "PCS";
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickDesign = (key: string, d: Pick<Design, "id" | "defaultRatePaise">) => update(key, { designId: d.id, rate: String(paiseToRupees(d.defaultRatePaise)) });
  const pickMaterial = (key: string, m: Pick<Material, "id" | "unit">) => update(key, { materialId: m.id, unit: m.unit });

  const lineValue = (l: Line) => lineAmount(Number(l.quantity) || 0, rupeesToPaise(l.rate || 0));
  const qtyByUnit = new Map<Unit, number>();
  let totalValue = 0;
  for (const l of lines) {
    const q = Number(l.quantity) || 0;
    if (q > 0) qtyByUnit.set(unitOf(l), roundQty((qtyByUnit.get(unitOf(l)) ?? 0) + q));
    totalValue += lineValue(l);
  }
  const qtySummary = [...qtyByUnit].map(([u, q]) => `${formatQty(q)} ${u}`).join(" · ") || "0";

  // Live stock check for the initial issue (new challans only).
  const wanted = new Map<string, number>();
  if (!editing && dispatchNow) for (const l of lines) if (l.materialId && Number(l.quantity) > 0) wanted.set(l.materialId, roundQty((wanted.get(l.materialId) ?? 0) + Number(l.quantity)));
  const liveShort = new Map([...wanted].filter(([id, q]) => matById.has(id) && q > matById.get(id)!.stock.available + 1e-9).map(([id, q]) => [id, q]));

  const client = clients.data?.find((c) => c.id === clientId);
  const product = products.data?.find((p) => p.id === productId);
  const defaultTerms = settings.data ? termsLabel(settings.data.defaultPaymentPolicy, settings.data.defaultPaymentDays) : "business default";
  const inheritLabel = client?.paymentPolicy ? `Worker's terms (${termsLabel(client.paymentPolicy, client.paymentDays)})` : `Worker's terms (business default: ${defaultTerms})`;

  async function submit(e: React.FormEvent | null, stockOverrideReason?: string) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!clientId) errs.clientId = `Choose a ${L.client.toLowerCase()}`;
    if (!productId) errs.productId = "Choose a product";
    if (expected && expected < jobDate) errs.expected = "Can't be before the challan date";
    const filled = lines.filter((l) => l.designId || l.quantity || l.materialId);
    if (filled.length === 0) errs.items = "Add at least one design";
    filled.forEach((l) => {
      if (!l.designId) errs[`${l.key}.design`] = "Choose a design";
      if (!l.materialId && (!l.id || !started)) errs[`${l.key}.material`] = "Choose the material";
      const q = Number(l.quantity);
      const u = unitOf(l);
      if (!(q > 0)) errs[`${l.key}.qty`] = "Enter quantity";
      else if (!qtyFitsUnit(q, u)) errs[`${l.key}.qty`] = UNIT_DECIMALS[u] ? `Max ${UNIT_DECIMALS[u]} decimals in ${u}` : `Whole ${u} only`;
      else if (l.minQty && q < l.minQty) errs[`${l.key}.qty`] = `At least ${formatQty(l.minQty)} (already issued)`;
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]);
      return;
    }
    const items = filled.map((l) => ({
      id: l.id,
      designId: l.designId,
      materialId: l.materialId || null,
      jobWorkTypeId: l.jobWorkTypeId || null,
      quantity: Number(l.quantity),
      ratePaise: rupeesToPaise(l.rate || 0),
      notes: l.notes || null,
    }));
    const terms = { paymentPolicy: policy || null, paymentDays: policy ? Number(days) || 0 : null };
    setSaving(true);
    try {
      const body = { clientId, productId, jobWorkTypeId: jobWorkTypeId || null, jobDate, expectedReturnDate: expected || null, notes, ...terms, items };
      const saved = editing
        ? await api.patch<JobDetail>(`/jobs/${job!.id}`, { ...body, reason })
        : await api.post<JobDetail>("/jobs", { ...body, items: items.map(({ id: _id, ...i }) => i), dispatchNow, stockOverrideReason: stockOverrideReason || null });
      qc.invalidateQueries();
      toast.success(editing ? `${L.job} updated` : `${L.job} ${saved.jobNumber} created${dispatchNow ? ` · material issued` : " as draft"}`);
      router.push(`/jobs/${saved.id}`);
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError) {
        const details = err.body.details as { stockShort?: StockShort[] } | undefined;
        if (err.status === 422 && details?.stockShort?.length) {
          setShort(details.stockShort);
          return;
        }
        setErrors(err.fieldErrors);
      }
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <form onSubmit={(e) => submit(e)} className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-8">
        <FormSection title="Challan details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={L.client} required error={errors.clientId}>
              <Combobox
                autoFocus={!editing && !defaultClientId}
                options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name, sub: [c.workerCode, c.businessName ?? c.phone].filter(Boolean).join(" · "), keywords: [c.phone ?? "", c.workerCode ?? ""] }))}
                value={clientId}
                onChange={setClientId}
                placeholder="Who is doing the work?"
                invalid={!!errors.clientId}
                onCreate={(name) => setDialog({ kind: "client", name })}
                createLabel={`New ${L.client.toLowerCase()}`}
              />
            </Field>
            <Field label="Product" required error={errors.productId}>
              <Combobox
                options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name, sub: [p.code, p.unit].filter(Boolean).join(" · "), keywords: [p.code ?? ""] }))}
                value={productId}
                onChange={setProductId}
                placeholder="What are you sending?"
                invalid={!!errors.productId}
                onCreate={(name) => setDialog({ kind: "product", name })}
                createLabel="New product"
              />
            </Field>
            <Field label={L.jobWorkType} error={errors.jobWorkTypeId}>
              <div className="flex gap-2">
                <Select value={jobWorkTypeId} onChange={(e) => setJobWorkTypeId(e.target.value)} aria-label={L.jobWorkType}>
                  <option value="">Not set</option>
                  {types.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {job?.jobWorkType && !types.data?.some((t) => t.id === job.jobWorkType!.id) && <option value={job.jobWorkType.id}>{job.jobWorkType.name}</option>}
                </Select>
                <Button type="button" variant="secondary" size="icon" onClick={() => setDialog({ kind: "type", name: "" })} aria-label={`New ${L.jobWorkType.toLowerCase()}`} title={`New ${L.jobWorkType.toLowerCase()}`}>
                  <Plus />
                </Button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Challan date" required>
                <Input type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} required />
              </Field>
              <Field label="Expected return" error={errors.expected}>
                <Input type="date" value={expected} min={jobDate} onChange={(e) => setExpected(e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <PaymentTermsFields policy={policy} days={days} onChange={(v) => {
                  setPolicy(v.policy);
                  setDays(v.days);
                }} inheritLabel={inheritLabel} />
              {policy && <p className="mt-1.5 text-xs text-fg-muted">Overrides the worker’s terms for this challan only.</p>}
            </div>
          </div>
        </FormSection>

        <FormSection title="Designs & material" description="One line per design. The rate fills in from the design default – change it if this challan is different.">
          {errors.items && (
            <p role="alert" className="mb-2 text-xs text-danger">
              {errors.items}
            </p>
          )}
          <Card className="overflow-hidden">
            <div className="hidden h-[34px] grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6.5rem_6.5rem_6.5rem_2rem] items-center gap-3 border-b border-border px-3 text-xs font-medium text-fg-muted lg:grid">
              <span>Design</span>
              <span>Material</span>
              <span className="text-right">Quantity</span>
              <span className="text-right">Rate / unit</span>
              <span className="text-right">Value</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {lines.map((l, idx) => {
                const u = unitOf(l);
                const mat = matById.get(l.materialId);
                const shortQty = l.materialId ? liveShort.get(l.materialId) : undefined;
                return (
                  <li key={l.key} className="space-y-2 px-3 py-3">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_6.5rem_6.5rem_6.5rem_2rem] lg:items-start">
                      <div className="col-span-2 lg:col-span-1">
                        <span className="mb-1 block text-xs text-fg-muted lg:hidden">Design {idx + 1}</span>
                        <Combobox
                          options={designOptions}
                          value={l.designId}
                          onChange={(id) => {
                            const d = designById.get(id);
                            if (d) pickDesign(l.key, d);
                            else update(l.key, { designId: id });
                          }}
                          placeholder="Choose design"
                          invalid={!!errors[`${l.key}.design`]}
                          onCreate={(name) => setDialog({ kind: "design", name, lineKey: l.key })}
                          createLabel="New design"
                        />
                        <LineError msg={errors[`${l.key}.design`]} />
                      </div>
                      <div className="col-span-2 lg:col-span-1">
                        <span className="mb-1 block text-xs text-fg-muted lg:hidden">{L.material}</span>
                        {l.locked ? (
                          <div className="flex h-8 items-center truncate rounded-md bg-surface-2 px-2.5 text-[13px] text-fg-2 pointer-coarse:h-10" title="Material already issued – can't change">
                            {materialOptions.find((o) => o.value === l.materialId)?.label ?? "No material linked"}
                          </div>
                        ) : (
                          <Combobox
                            options={materialOptions}
                            value={l.materialId}
                            onChange={(id) => {
                              const m = matById.get(id);
                              if (m) pickMaterial(l.key, m);
                              else update(l.key, { materialId: id });
                            }}
                            placeholder="Choose material"
                            searchPlaceholder="Code, name, lot, roll…"
                            invalid={!!errors[`${l.key}.material`]}
                            onCreate={(name) => setDialog({ kind: "material", name, lineKey: l.key })}
                            createLabel="Add material"
                          />
                        )}
                        <LineError msg={errors[`${l.key}.material`]} />
                        {mat && !l.locked && (
                          <span className={cn("mt-1 block text-xs", shortQty !== undefined ? "text-danger" : "text-fg-muted")}>
                            {formatQty(mat.stock.available)} {mat.unit} in warehouse
                            {shortQty !== undefined && ` · ${formatQty(roundQty(shortQty - mat.stock.available))} short`}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="mb-1 block text-xs text-fg-muted lg:hidden">Quantity ({u})</span>
                        <div className="relative">
                          <Input
                            type="number"
                            inputMode={UNIT_DECIMALS[u] ? "decimal" : "numeric"}
                            min={l.minQty || 0}
                            step={stepFor(u)}
                            value={l.quantity}
                            onChange={(e) => update(l.key, { quantity: e.target.value })}
                            aria-invalid={!!errors[`${l.key}.qty`]}
                            className="num pr-11 text-right"
                            placeholder="0"
                            aria-label={`Quantity in ${u}`}
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-fg-faint">{u}</span>
                        </div>
                        <LineError msg={errors[`${l.key}.qty`]} />
                      </div>
                      <div>
                        <span className="mb-1 block text-xs text-fg-muted lg:hidden">Rate / {u}</span>
                        <MoneyInput value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} className="text-right" placeholder="0" aria-label={`Rate per ${u}`} />
                        {l.designId && designById.get(l.designId) && rupeesToPaise(l.rate || 0) !== designById.get(l.designId)!.defaultRatePaise && (
                          <span className="mt-1 block text-[11px] text-fg-muted">Default {formatINR(designById.get(l.designId)!.defaultRatePaise)}</span>
                        )}
                      </div>
                      <div className="num flex h-8 items-center justify-end text-[13px] font-medium text-fg max-lg:justify-start pointer-coarse:h-10">
                        <span className="mr-2 text-xs font-normal text-fg-muted lg:hidden">Value</span>
                        {formatINR(lineValue(l))}
                      </div>
                      <div className="flex h-8 items-center justify-end pointer-coarse:h-10">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-fg-faint hover:bg-danger-subtle hover:text-danger"
                          disabled={l.locked || lines.length === 1}
                          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                          aria-label="Remove line"
                          title={l.locked ? "Material already issued for this line" : "Remove"}
                        >
                          <Trash2 className="!size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
                      <Select value={l.jobWorkTypeId} onChange={(e) => update(l.key, { jobWorkTypeId: e.target.value })} aria-label={`${L.jobWorkType} for this line`} className="text-xs">
                        <option value="">{L.jobWorkType}: same as challan</option>
                        {types.data?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                      <Input value={l.notes} onChange={(e) => update(l.key, { notes: e.target.value })} placeholder="Line notes (optional)" aria-label="Line notes" />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border px-1.5 py-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
                <Plus /> Add another design
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-strong bg-surface-2/50 px-3 py-2.5 text-[13px] font-semibold">
              <div>Total</div>
              <div className="num ml-auto">{qtySummary}</div>
              <div className="num w-28 text-right">{formatINR(totalValue)}</div>
            </div>
          </Card>
        </FormSection>

        <div className="space-y-4">
          <Field label="Notes" hint="Printed on the challan">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {started && (
            <Field label="Reason for change" hint="Quantity, rate and payment-term changes are recorded in the challan history.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Worker agreed to a new rate" />
            </Field>
          )}
        </div>
      </div>

      {/* Summary rail */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Card>
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs text-fg-muted">{editing ? `${L.jobNumber} ${job!.jobNumber}` : `New ${L.job.toLowerCase()}`}</div>
            <div className={cn("mt-0.5 truncate text-[13px] font-medium", !client && "text-fg-faint")}>{client?.name ?? `No ${L.client.toLowerCase()} yet`}</div>
            <div className={cn("truncate text-xs", product ? "text-fg-muted" : "text-fg-faint")}>{product?.name ?? "No product yet"}</div>
          </div>
          <dl className="space-y-2 px-4 py-3 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Quantity</dt>
              <dd className="num text-right font-medium">{qtySummary}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-fg-muted">Work value</dt>
              <dd className="num text-[15px] font-semibold">{formatINR(totalValue)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Terms</dt>
              <dd className="truncate text-right text-xs">{policy ? termsLabel(policy, Number(days) || 0) : client?.paymentPolicy ? termsLabel(client.paymentPolicy, client.paymentDays) : defaultTerms}</dd>
            </div>
          </dl>
          {liveShort.size > 0 && (
            <div className="mx-3 mb-3 flex gap-2 rounded-md bg-warning-subtle px-3 py-2 text-xs text-fg-2">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
              <span>Some material is short in the warehouse. You’ll be asked for a reason to issue anyway.</span>
            </div>
          )}
          <div className="space-y-2 border-t border-border p-3">
            {!editing && (
              <label className="flex cursor-pointer gap-2.5 rounded-md px-1 py-1.5">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent-solid)]" checked={dispatchNow} onChange={(e) => setDispatchNow(e.target.checked)} />
                <span className="text-xs leading-relaxed">
                  <span className="block text-[13px] font-medium text-fg">Issue material now</span>
                  <span className="text-fg-muted">Records the full quantity as issued on the challan date. Untick to save a draft.</span>
                </span>
              </label>
            )}
            <Button type="submit" size="lg" className="w-full" loading={saving}>
              {editing ? "Save changes" : dispatchNow ? `Create ${L.job.toLowerCase()} & issue` : "Save as draft"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </Card>
      </aside>

      {/* Stock shortage: confirm with a reason, then resubmit */}
      <StockShortDialog
        short={short}
        reason={overrideReason}
        onReason={setOverrideReason}
        loading={saving}
        onCancel={() => setShort(null)}
        onConfirm={() => {
          setShort(null);
          submit(null, overrideReason.trim());
        }}
      />

      <ClientDialog open={dialog?.kind === "client"} onOpenChange={(o) => !o && setDialog(null)} initialName={dialog?.name} onSaved={(c) => setClientId(c.id)} />
      <ProductDialog open={dialog?.kind === "product"} onOpenChange={(o) => !o && setDialog(null)} initialName={dialog?.name} onSaved={(p) => setProductId(p.id)} />
      <JobWorkTypeDialog open={dialog?.kind === "type"} onOpenChange={(o) => !o && setDialog(null)} initialName={dialog?.name} onSaved={(t) => setJobWorkTypeId(t.id)} />
      <DesignDialog
        open={dialog?.kind === "design"}
        onOpenChange={(o) => !o && setDialog(null)}
        initialName={dialog?.name}
        onSaved={(d) => {
          if (dialog?.lineKey) pickDesign(dialog.lineKey, d);
        }}
      />
      <MaterialDialog
        open={dialog?.kind === "material"}
        onOpenChange={(o) => !o && setDialog(null)}
        initialName={dialog?.name}
        defaults={{ productId: productId || undefined, designId: lines.find((l) => l.key === dialog?.lineKey)?.designId || undefined }}
        onSaved={(m) => {
          if (dialog?.lineKey) pickMaterial(dialog.lineKey, m);
        }}
      />
    </form>
  );
}

function LineError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span role="alert" className="mt-1 block text-xs text-danger">
      {msg}
    </span>
  );
}

function StockShortDialog({
  short,
  reason,
  onReason,
  onCancel,
  onConfirm,
  loading,
}: {
  short: StockShort[] | null;
  reason: string;
  onReason: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const invalid = reason.trim().length < 3;
  return (
    <DialogShell
      open={!!short}
      onCancel={() => {
        setTouched(false);
        onCancel();
      }}
      onConfirm={() => {
        setTouched(true);
        if (!invalid) {
          setTouched(false);
          onConfirm();
        }
      }}
      loading={loading}
    >
      <ul className="mb-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {short?.map((s) => (
          <li key={s.materialId} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[13px]">
            <span className="min-w-0 truncate font-medium">{s.name}</span>
            <span className="num shrink-0 text-xs text-fg-muted">
              {formatQty(s.available)} in stock · issuing {formatQty(s.wanted)} {s.unit} ·{" "}
              <span className="font-semibold text-danger">
                {formatQty(roundQty(s.wanted - s.available))} short
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Field label="Reason to issue anyway" required error={touched && invalid ? "Add a short reason" : undefined} hint="Recorded in the challan history and audit log. Or record the stock received first.">
        <Textarea autoFocus value={reason} onChange={(e) => onReason(e.target.value)} placeholder="Stock arrived today, receipt not entered yet" />
      </Field>
    </DialogShell>
  );
}

function DialogShell({ open, onCancel, onConfirm, loading, children }: { open: boolean; onCancel: () => void; onConfirm: () => void; loading?: boolean; children: React.ReactNode }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title="Not enough stock in the warehouse"
      description="The material below is short. Issue anyway?"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Go back
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            Issue anyway
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
