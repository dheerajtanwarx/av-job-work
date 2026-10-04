"use client";

import { computeInvoiceTotals, formatINR, formatQty, todayISO, type InvoiceDetail, type UnbilledLine } from "@av/shared";
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
import { api } from "@/lib/api";
import { useClients, useSettings } from "@/lib/queries";

function NewInvoice() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const clients = useClients(false);
  const settings = useSettings();
  const [clientId, setClientId] = useState(params.get("clientId") ?? "");
  const onlyJob = params.get("jobId");
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [tax, setTax] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [sel, setSel] = useState<Record<string, { on: boolean; qty: string }>>({});

  const unbilled = useQuery({
    queryKey: ["unbilled", clientId],
    queryFn: () => api.get<UnbilledLine[]>(`/billing/unbilled?clientId=${clientId}`),
    enabled: !!clientId,
  });
  useEffect(() => {
    if (unbilled.data) setSel(Object.fromEntries(unbilled.data.map((u) => [u.jobItemId, { on: !onlyJob || u.jobId === onlyJob, qty: String(u.unbilledQty) }])));
  }, [unbilled.data, onlyJob]);
  const taxPct = tax ?? String(settings.data?.defaultTaxPercent ?? 0);

  const chosen = useMemo(
    () => (unbilled.data ?? []).filter((u) => sel[u.jobItemId]?.on).map((u) => ({ ...u, qty: Math.min(u.unbilledQty, Math.max(0, Math.floor(Number(sel[u.jobItemId].qty) || 0))) })).filter((u) => u.qty > 0),
    [unbilled.data, sel],
  );
  const totals = computeInvoiceTotals(chosen, Number(taxPct) || 0);

  const create = useMutation({
    mutationFn: () => api.post<InvoiceDetail>("/invoices", { clientId, date, dueDate: dueDate || null, taxPercent: Number(taxPct) || 0, notes, lines: chosen.map((c) => ({ jobItemId: c.jobItemId, qty: c.qty })) }),
    onSuccess: (inv) => {
      qc.invalidateQueries();
      toast.success(`${inv.invoiceNumber} created for ${formatINR(inv.totalPaise)}`);
      router.push(`/invoices/${inv.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Group lines by job
  const groups = useMemo(() => {
    const m = new Map<string, UnbilledLine[]>();
    for (const u of unbilled.data ?? []) m.set(u.jobId, [...(m.get(u.jobId) ?? []), u]);
    return [...m.values()];
  }, [unbilled.data]);

  const pieces = chosen.reduce((s, c) => s + c.qty, 0);

  return (
    <>
      <PageHeader title="New invoice" subtitle="Bill good pieces that have come back and aren't billed yet." />
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Client" className="sm:col-span-3 sm:max-w-md">
              <Combobox options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name, sub: c.businessName }))} value={clientId} onChange={setClientId} placeholder="Choose client" />
            </Field>
            <Field label="Invoice date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Due date" hint="Optional">
              <Input type="date" value={dueDate} min={date} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Tax %" hint="0 if no GST">
              <Input type="number" min={0} max={100} step="0.01" value={taxPct} onChange={(e) => setTax(e.target.value)} className="num" />
            </Field>
          </div>

          <Section title="Lines" description={groups.length > 0 ? "Untick anything you don't want on this invoice" : undefined}>
            <Card className="overflow-hidden">
              {!clientId ? (
                <EmptyState icon={ReceiptText} title="Choose a client">
                  Their completed, unbilled work will show here.
                </EmptyState>
              ) : unbilled.isPending ? (
                <LoadingBlock />
              ) : unbilled.isError ? (
                <div className="p-4">
                  <ErrorBlock error={unbilled.error} onRetry={() => unbilled.refetch()} />
                </div>
              ) : groups.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="Nothing to bill"
                  action={
                    <Button asChild variant="secondary">
                      <Link href={`/clients/${clientId}`}>Open client</Link>
                    </Button>
                  }
                >
                  All completed work for this client is billed. Record a return first if pieces came back.
                </EmptyState>
              ) : (
                <TableWrap>
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th className="w-10" />
                        <th>Design</th>
                        <th className="r">Ready</th>
                        <th className="r">Bill qty</th>
                        <th className="r">Rate</th>
                        <th className="r">Amount</th>
                      </tr>
                    </thead>
                    {groups.map((g) => (
                      <tbody key={g[0].jobId}>
                        <tr>
                          <td colSpan={6} className="h-8! bg-surface-2/60 py-1!">
                            <span className="inline-flex items-center gap-3">
                              <span>
                                <span className="font-medium">{g[0].jobNumber}</span> <span className="text-fg-muted">· {g[0].productName}</span>
                              </span>
                              <JobStatusBadge status={g[0].jobStatus} />
                            </span>
                          </td>
                        </tr>
                        {g.map((u) => {
                          const s = sel[u.jobItemId] ?? { on: false, qty: "" };
                          const q = Math.min(u.unbilledQty, Math.max(0, Math.floor(Number(s.qty) || 0)));
                          return (
                            <tr key={u.jobItemId} className={s.on ? "" : "text-fg-faint"}>
                              <td>
                                <input type="checkbox" className="size-3.5 accent-[var(--accent-solid)]" checked={s.on} onChange={(e) => setSel({ ...sel, [u.jobItemId]: { ...s, on: e.target.checked } })} aria-label={`Bill ${u.designName}`} />
                              </td>
                              <td className={s.on ? "font-medium" : ""}>
                                {u.designName}
                                {u.billedQty > 0 && <div className="num text-xs font-normal text-fg-muted">{u.billedQty} already billed</div>}
                              </td>
                              <td className="r text-fg-muted">{formatQty(u.unbilledQty)}</td>
                              <td className="r">
                                <Input type="number" min={1} max={u.unbilledQty} disabled={!s.on} value={s.qty} onChange={(e) => setSel({ ...sel, [u.jobItemId]: { ...s, qty: e.target.value } })} className="num ml-auto w-20 text-right" aria-label={`${u.designName} quantity`} />
                              </td>
                              <td className="r">{formatINR(u.ratePaise)}</td>
                              <td className="r font-medium">{s.on ? formatINR(q * u.ratePaise) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    ))}
                  </table>
                </TableWrap>
              )}
            </Card>
          </Section>

          <Field label="Notes on invoice">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card>
            <dl className="space-y-1.5 px-4 py-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Pieces</dt>
                <dd className="num font-medium">{formatQty(pieces)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Subtotal</dt>
                <dd className="num font-medium">{formatINR(totals.subtotalPaise)}</dd>
              </div>
              {totals.taxPaise > 0 && (
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Tax {taxPct}%</dt>
                  <dd className="num font-medium">{formatINR(totals.taxPaise)}</dd>
                </div>
              )}
            </dl>
            <div className="border-t border-border px-4 py-3">
              <div className="text-xs text-fg-muted">Invoice total</div>
              <div className="num mt-0.5 text-2xl leading-8 font-semibold tracking-[-0.01em]">{formatINR(totals.totalPaise)}</div>
            </div>
            <div className="border-t border-border p-3">
              <Button size="lg" className="w-full" disabled={chosen.length === 0} loading={create.isPending} onClick={() => create.mutate()}>
                Create invoice
              </Button>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewInvoice />
    </Suspense>
  );
}
