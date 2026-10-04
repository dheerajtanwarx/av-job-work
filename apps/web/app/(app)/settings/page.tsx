"use client";

import { BILLING_POLICIES, BILLING_POLICY_LABEL, type BillingPolicy, type Settings } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
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
  if (!form) return <LoadingBlock />;
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(form);
      }}
      className="max-w-3xl space-y-5"
    >
      <PageHeader eyebrow="Setup" title="Settings" />
      <Card>
        <CardHeader title="When do you bill?" description="Choose how you usually raise invoices. You can always bill manually too." />
        <div className="grid gap-2 px-5 pb-5">
          {BILLING_POLICIES.map((p) => (
            <label key={p} className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", form.billingPolicy === p ? "border-indigo bg-indigo-50" : "border-line hover:bg-paper")}>
              <input type="radio" name="policy" className="mt-1 size-4 accent-indigo" checked={form.billingPolicy === p} onChange={() => setForm({ ...form, billingPolicy: p })} />
              <span>
                <span className="block font-semibold">{BILLING_POLICY_LABEL[p]}</span>
                <span className="text-sm text-muted">{policyHelp[p]}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Invoice details" description="Printed at the top of every invoice." />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Business name" required className="sm:col-span-2"><Input value={form.businessName} onChange={set("businessName")} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={form.address ?? ""} onChange={set("address")} /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={set("phone")} /></Field>
          <Field label="Email"><Input value={form.email ?? ""} onChange={set("email")} /></Field>
          <Field label="GSTIN"><Input value={form.gstin ?? ""} onChange={set("gstin")} className="uppercase" /></Field>
          <Field label="Default tax %" hint="Pre-filled on new invoices. 0 for none."><Input type="number" min={0} max={100} step="0.01" value={form.defaultTaxPercent} onChange={set("defaultTaxPercent")} /></Field>
          <Field label="Invoice footer" className="sm:col-span-2" hint="e.g. bank details or thank-you note"><Textarea rows={2} value={form.invoiceFooter ?? ""} onChange={set("invoiceFooter")} /></Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={save.isPending}>Save settings</Button>
      </div>
    </form>
  );
}
