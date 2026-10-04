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

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5">
        <Card className="p-5">
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
            <Field label="Expected back by" hint="Optional – used to flag overdue jobs">
              <Input type="date" value={expected} min={jobDate} onChange={(e) => setExpected(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div>
              <h2 className="font-display text-lg font-semibold">Designs & quantities</h2>
              <p className="text-sm text-muted">One line per design. The rate fills in automatically, but you can change it.</p>
            </div>
          </div>
          {errors.items && <p className="px-5 text-sm text-madder">{errors.items}</p>}
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem_7.5rem_2.5rem] gap-3 border-b border-line px-5 pb-2 text-xs font-semibold tracking-wide text-muted uppercase sm:grid">
            <span>Design</span>
            <span className="text-right">Pieces</span>
            <span className="text-right">Rate / pc</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {lines.map((l, idx) => {
              const amount = (Number(l.quantity) || 0) * rupeesToPaise(l.rate || 0);
              return (
                <li key={l.key} className="grid grid-cols-2 gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_7.5rem_2.5rem] sm:items-start">
                  <div className="col-span-2 sm:col-span-1">
                    <span className="mb-1 block text-xs font-semibold text-muted sm:hidden">Design {idx + 1}</span>
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
                    <span className="mb-1 block text-xs font-semibold text-muted sm:hidden">Pieces</span>
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
                    {errors[`${l.key}.qty`] && <span className="mt-1 block text-xs text-madder">{errors[`${l.key}.qty`]}</span>}
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-muted sm:hidden">Rate / pc</span>
                    <MoneyInput value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} className="text-right" placeholder="0" aria-label="Rate per piece" />
                  </div>
                  <div className="num flex h-10 items-center justify-end font-semibold text-ink max-sm:col-span-1 max-sm:justify-start">
                    <span className="mr-2 text-xs font-normal text-muted sm:hidden">Amount</span>
                    {formatINR(amount)}
                  </div>
                  <div className="flex h-10 items-center justify-end max-sm:col-span-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="danger-ghost"
                      disabled={l.locked || lines.length === 1}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      aria-label="Remove line"
                      title={l.locked ? "Material already sent for this line" : "Remove"}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])}>
              <Plus /> Add another design
            </Button>
          </div>
          <div className="stitch mx-5" />
          <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_7.5rem_2.5rem]">
            <div className="font-display text-lg font-semibold">Total</div>
            <div className="num text-right font-display text-lg font-semibold">{formatQty(totals.qty)}</div>
            <div className="hidden sm:block" />
            <div className="num text-right font-display text-lg font-semibold max-sm:col-span-2">{formatINR(totals.amount)}</div>
          </div>
        </Card>

        <Card className="p-5">
          <Field label="Notes" hint="Anything to remember about this job">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {started && (
            <Field label="Reason for change" className="mt-4" hint="Changes to quantity or rate are recorded in the job history.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client agreed to a new rate" />
            </Field>
          )}
        </Card>
      </div>

      {/* Summary rail */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card className="overflow-hidden">
          <div className="bg-indigo px-5 py-4 text-white">
            <div className="text-xs font-semibold tracking-[0.12em] text-white/60 uppercase">{editing ? job!.jobNumber : "New job"}</div>
            <div className="mt-1 font-display text-lg font-semibold">{clients.data?.find((c) => c.id === clientId)?.name ?? "Choose a client"}</div>
            <div className="text-sm text-white/70">{product?.name ?? "Choose a product"}</div>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-muted">Pieces</span>
              <span className="num font-display text-2xl font-semibold">{formatQty(totals.qty)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted">Work value</span>
              <span className="num font-display text-2xl font-semibold text-indigo">{formatINR(totals.amount)}</span>
            </div>
            <div className="stitch" />
            {!editing && (
              <label className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", dispatchNow ? "border-indigo/30 bg-indigo-50" : "border-line")}>
                <input type="checkbox" className="mt-0.5 size-4 accent-indigo" checked={dispatchNow} onChange={(e) => setDispatchNow(e.target.checked)} />
                <span className="text-sm">
                  <span className="block font-semibold text-ink">Material sent today</span>
                  <span className="text-muted">Mark all {totals.qty ? formatQty(totals.qty) : ""} pieces as sent on the job date. Untick to save as a draft and send later.</span>
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
      </div>

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
