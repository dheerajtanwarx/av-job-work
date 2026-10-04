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
import { Card, TableWrap } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui/misc";
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

  return (
    <>
      <PageHeader eyebrow="Billing" title="New invoice" subtitle="Only good pieces that came back and are not billed yet can be billed." />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Client" className="sm:col-span-3">
              <Combobox options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name, sub: c.businessName }))} value={clientId} onChange={setClientId} placeholder="Choose client" />
            </Field>
            <Field label="Invoice date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Due date" hint="Optional"><Input type="date" value={dueDate} min={date} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <Field label="Tax %" hint="0 if no GST"><Input type="number" min={0} max={100} step="0.01" value={taxPct} onChange={(e) => setTax(e.target.value)} className="num" /></Field>
          </Card>

          <Card>
            {!clientId ? (
              <EmptyState icon={ReceiptText} title="Choose a client">We will show all their completed work that is not billed yet.</EmptyState>
            ) : unbilled.isPending ? (
              <LoadingBlock />
            ) : groups.length === 0 ? (
              <EmptyState icon={ReceiptText} title="Nothing to bill" action={<Button asChild variant="secondary"><Link href={`/clients/${clientId}`}>Open client</Link></Button>}>
                All completed work for this client is already billed. Record a return first if pieces came back.
              </EmptyState>
            ) : (
              <TableWrap>
                <table className="ledger">
                  <thead>
                    <tr><th className="w-10" /><th>Design / work</th><th className="r">Ready to bill</th><th className="r">Bill qty</th><th className="r">Rate</th><th className="r">Amount</th></tr>
                  </thead>
                  {groups.map((g) => (
                    <tbody key={g[0].jobId}>
                      <tr>
                        <td colSpan={6} className="bg-paper py-2!">
                          <span className="font-semibold text-indigo">{g[0].jobNumber}</span> <span className="text-muted">· {g[0].productName}</span> <span className="ml-1"><JobStatusBadge status={g[0].jobStatus} /></span>
                        </td>
                      </tr>
                      {g.map((u) => {
                        const s = sel[u.jobItemId] ?? { on: false, qty: "" };
                        const q = Math.min(u.unbilledQty, Math.max(0, Math.floor(Number(s.qty) || 0)));
                        return (
                          <tr key={u.jobItemId} className={s.on ? "" : "opacity-50"}>
                            <td><input type="checkbox" className="size-4 accent-indigo" checked={s.on} onChange={(e) => setSel({ ...sel, [u.jobItemId]: { ...s, on: e.target.checked } })} aria-label={`Bill ${u.designName}`} /></td>
                            <td className="font-medium">{u.designName}{u.billedQty > 0 && <div className="text-xs text-muted">{u.billedQty} already billed</div>}</td>
                            <td className="r num text-muted">{formatQty(u.unbilledQty)}</td>
                            <td className="r">
                              <Input type="number" min={1} max={u.unbilledQty} disabled={!s.on} value={s.qty} onChange={(e) => setSel({ ...sel, [u.jobItemId]: { ...s, qty: e.target.value } })} className="num ml-auto w-20 text-right" aria-label={`${u.designName} quantity`} />
                            </td>
                            <td className="r num">{formatINR(u.ratePaise)}</td>
                            <td className="r num font-semibold">{s.on ? formatINR(q * u.ratePaise) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </TableWrap>
            )}
          </Card>
          <Card className="p-5">
            <Field label="Notes on invoice"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </Card>
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="flex justify-between text-sm"><span className="text-muted">Pieces</span><span className="num font-semibold">{formatQty(chosen.reduce((s, c) => s + c.qty, 0))}</span></div>
            <div className="mt-1 flex justify-between text-sm"><span className="text-muted">Subtotal</span><span className="num font-semibold">{formatINR(totals.subtotalPaise)}</span></div>
            {totals.taxPaise > 0 && <div className="mt-1 flex justify-between text-sm"><span className="text-muted">Tax {taxPct}%</span><span className="num font-semibold">{formatINR(totals.taxPaise)}</span></div>}
            <div className="stitch my-4" />
            <div className="text-sm font-semibold text-muted uppercase">Invoice total</div>
            <div className="num font-display text-4xl font-semibold text-indigo">{formatINR(totals.totalPaise)}</div>
            <Button size="lg" className="mt-5 w-full" disabled={chosen.length === 0} loading={create.isPending} onClick={() => create.mutate()}>
              <ReceiptText /> Create invoice
            </Button>
          </Card>
        </div>
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
