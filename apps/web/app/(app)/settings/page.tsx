"use client";

import { BILLING_POLICIES, BILLING_POLICY_LABEL, type BillingPolicy, type Settings } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

const policyHelp: Record<BillingPolicy, string> = {
  AFTER_EACH_RETURN: "After every return we offer to bill the pieces that just came back.",
  ON_COMPLETION: "We offer to bill once all pieces of a job are back.",
  MANUAL: "We keep a running “ready to bill” amount. You create invoices whenever you like.",
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const s = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (s.data) setForm(s.data);
  }, [s.data]);
  const save = useMutation({
    mutationFn: (body: Settings) => api.put<Settings>("/settings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e.message),
  });
  if (!form)
    return (
      <>
        <PageHeader title="Settings" />
        <Card className="overflow-hidden">
          <LoadingBlock />
        </Card>
      </>
    );
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(form);
      }}
      className="max-w-4xl"
    >
      <PageHeader
        title="Settings"
        actions={
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        }
      />
      <div className="divide-y divide-border border-t border-border">
        <SettingsGroup title="Billing" description="How you usually raise invoices. You can always bill manually too.">
          <div role="radiogroup" aria-label="Billing policy" className="overflow-hidden rounded-lg border border-border bg-surface">
            {BILLING_POLICIES.map((p, i) => (
              <label
                key={p}
                className={cn("flex cursor-pointer gap-3 px-4 py-3 transition-colors duration-100", i > 0 && "border-t border-border", form.billingPolicy === p ? "bg-accent-subtle" : "hover:bg-surface-2")}
              >
                <input type="radio" name="policy" className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent-solid)]" checked={form.billingPolicy === p} onChange={() => setForm({ ...form, billingPolicy: p })} />
                <span>
                  <span className="block text-[13px] font-medium">{BILLING_POLICY_LABEL[p]}</span>
                  <span className="text-xs text-fg-muted">{policyHelp[p]}</span>
                </span>
              </label>
            ))}
          </div>
        </SettingsGroup>
        <SettingsGroup title="Invoice details" description="Printed at the top of every invoice.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" required className="sm:col-span-2">
              <Input value={form.businessName} onChange={set("businessName")} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Textarea rows={2} value={form.address ?? ""} onChange={set("address")} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={set("phone")} />
            </Field>
            <Field label="Email">
              <Input value={form.email ?? ""} onChange={set("email")} />
            </Field>
            <Field label="GSTIN">
              <Input value={form.gstin ?? ""} onChange={set("gstin")} className="num uppercase" />
            </Field>
            <Field label="Default tax %" hint="Pre-filled on new invoices. 0 for none.">
              <Input type="number" min={0} max={100} step="0.01" value={form.defaultTaxPercent} onChange={set("defaultTaxPercent")} className="num" />
            </Field>
            <Field label="Invoice footer" className="sm:col-span-2" hint="Bank details or a thank-you note">
              <Textarea rows={2} value={form.invoiceFooter ?? ""} onChange={set("invoiceFooter")} />
            </Field>
          </div>
        </SettingsGroup>
      </div>
    </form>
  );
}

function SettingsGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 py-8 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
