"use client";

import { BILLING_POLICIES, BILLING_POLICY_LABEL, MAX_LOGO_CHARS, type BillingPolicy, type Settings } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

const policyHelp: Record<BillingPolicy, string> = {
  AFTER_EACH_RETURN: "After every return we offer to pay for the pieces that just came back.",
  IMMEDIATE: "Payment is due the day work comes back.",
  DAYS_AFTER_RETURN: "Payment is due a set number of days after each return.",
  AFTER_COMPLETION: "We offer to pay once all pieces of a job are back.",
  MANUAL: "We keep a running “to pay” amount. You record sub bills whenever you pay.",
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
  const set = (k: "businessName" | "address" | "phone" | "email") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

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
        <SettingsGroup title="Paying job workers" description="When you usually pay for returned work. You can always record a sub bill manually too.">
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
        <SettingsGroup title="Business details" description="Printed at the top of every sub bill and main bill.">
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
          </div>
        </SettingsGroup>
        <SettingsGroup title="Logo" description="Shown on printed bills and at the top of every bill email. PNG or JPEG, under 200 KB.">
          <LogoPicker value={form.logo} onChange={(logo) => setForm({ ...form, logo })} />
        </SettingsGroup>
        <SettingsGroup title="Bill emails" description="Job workers need an email address on their profile to receive bills.">
          <label className="flex cursor-pointer gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <input
              type="checkbox"
              className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent-solid)]"
              checked={form.emailBills}
              onChange={(e) => setForm({ ...form, emailBills: e.target.checked })}
            />
            <span>
              <span className="block text-[13px] font-medium">Email each new sub bill to the job worker</span>
              <span className="text-xs text-fg-muted">A detailed payment voucher with your logo. When a payment settles a job, the main bill is included too.</span>
            </span>
          </label>
        </SettingsGroup>
      </div>
    </form>
  );
}

function LogoPicker({ value, onChange }: { value: string | null; onChange: (logo: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return toast.error("Please choose a PNG or JPEG image");
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (url.length > MAX_LOGO_CHARS) return toast.error("Logo must be smaller than 200 KB");
      onChange(url);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface">
        {value ? <img src={value} alt="Business logo" className="max-h-full max-w-full object-contain" /> : <ImageUp className="size-5 text-fg-faint" aria-hidden />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
          {value ? "Change logo" : "Upload logo"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            <Trash2 /> Remove
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
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
