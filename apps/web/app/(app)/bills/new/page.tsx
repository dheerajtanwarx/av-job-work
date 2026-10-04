"use client";

import { amountInWords, formatINR, formatQty, PAYMENT_METHOD_LABEL, PAYMENT_METHODS, todayISO, type PaymentMethod, type SubBillDetail, type UnpaidLine } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { JobStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Section, TableWrap } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api, qs } from "@/lib/api";
import { useClients } from "@/lib/queries";
import { cn } from "@/lib/utils";

const clampQty = (raw: string, max: number) => Math.min(max, Math.max(0, Math.floor(Number(raw) || 0)));

function NewSubBill() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const clients = useClients(false);
  const [clientId, setClientId] = useState(params.get("clientId") ?? "");
  const [jobId, setJobId] = useState(params.get("jobId") ?? "");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});

  // Arriving from a job: look the job up directly so the job worker fills in by itself.
  const unpaid = useQuery({
    queryKey: ["unpaid", clientId || `job:${jobId}`],
    queryFn: () => api.get<UnpaidLine[]>(`/bills/unpaid${qs(clientId ? { clientId } : { jobId })}`),
    enabled: !!clientId || !!jobId,
  });
  useEffect(() => {
    if (!clientId && unpaid.data?.[0]) setClientId(unpaid.data[0].clientId);
  }, [clientId, unpaid.data]);

  const jobs = useMemo(() => {
    const m = new Map<string, UnpaidLine[]>();
    for (const u of unpaid.data ?? []) m.set(u.jobId, [...(m.get(u.jobId) ?? []), u]);
    return [...m.values()];
  }, [unpaid.data]);

  // Pick the only job automatically; drop a job that isn't in this worker's list.
  useEffect(() => {
    if (!unpaid.data) return;
    if (jobs.length === 1 && !jobId) setJobId(jobs[0][0].jobId);
    else if (jobId && jobs.length > 0 && !jobs.some((g) => g[0].jobId === jobId)) setJobId("");
  }, [unpaid.data, jobs, jobId]);

  const lines = useMemo(() => jobs.find((g) => g[0].jobId === jobId) ?? [], [jobs, jobId]);
  // Default every line to "pay all that came back".
  useEffect(() => {
    setQty(Object.fromEntries(lines.map((u) => [u.jobItemId, String(u.unbilledQty)])));
  }, [lines]);

  const chosen = lines
    .map((u) => ({
      ...u,
      qty: clampQty(qty[u.jobItemId] ?? "", u.unbilledQty),
    }))
    .filter((u) => u.qty > 0);
  const pieces = chosen.reduce((s, c) => s + c.qty, 0);
  const totalPaise = chosen.reduce((s, c) => s + c.qty * c.ratePaise, 0);
  const allSelected = lines.length > 0 && lines.every((u) => clampQty(qty[u.jobItemId] ?? "", u.unbilledQty) === u.unbilledQty);

  const create = useMutation({
    mutationFn: () =>
      api.post<SubBillDetail>("/sub-bills", {
        jobId,
        date,
        method,
        reference,
        notes,
        lines: chosen.map((c) => ({ jobItemId: c.jobItemId, qty: c.qty })),
      }),
    onSuccess: (b) => {
      qc.invalidateQueries({ refetchType: "none" }); // mark stale without re-rendering this form as "nothing to pay" before we navigate away
      toast.success(
        b.mainBill && !b.mainBill.cancelled
          ? `${b.billNumber} saved. ${b.job.jobNumber} is fully paid, main bill ${b.mainBill.billNumber} issued.`
          : `${b.billNumber} saved: ${formatINR(b.amountPaise)} paid to ${b.client.name}`,
      );
      router.push(`/bills/sub/${b.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const pickClient = (id: string) => {
    setClientId(id);
    setJobId("");
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/bills" className="hover:text-fg">
            Bills
          </Link>
        }
        title="New sub bill"
        subtitle="Record what you paid a job worker for pieces that came back from one job."
      />
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job worker">
              <Combobox
                options={(clients.data ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                  sub: c.businessName,
                }))}
                value={clientId}
                onChange={pickClient}
                placeholder="Choose job worker"
              />
            </Field>
            <Field label="Job" hint={clientId && jobs.length > 1 ? `${jobs.length} jobs have pieces to pay for` : undefined}>
              <Combobox
                options={jobs.map((g) => ({
                  value: g[0].jobId,
                  label: `${g[0].jobNumber} · ${g[0].productName}`,
                  sub: `${formatQty(g.reduce((s, u) => s + u.unbilledQty, 0))} pcs · ${formatINR(g.reduce((s, u) => s + u.unbilledValuePaise, 0))} to pay`,
                }))}
                value={jobId}
                onChange={setJobId}
                placeholder={!clientId ? "Choose a job worker first" : jobs.length ? "Choose job" : "Nothing to pay"}
              />
            </Field>
          </div>

          <Section
            title="Pieces paid for"
            description={lines.length ? "Only good (OK) pieces that came back can be paid for" : undefined}
            action={
              lines.length > 0 && !allSelected ? (
                <Button variant="ghost" size="sm" onClick={() => setQty(Object.fromEntries(lines.map((u) => [u.jobItemId, String(u.unbilledQty)])))}>
                  Pay all
                </Button>
              ) : undefined
            }
          >
            <Card className="overflow-hidden">
              {!clientId && !jobId ? (
                <EmptyState icon={ReceiptText} title="Choose a job worker">
                  Their returned pieces that aren&apos;t paid for yet will show here.
                </EmptyState>
              ) : unpaid.isPending ? (
                <LoadingBlock />
              ) : unpaid.isError ? (
                <div className="p-4">
                  <ErrorBlock error={unpaid.error} onRetry={() => unpaid.refetch()} />
                </div>
              ) : jobs.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="Nothing to pay"
                  action={
                    clientId ? (
                      <Button asChild variant="secondary">
                        <Link href={`/clients/${clientId}`}>Open job worker</Link>
                      </Button>
                    ) : undefined
                  }
                >
                  Every returned piece is already paid for. Record a return first if more pieces came back.
                </EmptyState>
              ) : !jobId ? (
                <EmptyState icon={ReceiptText} title="Choose a job">
                  A sub bill covers one job, so its main bill can list every payment.
                </EmptyState>
              ) : (
                <TableWrap>
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Design</th>
                        <th className="r">To pay</th>
                        <th className="r">Pay for</th>
                        <th className="r">Rate</th>
                        <th className="r">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={5} className="h-8! bg-surface-2/60 py-1!">
                          <span className="inline-flex items-center gap-3">
                            <Link href={`/jobs/${jobId}`} className="hover:text-accent">
                              <span className="font-medium">{lines[0].jobNumber}</span> <span className="text-fg-muted">· {lines[0].productName}</span>
                            </Link>
                            <JobStatusBadge status={lines[0].jobStatus} />
                          </span>
                        </td>
                      </tr>
                      {lines.map((u) => {
                        const q = clampQty(qty[u.jobItemId] ?? "", u.unbilledQty);
                        return (
                          <tr key={u.jobItemId} className={q ? "" : "text-fg-faint"}>
                            <td className={q ? "font-medium" : ""}>
                              {u.designName}
                              {u.billedQty > 0 && <div className="num text-xs font-normal text-fg-muted">{formatQty(u.billedQty)} already paid</div>}
                            </td>
                            <td className="r text-fg-muted">{formatQty(u.unbilledQty)}</td>
                            <td className="r">
                              <Input
                                type="number"
                                min={0}
                                max={u.unbilledQty}
                                value={qty[u.jobItemId] ?? ""}
                                onChange={(e) =>
                                  setQty({
                                    ...qty,
                                    [u.jobItemId]: e.target.value,
                                  })
                                }
                                className="num ml-auto w-20 text-right"
                                aria-label={`${u.designName} pieces to pay for`}
                              />
                            </td>
                            <td className="r">{formatINR(u.ratePaise)}</td>
                            <td className="r font-medium">{q ? formatINR(q * u.ratePaise) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
          </Section>

          <div className="space-y-4">
            <div>
              <span id="paid-by" className="mb-1.5 block text-[13px] leading-4 font-medium text-fg-2">
                Paid by
              </span>
              <div role="radiogroup" aria-labelledby="paid-by" className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    role="radio"
                    aria-checked={method === pm}
                    onClick={() => setMethod(pm)}
                    className={cn(
                      "h-7 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-100 pointer-coarse:h-9",
                      method === pm ? "border-accent bg-accent-subtle text-fg" : "border-border-strong text-fg-2 hover:bg-surface-2",
                    )}
                  >
                    {PAYMENT_METHOD_LABEL[pm]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Reference" hint="Optional">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." />
              </Field>
            </div>
            <Field label="Notes" hint="Optional">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card>
            <dl className="space-y-1.5 px-4 py-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Pieces</dt>
                <dd className="num font-medium">{formatQty(pieces)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Paid by</dt>
                <dd className="font-medium">{PAYMENT_METHOD_LABEL[method]}</dd>
              </div>
            </dl>
            <div className="border-t border-border px-4 py-3">
              <div className="text-xs text-fg-muted">Amount paid</div>
              <div className="num mt-0.5 text-2xl leading-8 font-semibold tracking-[-0.01em]">{formatINR(totalPaise)}</div>
              {totalPaise > 0 && <div className="mt-1 text-xs leading-snug text-fg-muted italic">{amountInWords(totalPaise)}</div>}
            </div>
            <div className="border-t border-border p-3">
              <Button size="lg" className="w-full" disabled={chosen.length === 0 || !jobId} loading={create.isPending} onClick={() => create.mutate()}>
                Save sub bill
              </Button>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

export default function NewSubBillPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewSubBill />
    </Suspense>
  );
}
