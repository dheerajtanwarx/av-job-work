"use client";

import {
  L,
  MAX_LOGO_CHARS,
  NOTIFY_CHANNEL_LABEL,
  NOTIFY_KIND_LABEL,
  PAYMENT_POLICIES,
  PAYMENT_POLICY_LABEL,
  type NotificationLogRow,
  type NotifyChannel,
  type PaymentPolicy,
  type Settings,
} from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Inbox, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NotificationStatusBadge, formatDateTime } from "@/components/billing/notification-status";
import { Button } from "@/components/ui/button";
import { Card, MobileList, MobileListItem, TableWrap } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { api, qs } from "@/lib/api";
import { useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

const policyHelp: Record<PaymentPolicy, string> = {
  IMMEDIATE: "Payment is due the day work comes back.",
  AFTER_EACH_RETURN: "Each return is paid for separately, within the days below (0 = same day).",
  DAYS_AFTER_RETURN: "Payment for each return is due a set number of days after it is received.",
  AFTER_COMPLETION: "Payment is due once the whole challan is back, within the days below.",
  MANUAL: "No due date. Keep a running balance and record payment vouchers whenever you pay.",
};
const NEEDS_DAYS: PaymentPolicy[] = ["DAYS_AFTER_RETURN", "AFTER_EACH_RETURN", "AFTER_COMPLETION"];

type SettingsBody = Pick<
  Settings,
  "businessName" | "address" | "phone" | "email" | "logo" | "emailBills" | "defaultPaymentPolicy" | "defaultPaymentDays" | "payDamagedDefault" | "payRejectedDefault" | "payLostDefault"
>;

const toBody = (f: Settings): SettingsBody => ({
  businessName: f.businessName,
  address: f.address,
  phone: f.phone,
  email: f.email,
  logo: f.logo,
  emailBills: f.emailBills,
  defaultPaymentPolicy: f.defaultPaymentPolicy,
  defaultPaymentDays: NEEDS_DAYS.includes(f.defaultPaymentPolicy) ? f.defaultPaymentDays : 0,
  payDamagedDefault: f.payDamagedDefault,
  payRejectedDefault: f.payRejectedDefault,
  payLostDefault: f.payLostDefault,
});

export default function SettingsPage() {
  const qc = useQueryClient();
  const s = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (s.data) setForm(s.data);
  }, [s.data]);
  const save = useMutation({
    mutationFn: (body: SettingsBody) => api.put<Settings>("/settings", body),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e.message),
  });
  if (s.isError) return <ErrorBlock error={s.error} onRetry={() => s.refetch()} />;
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
  const toggle = (k: "payDamagedDefault" | "payRejectedDefault" | "payLostDefault" | "emailBills") => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.checked });

  return (
    <div className="max-w-4xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(toBody(form));
        }}
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
          <SettingsGroup title="Business details" description={`Printed at the top of every ${L.jobFull.toLowerCase()}, ${L.subBill.toLowerCase()} and ${L.mainBill.toLowerCase()}.`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name" required className="sm:col-span-2">
                <Input value={form.businessName} onChange={set("businessName")} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea rows={2} value={form.address ?? ""} onChange={set("address")} />
              </Field>
              <Field label="Phone">
                <Input type="tel" inputMode="tel" value={form.phone ?? ""} onChange={set("phone")} />
              </Field>
              <Field label="Email">
                <Input type="email" inputMode="email" value={form.email ?? ""} onChange={set("email")} />
              </Field>
            </div>
          </SettingsGroup>
          <SettingsGroup title="Logo" description="Shown on printed vouchers, the QR challan view and every voucher email. PNG or JPEG, under 200 KB.">
            <LogoPicker value={form.logo} onChange={(logo) => setForm({ ...form, logo })} />
          </SettingsGroup>
          <SettingsGroup title="Default payment terms" description={`Used for ${L.clients.toLowerCase()} and ${L.jobs.toLowerCase()} without their own terms. Drives due dates and overdue payments.`}>
            <div role="radiogroup" aria-label="Default payment terms" className="overflow-hidden rounded-lg border border-border bg-surface">
              {PAYMENT_POLICIES.map((p, i) => (
                <label
                  key={p}
                  className={cn(
                    "flex min-h-12 cursor-pointer gap-3 px-4 py-3 transition-colors duration-100",
                    i > 0 && "border-t border-border",
                    form.defaultPaymentPolicy === p ? "bg-accent-subtle" : "hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="policy"
                    className="mt-0.5 size-4 shrink-0 accent-[var(--accent-solid)]"
                    checked={form.defaultPaymentPolicy === p}
                    onChange={() => setForm({ ...form, defaultPaymentPolicy: p })}
                  />
                  <span>
                    <span className="block text-[13px] font-medium">{PAYMENT_POLICY_LABEL[p]}</span>
                    <span className="text-xs text-fg-muted">{policyHelp[p]}</span>
                  </span>
                </label>
              ))}
            </div>
            {NEEDS_DAYS.includes(form.defaultPaymentPolicy) && (
              <Field label="Payment due within (days)" hint="0 means the same day." className="mt-4 max-w-48">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  step={1}
                  value={String(form.defaultPaymentDays)}
                  onChange={(e) => setForm({ ...form, defaultPaymentDays: Math.max(0, Math.min(365, Math.trunc(Number(e.target.value) || 0))) })}
                />
              </Field>
            )}
          </SettingsGroup>
          <SettingsGroup title="Payable by default" description="Whether non-good quantities on a return are paid for. Each return can override this (with a reason).">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {(
                [
                  ["payDamagedDefault", "Pay for damaged quantity", "Work was done but the piece came back damaged."],
                  ["payRejectedDefault", "Pay for rejected quantity", "Work did not meet quality and was rejected."],
                  ["payLostDefault", "Pay for lost quantity", "Material the job worker could not return."],
                ] as const
              ).map(([k, label, help], i) => (
                <label key={k} className={cn("flex min-h-12 cursor-pointer gap-3 px-4 py-3", i > 0 && "border-t border-border")}>
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent-solid)]" checked={form[k]} onChange={toggle(k)} />
                  <span>
                    <span className="block text-[13px] font-medium">{label}</span>
                    <span className="text-xs text-fg-muted">{help}</span>
                  </span>
                </label>
              ))}
            </div>
          </SettingsGroup>
          <SettingsGroup title="Voucher emails" description={`${L.clients} need an email address on their profile. Saving a payment never depends on email.`}>
            <label className="flex min-h-12 cursor-pointer gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent-solid)]" checked={form.emailBills} onChange={toggle("emailBills")} />
              <span>
                <span className="block text-[13px] font-medium">Email each new {L.subBill.toLowerCase()} to the {L.client.toLowerCase()} automatically</span>
                <span className="text-xs text-fg-muted">
                  Sent once per voucher, with your logo and the challan balance. When a payment settles a challan, the {L.mainBill.toLowerCase()} is included. You can always resend from the voucher.
                </span>
              </span>
            </label>
          </SettingsGroup>
        </div>
      </form>
      <div className="border-t border-border py-8">
        <NotificationLogSection />
      </div>
    </div>
  );
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Not sent" },
  { value: "sent", label: "Sent" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function NotificationLogSection() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const q = useQuery({
    queryKey: ["notifications", status],
    queryFn: () => api.get<NotificationLogRow[]>(`/notifications${qs({ status: status === "all" ? undefined : status, take: 100 })}`),
  });
  const channel = (c: string) => NOTIFY_CHANNEL_LABEL[c as NotifyChannel] ?? c;
  const what = (n: NotificationLogRow) => `${NOTIFY_KIND_LABEL[n.kind] ?? n.kind}${n.ref ? ` ${n.ref}` : ""}`;
  const ref = (n: NotificationLogRow) =>
    n.href ? (
      <Link href={n.href} className="font-medium hover:text-accent" onClick={(e) => e.stopPropagation()}>
        {what(n)}
      </Link>
    ) : (
      <span className="font-medium">{what(n)}</span>
    );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold">Notification log</h2>
          <p className="mt-0.5 text-xs text-fg-muted">Every email, WhatsApp and SMS attempt, newest first. Failures show the error from the mail server.</p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented label="Filter by status" value={status} onChange={setStatus} options={[...STATUS_FILTERS]} />
          <Button variant="ghost" size="icon" title="Refresh" aria-label="Refresh" onClick={() => q.refetch()}>
            <RefreshCw className={cn(q.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <LoadingBlock rows={4} />
        ) : q.isError ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState icon={Inbox} title={status === "all" ? "Nothing sent yet" : "No matching notifications"}>
            Voucher emails will be listed here.
          </EmptyState>
        ) : (
          <>
            <TableWrap className="max-sm:hidden">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Status</th>
                    <th>Channel</th>
                    <th>Record</th>
                    <th>To</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((n) => (
                    <tr key={n.id}>
                      <td className="num whitespace-nowrap text-fg-2">{formatDateTime(n.createdAt)}</td>
                      <td>
                        <NotificationStatusBadge status={n.status} />
                      </td>
                      <td className="whitespace-nowrap">
                        {channel(n.channel)}
                        <div className="text-xs text-fg-muted">{n.auto ? "Automatic" : `Manual${n.user ? ` · ${n.user}` : ""}`}</div>
                      </td>
                      <td className="whitespace-nowrap">{ref(n)}</td>
                      <td className="max-w-48 truncate">{n.recipient ?? <span className="text-fg-faint">—</span>}</td>
                      <td className="max-w-72 text-xs break-words whitespace-normal text-fg-muted">{n.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <MobileList className="sm:hidden">
              {q.data.map((n) => (
                <MobileListItem key={n.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px]">{ref(n)}</span>
                    <NotificationStatusBadge status={n.status} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-fg-muted">
                    {channel(n.channel)} · {n.recipient ?? "no recipient"} · {formatDateTime(n.createdAt)}
                  </div>
                  {n.error && <div className="mt-1 text-xs break-words text-fg-2">{n.error}</div>}
                </MobileListItem>
              ))}
            </MobileList>
          </>
        )}
      </Card>
    </section>
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
