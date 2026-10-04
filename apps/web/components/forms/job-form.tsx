"use client";

import { formatINR, formatQty, paiseToRupees, rupeesToPaise, todayISO, type Design, type JobDetail } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClientDialog, DesignDialog, ProductDialog } from "@/components/forms/master-dialogs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useClients, useDesigns, useProducts } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface Line {
  key: string;
  id?: string; // existing job item
  designId: string;
  quantity: string;
  rate: string;
  locked?: boolean; // sent pieces exist – can't remove
  minQty?: number;
}

let k = 0;
const newLine = (): Line => ({ key: `l${++k}`, designId: "", quantity: "", rate: "" });

export function JobForm({ job, defaultClientId }: { job?: JobDetail; defaultClientId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const clients = useClients();
  const products = useProducts();
  const designs = useDesigns();
  const editing = !!job;
  const started = !!job && job.status !== "DRAFT";

  const [clientId, setClientId] = useState(job?.client.id ?? defaultClientId ?? "");
  const [productId, setProductId] = useState(job?.product.id ?? "");
  const [jobDate, setJobDate] = useState(job ? job.jobDate.slice(0, 10) : todayISO());
  const [expected, setExpected] = useState(job?.expectedReturnDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(job?.notes ?? "");
  const [dispatchNow, setDispatchNow] = useState(true);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(
    job
      ? job.items.map((i) => ({ key: i.id, id: i.id, designId: i.designId, quantity: String(i.quantity), rate: String(paiseToRupees(i.ratePaise)), locked: started, minQty: i.initialSent }))
      : [newLine()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "client" | "product" | "design"; name: string; lineKey?: string } | null>(null);

  const designById = useMemo(() => new Map((designs.data ?? []).map((d) => [d.id, d])), [designs.data]);
  const designOptions = (designs.data ?? []).map((d) => ({ value: d.id, label: d.name, sub: `Usual rate ${formatINR(d.defaultRatePaise)}`, keywords: [d.code ?? ""] }));
  // Keep designs that are on this job even if they were deactivated later
  for (const it of job?.items ?? []) if (!designById.has(it.designId)) designOptions.push({ value: it.designId, label: it.designName, sub: "Inactive design", keywords: [] });

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickDesign = (key: string, d: Pick<Design, "id" | "defaultRatePaise">) => update(key, { designId: d.id, rate: String(paiseToRupees(d.defaultRatePaise)) });

  const totals = lines.reduce(
    (t, l) => {
      const q = Number(l.quantity) || 0;
      t.qty += q;
      t.amount += q * rupeesToPaise(l.rate || 0);
      return t;
    },
    { qty: 0, amount: 0 },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!clientId) errs.clientId = "Choose a client";
    if (!productId) errs.productId = "Choose a product";
    const filled = lines.filter((l) => l.designId || l.quantity);
    if (filled.length === 0) errs.items = "Add at least one design";
    filled.forEach((l) => {
      if (!l.designId) errs[`${l.key}.design`] = "Choose a design";
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q <= 0) errs[`${l.key}.qty`] = "Enter pieces";
      else if (l.minQty && q < l.minQty) errs[`${l.key}.qty`] = `At least ${l.minQty} (already sent)`;
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]);
      return;
    }
    const items = filled.map((l) => ({ id: l.id, designId: l.designId, quantity: Number(l.quantity), ratePaise: rupeesToPaise(l.rate || 0) }));
    setSaving(true);
    try {
      const body = { clientId, productId, jobDate, expectedReturnDate: expected || null, notes, items };
      const saved = editing
        ? await api.patch<JobDetail>(`/jobs/${job!.id}`, { ...body, reason })
        : await api.post<JobDetail>("/jobs", { ...body, items: items.map(({ id: _id, ...i }) => i), dispatchNow });
      qc.invalidateQueries();
      toast.success(editing ? "Job updated" : `${saved.jobNumber} created${dispatchNow ? ` · ${formatQty(saved.totals.sent)} pieces sent` : ""}`);
      router.push(`/jobs/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      toast.error(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  const product = products.data?.find((p) => p.id === productId);

  const clientName = clients.data?.find((c) => c.id === clientId)?.name;

  return (
    <form onSubmit={submit} className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-8">
        <FormSection title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" required error={errors.clientId}>
              <Combobox
                autoFocus={!editing && !defaultClientId}
                options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name, sub: c.businessName ?? c.phone, keywords: [c.phone ?? ""] }))}
                value={clientId}
                onChange={setClientId}
                placeholder="Who is doing the work?"
                invalid={!!errors.clientId}
                onCreate={(name) => setDialog({ kind: "client", name })}
                createLabel="New client"
              />
            </Field>
            <Field label="Product" required error={errors.productId}>
              <Combobox
                options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name, sub: p.code, keywords: [p.code ?? ""] }))}
                value={productId}
                onChange={setProductId}
                placeholder="What are you sending?"
                invalid={!!errors.productId}
                onCreate={(name) => setDialog({ kind: "product", name })}
                createLabel="New product"
              />
            </Field>
            <Field label="Job date" required>
              <Input type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} required />
            </Field>
            <Field label="Expected back by" hint="Optional. Used to flag overdue jobs.">
              <Input type="date" value={expected} min={jobDate} onChange={(e) => setExpected(e.target.value)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Designs" description="One line per design. Rate fills in from the design; you can change it.">
          {errors.items && (
            <p role="alert" className="mb-2 text-xs text-danger">
              {errors.items}
            </p>
          )}
          <Card className="overflow-hidden">
            <div className="hidden h-[34px] grid-cols-[minmax(0,1fr)_6rem_7rem_7rem_2rem] items-center gap-3 border-b border-border px-3 text-xs font-medium text-fg-muted sm:grid">
              <span>Design</span>
              <span className="text-right">Pieces</span>
              <span className="text-right">Rate / pc</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {lines.map((l, idx) => {
                const amount = (Number(l.quantity) || 0) * rupeesToPaise(l.rate || 0);
                return (
                  <li key={l.key} className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem_2rem] sm:items-start">
                    <div className="col-span-2 sm:col-span-1">
                      <span className="mb-1 block text-xs text-fg-muted sm:hidden">Design {idx + 1}</span>
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
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-fg-muted sm:hidden">Pieces</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={l.minQty || 1}
                        step={1}
                        value={l.quantity}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                        aria-invalid={!!errors[`${l.key}.qty`]}
                        className="num text-right"
                        placeholder="0"
                        aria-label="Pieces"
                      />
                      {errors[`${l.key}.qty`] && (
                        <span role="alert" className="mt-1 block text-xs text-danger">
                          {errors[`${l.key}.qty`]}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-fg-muted sm:hidden">Rate / pc</span>
                      <MoneyInput value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} className="text-right" placeholder="0" aria-label="Rate per piece" />
                    </div>
                    <div className="num flex h-8 items-center justify-end text-[13px] font-medium text-fg max-sm:justify-start pointer-coarse:h-10">
                      <span className="mr-2 text-xs font-normal text-fg-muted sm:hidden">Amount</span>
                      {formatINR(amount)}
                    </div>
                    <div className="flex h-8 items-center justify-end pointer-coarse:h-10">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-fg-faint hover:bg-danger-subtle hover:text-danger"
                        disabled={l.locked || lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        aria-label="Remove line"
                        title={l.locked ? "Material already sent for this line" : "Remove"}
                      >
                        <Trash2 className="!size-3.5" />
                      </Button>
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
            <div className="grid grid-cols-2 items-center gap-3 border-t border-border-strong bg-surface-2/50 px-3 py-2.5 text-[13px] font-semibold sm:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem_2rem]">
              <div>Total</div>
              <div className="num text-right">{formatQty(totals.qty)}</div>
              <div className="hidden sm:block" />
              <div className="num text-right max-sm:col-span-2 max-sm:text-left">{formatINR(totals.amount)}</div>
            </div>
          </Card>
        </FormSection>

        <FormSection title="Notes">
          <div className="space-y-4">
            <Field label="Notes" hint="Anything to remember about this job">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {started && (
              <Field label="Reason for change" hint="Quantity and rate changes are recorded in the job history.">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client agreed to a new rate" />
              </Field>
            )}
          </div>
        </FormSection>
      </div>

      {/* Summary rail */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Card>
          <div className="border-b border-border px-4 py-3">
            <div className="num text-xs text-fg-muted">{editing ? job!.jobNumber : "New job"}</div>
            <div className={cn("mt-0.5 truncate text-[13px] font-medium", !clientName && "text-fg-faint")}>{clientName ?? "No client yet"}</div>
            <div className={cn("truncate text-xs", product ? "text-fg-muted" : "text-fg-faint")}>{product?.name ?? "No product yet"}</div>
          </div>
          <dl className="space-y-2 px-4 py-3 text-[13px]">
            <div className="flex items-baseline justify-between">
              <dt className="text-fg-muted">Pieces</dt>
              <dd className="num font-medium">{formatQty(totals.qty)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-fg-muted">Work value</dt>
              <dd className="num text-[15px] font-semibold">{formatINR(totals.amount)}</dd>
            </div>
          </dl>
          <div className="space-y-2 border-t border-border p-3">
            {!editing && (
              <label className="flex cursor-pointer gap-2.5 rounded-md px-1 py-1.5">
                <input type="checkbox" className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent-solid)]" checked={dispatchNow} onChange={(e) => setDispatchNow(e.target.checked)} />
                <span className="text-xs leading-relaxed">
                  <span className="block text-[13px] font-medium text-fg">Material sent today</span>
                  <span className="text-fg-muted">Marks all {totals.qty ? formatQty(totals.qty) : ""} pieces as sent on the job date. Untick to save a draft.</span>
                </span>
              </label>
            )}
            <Button type="submit" size="lg" className="w-full" loading={saving}>
              {editing ? "Save changes" : dispatchNow ? "Create job & send" : "Save as draft"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </Card>
      </aside>

      <ClientDialog open={dialog?.kind === "client"} onOpenChange={(o) => !o && setDialog(null)} initialName={dialog?.name} onSaved={(c) => setClientId(c.id)} />
      <ProductDialog open={dialog?.kind === "product"} onOpenChange={(o) => !o && setDialog(null)} initialName={dialog?.name} onSaved={(p) => setProductId(p.id)} />
      <DesignDialog
        open={dialog?.kind === "design"}
        onOpenChange={(o) => !o && setDialog(null)}
        initialName={dialog?.name}
        onSaved={(d) => {
          if (dialog?.lineKey) pickDesign(dialog.lineKey, d);
        }}
      />
    </form>
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
