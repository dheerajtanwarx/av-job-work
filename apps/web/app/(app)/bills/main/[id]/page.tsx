"use client";

import { formatDate, formatINR, formatQty, L, PAYMENT_METHOD_LABEL, type MainBillDetail } from "@av/shared";
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
  const q = useQuery({
    queryKey: ["main-bill", id],
    queryFn: () => api.get<MainBillDetail>(`/main-bills/${id}`),
  });

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
              {L.mainBills}
            </Link>{" "}
            / {L.mainBill}
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
          <span className="text-fg-muted">{m.cancelReason}. It comes back automatically, with the same number, once the challan is complete and its job work value is fully paid again.</span>
        </Notice>
      )}

      <div className="mx-auto max-w-4xl">
        <BillSheet
          business={m.business}
          kind="Challan settlement"
          title={L.mainBill}
          numberLabel="Settlement no."
          signatures={{ worker: "Received by", business: "Paid by" }}
          number={m.billNumber}
          date={formatDate(m.date)}
          paidTo={m.client}
          stamp={cancelled ? { label: "Cancelled", tone: "danger" } : { label: "Fully settled", tone: "success" }}
          details={[
            { label: L.job, value: <span className="num">{m.job.jobNumber}</span> },
            { label: "Challan date", value: formatDate(m.job.jobDate) },
            ...(m.job.expectedReturnDate
              ? [
                  {
                    label: "Expected back",
                    value: formatDate(m.job.expectedReturnDate),
                  },
                ]
              : []),
            { label: "Completed", value: formatDate(m.job.completedAt) },
            {
              label: "Payments",
              value: `${m.subBills.length} ${m.subBills.length === 1 ? L.subBill.toLowerCase() : L.subBills.toLowerCase()}`,
            },
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
                {m.job.notes && <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-line text-fg-2">Challan notes: {m.job.notes}</p>}
              </div>
              <dl className="num grid grid-cols-4 gap-x-5 text-right text-xs sm:gap-x-6">
                {[
                  ["Ordered", t.quantity],
                  ["Issued", t.sent],
                  ["Good", t.ok],
                  ["Not good", t.exceptions],
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
                  <th className="r">Issued</th>
                  <th className="r">Good</th>
                  <th className="r">Damaged</th>
                  <th className="r">Rejected</th>
                  <th className="r">Lost</th>
                  <th className="r">Challan rate</th>
                  <th className="r">Payable qty</th>
                  <th className="r">Work value</th>
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
                  <td className="r">{formatQty(m.designs.reduce((s, d) => s + d.paidQty, 0))}</td>
                  <td className="r">{formatINR(m.designs.reduce((s, d) => s + d.paidValuePaise, 0))}</td>
                </tr>
              </tfoot>
            </SheetTable>
            <p className="mt-2 text-xs text-fg-muted">
              Work value is calculated from each return at the rate recorded on that return.
              {t.exceptions > 0 && " Damaged, rejected and lost quantities are paid only where marked payable on the return."}
            </p>
          </SheetSection>

          <SheetSection title={L.subBills} aside={`${m.subBills.length}`}>
            <SheetTable>
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Voucher</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Return</th>
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
                    <td className="num whitespace-nowrap">{b.returnNumber ?? <span className="text-fg-faint">On account</span>}</td>
                    <td className="r font-medium">{formatINR(b.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total paid</td>
                  <td className="r">{formatINR(m.totalPaise)}</td>
                </tr>
              </tfoot>
            </SheetTable>
          </SheetSection>

          <AmountBox label="Total paid on this challan" paise={m.totalPaise}>
            <div className="mt-1 text-xs text-fg-muted">
              {formatQty(t.ok)} {unit} of {m.product.name} received good, paid across {m.subBills.length} {m.subBills.length === 1 ? L.subBill.toLowerCase() : L.subBills.toLowerCase()}.{" "}
              {cancelled ? "This settlement is cancelled." : `Nothing is left to pay on ${m.job.jobNumber}.`}
            </div>
          </AmountBox>
        </BillSheet>
      </div>
    </div>
  );
}
