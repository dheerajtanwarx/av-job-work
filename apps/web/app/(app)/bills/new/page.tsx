"use client";

import { amountInWords, formatDate, formatINR, L, PAYMENT_METHOD_LABEL, PAYMENT_POLICY_LABEL, todayISO, type PaymentMethod, type SubBillWithEmail } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MethodChips } from "@/components/returns/method-chips";
import { PayStatusPill } from "@/components/returns/status";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";
import { useClients } from "@/lib/queries";
import { formatTime, newIdempotencyKey, paiseToInput, rupeesInput, useJob, useJobsFor } from "@/lib/returns";
import { cn } from "@/lib/utils";

function NewPayment() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const clients = useClients(false);
  const [clientId, setClientId] = useState(params.get("clientId") ?? "");
  const [jobId, setJobId] = useState(params.get("jobId") ?? "");
  const [returnId, setReturnId] = useState(params.get("returnId") ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [needsAdvance, setNeedsAdvance] = useState(false);
  const [touched, setTouched] = useState(false);
  const [idemKey] = useState(newIdempotencyKey);
  const prefilledFor = useRef("");

  const jobs = useJobsFor(clientId);
  const job = useJob(jobId);

  // Arriving with only a challan: fill in its worker.
  useEffect(() => {
    if (!clientId && job.data) setClientId(job.data.client.id);
  }, [clientId, job.data]);

  const jobList = useMemo(
    () =>
      (jobs.data ?? [])
        .filter((j) => j.status !== "DRAFT" && (j.status !== "CANCELLED" || j.money.valuePaise > 0))
        .sort((a, b) => b.money.outstandingPaise - a.money.outstandingPaise || b.jobDate.localeCompare(a.jobDate)),
    [jobs.data],
  );
  // Only one challan with something to pay: pick it.
  useEffect(() => {
    if (!jobs.data || jobId) return;
    const owing = jobList.filter((j) => j.money.outstandingPaise > 0);
    if (owing.length === 1) setJobId(owing[0].id);
  }, [jobs.data, jobList, jobId]);

  const returns = useMemo(() => (job.data?.returns ?? []).filter((r) => !r.voidedAt), [job.data]);
  const selectedReturn = returns.find((r) => r.id === returnId) ?? null;
  const money = job.data?.money;

  // Prefill the amount with what is outstanding on the chosen return (or the whole challan), once per choice.
  useEffect(() => {
    if (!job.data || job.data.id !== jobId) return;
    const key = `${jobId}|${returnId}`;
    if (prefilledFor.current === key) return;
    prefilledFor.current = key;
    const out = selectedReturn?.payment?.outstandingPaise ?? job.data.money.outstandingPaise;
    setAmount(out > 0 ? paiseToInput(out) : "");
    setNeedsAdvance(false);
  }, [job.data, jobId, returnId, selectedReturn]);

  const amountPaise = rupeesInput(amount);
  const validAmount = amountPaise > 0;
  const overOutstanding = money ? validAmount && amountPaise > money.outstandingPaise : false;

  const create = useMutation({
    mutationFn: () =>
      api.post<SubBillWithEmail & { duplicate?: boolean }>("/sub-bills", {
        jobId,
        returnId: returnId || null,
        date,
        amountPaise,
        method,
        reference: reference || null,
        notes: notes || null,
        advanceReason: advanceReason.trim() || null,
        idempotencyKey: idemKey,
      }),
    onSuccess: (b) => {
      qc.invalidateQueries({ refetchType: "none" });
      if (b.duplicate) toast.info(`${b.billNumber} was already recorded. Showing it.`);
      else {
        toast.success(
          b.mainBill && !b.mainBill.cancelled
            ? `${b.billNumber} saved. ${b.job.jobNumber} is fully paid: ${L.mainBill} ${b.mainBill.billNumber} issued.`
            : `${b.billNumber} saved: ${formatINR(b.amountPaise)} paid to ${b.client.name}`,
          b.email.status === "sent" ? { description: b.email.message } : undefined,
        );
        if (b.email.status === "failed" || (b.email.status === "skipped" && b.business.emailBills)) toast.warning(`${L.subBill} not emailed. ${b.email.message}`);
      }
      router.push(`/bills/sub/${b.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422 && (e.body.details as { needsAdvanceReason?: boolean } | undefined)?.needsAdvanceReason) {
        setNeedsAdvance(true);
        setTouched(true);
      }
      toast.error(e.message);
    },
  });

  const submit = () => {
    setTouched(true);
    if (!jobId) return toast.error("Choose a challan");
    if (!validAmount) return toast.error("Enter the amount paid");
    if ((needsAdvance || overOutstanding) && !advanceReason.trim()) {
      setNeedsAdvance(true);
      return toast.error("Paying more than is due: give a reason for the advance");
    }
    create.mutate();
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/bills" className="hover:text-fg">
            Payments
          </Link>
        }
        title={`New ${L.subBill}`}
        subtitle="Record any amount paid to a job worker: full, part, or an advance."
      />
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={L.client}>
              <Combobox
                options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name, sub: [c.workerCode, c.businessName].filter(Boolean).join(" · "), keywords: [c.workerCode, c.phone ?? ""] }))}
                value={clientId}
                onChange={(id) => {
                  setClientId(id);
                  setJobId("");
                  setReturnId("");
                }}
                placeholder={clients.isPending ? "Loading…" : "Choose job worker"}
              />
            </Field>
            <Field label={L.job} hint={clientId && jobList.length ? `${jobList.filter((j) => j.money.outstandingPaise > 0).length} with money outstanding` : undefined}>
              <Combobox
                options={jobList.map((j) => ({
                  value: j.id,
                  label: `${j.jobNumber} · ${j.product.name}`,
                  sub: `Value ${formatINR(j.money.valuePaise)} · paid ${formatINR(j.money.paidPaise)} · ${formatINR(j.money.outstandingPaise)} outstanding`,
                  keywords: j.designs,
                }))}
                value={jobId}
                onChange={(id) => {
                  setJobId(id);
                  setReturnId("");
                }}
                placeholder={!clientId ? "Choose a job worker first" : jobs.isPending ? "Loading…" : jobList.length ? "Choose challan" : "No challans"}
              />
            </Field>
          </div>

          {!jobId ? (
            <Card>
              <EmptyState icon={ReceiptText} title={clientId ? "Choose a challan" : "Choose a job worker"}>
                You&apos;ll see the work value, what is paid and what is outstanding for each return.
              </EmptyState>
            </Card>
          ) : job.isPending ? (
            <Card className="overflow-hidden">
              <LoadingBlock rows={4} />
            </Card>
          ) : job.isError ? (
            <ErrorBlock error={job.error} onRetry={() => job.refetch()} />
          ) : (
            <>
              <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
                {[
                  { label: "Work value", value: formatINR(job.data.money.valuePaise) },
                  { label: "Paid", value: formatINR(job.data.money.paidPaise), cls: "text-success" },
                  {
                    label: job.data.money.advancePaise > 0 ? "Advance" : "Outstanding",
                    value: formatINR(job.data.money.advancePaise > 0 ? job.data.money.advancePaise : job.data.money.outstandingPaise),
                    cls: job.data.money.outstandingPaise > 0 ? "text-orange-700 dark:text-orange-300" : "",
                  },
                  { label: "Terms", value: PAYMENT_POLICY_LABEL[job.data.terms.policy], sub: job.data.terms.days ? `${job.data.terms.days} days` : undefined, cls: "text-[14px]" },
                ].map((m) => (
                  <div key={m.label} className="bg-surface px-4 py-3">
                    <div className="text-xs text-fg-muted">{m.label}</div>
                    <div className={cn("num mt-1 text-lg leading-6 font-semibold", m.cls)}>{m.value}</div>
                    {m.sub && <div className="text-xs text-fg-muted">{m.sub}</div>}
                  </div>
                ))}
              </Card>

              <Section title="Link to a return" description="Optional. Unlinked payments clear the oldest unpaid return first.">
                <Card className="overflow-hidden">
                  <div role="radiogroup" aria-label="Return" className="divide-y divide-border">
                    <ReturnOption checked={!returnId} onSelect={() => setReturnId("")} title="Not linked to a return" sub={`Whole ${L.job.toLowerCase()}: ${formatINR(job.data.money.outstandingPaise)} outstanding`} />
                    {returns.length === 0 && <div className="px-4 py-3 text-[13px] text-fg-muted">No returns recorded on this challan yet. A payment now is an advance.</div>}
                    {[...returns].reverse().map((r) => (
                      <ReturnOption
                        key={r.id}
                        checked={returnId === r.id}
                        onSelect={() => setReturnId(r.id)}
                        title={
                          <span className="num">
                            {r.returnNumber} · {formatDate(r.date)}, {formatTime(r.receivedAt)}
                          </span>
                        }
                        sub={
                          r.payment
                            ? `Value ${formatINR(r.payment.valuePaise)} · paid ${formatINR(r.payment.paidPaise)} · ${formatINR(r.payment.outstandingPaise)} outstanding${
                                r.payment.outstandingPaise > 0 ? (r.payment.overdueDays > 0 ? ` · overdue ${r.payment.overdueDays} days` : r.payment.dueDate ? ` · due ${formatDate(r.payment.dueDate)}` : "") : ""
                              }`
                            : formatINR(r.valuePaise)
                        }
                        pill={<PayStatusPill payment={r.payment} />}
                      />
                    ))}
                  </div>
                </Card>
              </Section>

              <div className="space-y-4">
                <Field label="Amount paid" required error={touched && !validAmount ? "Enter the amount" : undefined} hint={selectedReturn ? `Prefilled with what is outstanding on ${selectedReturn.returnNumber}` : "Prefilled with what is outstanding on the challan"}>
                  <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg font-semibold pointer-coarse:h-12" placeholder="0" />
                </Field>
                {(needsAdvance || overOutstanding) && validAmount && (
                  <div className="rounded-md border border-warning/30 bg-warning-subtle p-3">
                    <div className="num flex items-center gap-1.5 text-[13px] font-medium">
                      <AlertTriangle className="size-4 shrink-0 text-warning" />
                      {money ? `${formatINR(Math.max(0, amountPaise - money.outstandingPaise))} more than is outstanding will be recorded as an advance.` : "This is more than is outstanding."}
                    </div>
                    <Input
                      className="mt-2"
                      value={advanceReason}
                      onChange={(e) => setAdvanceReason(e.target.value)}
                      placeholder="Reason for the advance (required)"
                      aria-label="Advance reason"
                      aria-invalid={(touched && !advanceReason.trim()) || undefined}
                    />
                  </div>
                )}
                <MethodChips value={method} onChange={setMethod} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Payment date">
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
                  </Field>
                  <Field label="Reference" hint="Optional">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." />
                  </Field>
                </div>
                <Field label="Notes" hint="Optional">
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card>
            <dl className="space-y-1.5 px-4 py-3 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{L.job}</dt>
                <dd className="font-medium">{job.data?.jobNumber ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Return</dt>
                <dd className="font-medium">{selectedReturn?.returnNumber ?? "Not linked"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Paid by</dt>
                <dd className="font-medium">{PAYMENT_METHOD_LABEL[method]}</dd>
              </div>
            </dl>
            <div className="border-t border-border px-4 py-3">
              <div className="text-xs text-fg-muted">Amount paid</div>
              <div className="num mt-0.5 text-2xl leading-8 font-semibold tracking-[-0.01em]">{formatINR(validAmount ? amountPaise : 0)}</div>
              {validAmount && <div className="mt-1 text-xs leading-snug text-fg-muted italic">{amountInWords(amountPaise)}</div>}
            </div>
            <div className="border-t border-border p-3">
              <Button size="lg" className="h-11 w-full" disabled={!jobId} loading={create.isPending} onClick={submit}>
                Save {L.subBill.toLowerCase()}
              </Button>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function ReturnOption({ checked, onSelect, title, sub, pill }: { checked: boolean; onSelect: () => void; title: React.ReactNode; sub: string; pill?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2", checked && "bg-accent-subtle")}>
      <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-accent" : "border-border-strong")}>{checked && <span className="size-2 rounded-full bg-accent" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="num block text-xs text-fg-muted">{sub}</span>
      </span>
      {pill}
    </button>
  );
}

export default function NewPaymentPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewPayment />
    </Suspense>
  );
}
