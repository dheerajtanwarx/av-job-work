"use client";

import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type MainBillDetail } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Ban, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AmountBox, BillSheet, SheetSection, SheetTable } from "@/components/billing/bill-sheet";
import { BillStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/misc";
import { api } from "@/lib/api";

const dash = <span className="text-fg-faint">—</span>;
const qtyOrDash = (n: number) => (n ? formatQty(n) : dash);

export default function MainBillPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["main-bill", id], queryFn: () => api.get<MainBillDetail>(`/main-bills/${id}`) });

  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={10} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data;
  const cancelled = !!m.cancelledAt;
  const t = m.totals;
  const unit = m.product.unit;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/bills?tab=main" className="hover:text-fg">
              Bills
            </Link>{" "}
            / Main bill
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{m.billNumber}</h1>
            <BillStatusBadge state={cancelled ? "cancelled" : "settled"} />
          </div>
          <div className="num mt-0.5 text-[13px] text-fg-muted">
            <Link href={`/clients/${m.client.id}`} className="font-medium text-fg-2 hover:text-accent">
              {m.client.name}
            </Link>{" "}
            ·{" "}
            <Link href={`/jobs/${m.job.id}`} className="hover:text-accent">
              {m.job.jobNumber}
            </Link>{" "}
            · {formatDate(m.date)}
          </div>
        </div>
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer /> Print / Save PDF
        </Button>
      </div>

      {cancelled && (
        <Notice tone="danger" icon={Ban} className="no-print">
          <span className="font-medium text-fg">Cancelled on {formatDate(m.cancelledAt)}.</span>{" "}
          <span className="text-fg-muted">{m.cancelReason}. It comes back automatically, with the same number, once every returned piece is paid for again.</span>
        </Notice>
      )}

      <div className="mx-auto max-w-4xl">
        <BillSheet
          business={m.business}
          kind="Job settlement"
          title="Main Bill"
          number={m.billNumber}
          date={formatDate(m.date)}
          paidTo={m.client}
          stamp={cancelled ? { label: "Cancelled", tone: "danger" } : { label: "Fully settled", tone: "success" }}
          details={[
            { label: "Job", value: m.job.jobNumber },
            { label: "Job date", value: formatDate(m.job.jobDate) },
            ...(m.job.expectedReturnDate ? [{ label: "Expected back", value: formatDate(m.job.expectedReturnDate) }] : []),
            { label: "Completed", value: formatDate(m.job.completedAt) },
            { label: "Payments", value: `${m.subBills.length} sub bill${m.subBills.length === 1 ? "" : "s"}` },
          ]}
        >
          <SheetSection title="Product">
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {m.product.name}
                  {m.product.code && <span className="num ml-2 text-xs font-normal text-fg-muted">{m.product.code}</span>}
                </div>
                {m.product.description && <p className="mt-0.5 text-xs leading-relaxed whitespace-pre-line text-fg-muted">{m.product.description}</p>}
                {m.job.notes && <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-line text-fg-2">Job notes: {m.job.notes}</p>}
              </div>
              <dl className="num grid grid-cols-4 gap-x-5 text-right text-xs sm:gap-x-6">
                {[
                  ["Ordered", t.quantity],
                  ["Sent", t.sent],
                  ["Back OK", t.ok],
                  ["Not OK", t.exceptions],
                ].map(([label, n]) => (
                  <div key={label}>
                    <dt className="text-fg-muted">{label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold">{formatQty(n as number)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </SheetSection>

          <SheetSection title="Design-wise work" aside={`Quantities in ${unit}`}>
            <SheetTable>
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Design</th>
                  <th className="r">Ordered</th>
                  <th className="r">Sent</th>
                  <th className="r">OK</th>
                  <th className="r">Damaged</th>
                  <th className="r">Rejected</th>
                  <th className="r">Lost</th>
                  <th className="r">Rate</th>
                  <th className="r">Paid pcs</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {m.designs.map((d, i) => (
                  <tr key={d.jobItemId}>
                    <td className="num text-fg-faint">{i + 1}</td>
                    <td>
                      <div className="font-medium whitespace-nowrap">{d.designName}</div>
                      {d.designCode && <div className="num text-xs text-fg-muted">{d.designCode}</div>}
                    </td>
                    <td className="r">{formatQty(d.quantity)}</td>
                    <td className="r">{formatQty(d.sent)}</td>
                    <td className="r">{formatQty(d.ok)}</td>
                    <td className="r">{qtyOrDash(d.damaged)}</td>
                    <td className="r">{qtyOrDash(d.rejected)}</td>
                    <td className="r">{qtyOrDash(d.lost)}</td>
                    <td className="r">{formatINR(d.ratePaise)}</td>
                    <td className="r">{formatQty(d.paidQty)}</td>
                    <td className="r font-medium">{formatINR(d.paidValuePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="r">{formatQty(t.quantity)}</td>
                  <td className="r">{formatQty(t.sent)}</td>
                  <td className="r">{formatQty(t.ok)}</td>
                  <td className="r">{qtyOrDash(t.damaged)}</td>
                  <td className="r">{qtyOrDash(t.rejected)}</td>
                  <td className="r">{qtyOrDash(t.lost)}</td>
                  <td />
                  <td className="r">{formatQty(t.billedQty)}</td>
                  <td className="r">{formatINR(t.billedValuePaise)}</td>
                </tr>
              </tfoot>
            </SheetTable>
            {t.exceptions > 0 && <p className="mt-2 text-xs text-fg-muted">Damaged, rejected and lost pieces are recorded for reference and are not paid for.</p>}
          </SheetSection>

          <SheetSection title="Payments (sub bills)" aside={`${m.subBills.length}`}>
            <SheetTable>
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Sub bill</th>
                  <th>Date</th>
                  <th>Paid by</th>
                  <th className="r">Pieces</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {m.subBills.map((b, i) => (
                  <tr key={b.id}>
                    <td className="num text-fg-faint">{i + 1}</td>
                    <td>
                      <Link href={`/bills/sub/${b.id}`} className="font-medium hover:text-accent">
                        {b.billNumber}
                      </Link>
                    </td>
                    <td className="num whitespace-nowrap">{formatDate(b.date)}</td>
                    <td className="whitespace-nowrap">
                      {PAYMENT_METHOD_LABEL[b.method]}
                      {b.reference && <span className="num text-xs text-fg-muted"> · {b.reference}</span>}
                    </td>
                    <td className="r">{formatQty(b.qty)}</td>
                    <td className="r font-medium">{formatINR(b.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total paid</td>
                  <td className="r">{formatQty(m.qty)}</td>
                  <td className="r">{formatINR(m.totalPaise)}</td>
                </tr>
              </tfoot>
            </SheetTable>
          </SheetSection>

          <AmountBox label="Total paid for this job" paise={m.totalPaise}>
            <div className="mt-1 text-xs text-fg-muted">
              {formatQty(m.qty)} {unit} of {m.product.name} across {m.subBills.length} payment{m.subBills.length === 1 ? "" : "s"}. Nothing is left to pay on {m.job.jobNumber}.
            </div>
          </AmountBox>
        </BillSheet>
      </div>
    </div>
  );
}
