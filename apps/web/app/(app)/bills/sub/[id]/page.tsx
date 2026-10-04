"use client";

import { formatDate, formatINR, formatQty, PAYMENT_METHOD_LABEL, type SubBillDetail } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FileCheck2, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AmountBox, BillSheet, SheetSection, SheetTable } from "@/components/billing/bill-sheet";
import { BillStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { api } from "@/lib/api";

export default function SubBillPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["sub-bill", id],
    queryFn: () => api.get<SubBillDetail>(`/sub-bills/${id}`),
  });
  const [voidOpen, setVoidOpen] = useState(false);
  const voidBill = useMutation({
    mutationFn: (reason: string) => api.post<SubBillDetail>(`/sub-bills/${id}/void`, { reason }),
    onSuccess: (b) => {
      qc.invalidateQueries();
      toast.success(
        b.mainBill?.cancelled ? `Sub bill voided. Main bill ${b.mainBill.billNumber} is cancelled until the job is fully paid again.` : "Sub bill voided. Its pieces can be paid for again.",
      );
      setVoidOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={8} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data;
  const voided = !!b.voidedAt;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/bills" className="hover:text-fg">
              Bills
            </Link>{" "}
            / Sub bill
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{b.billNumber}</h1>
            <BillStatusBadge state={voided ? "voided" : "paid"} />
          </div>
          <div className="num mt-0.5 text-[13px] text-fg-muted">
            <Link href={`/clients/${b.client.id}`} className="font-medium text-fg-2 hover:text-accent">
              {b.client.name}
            </Link>{" "}
            ·{" "}
            <Link href={`/jobs/${b.job.id}`} className="hover:text-accent">
              {b.job.jobNumber}
            </Link>{" "}
            · {formatDate(b.date)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {b.mainBill && !b.mainBill.cancelled && (
            <Button asChild variant="secondary">
              <Link href={`/bills/main/${b.mainBill.id}`}>
                <FileCheck2 /> Main bill {b.mainBill.billNumber}
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer /> Print / Save PDF
          </Button>
          {!voided && (
            <Menu>
              <MenuItem danger icon={<Ban />} onSelect={() => setVoidOpen(true)}>
                Void sub bill
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {voided && (
        <Notice tone="danger" icon={Ban} className="no-print">
          <span className="font-medium text-fg">Voided on {formatDate(b.voidedAt)}.</span> <span className="text-fg-muted">{b.voidReason}</span>
        </Notice>
      )}

      <div className="mx-auto max-w-3xl">
        <BillSheet
          business={b.business}
          kind="Payment voucher"
          title="Sub Bill"
          number={b.billNumber}
          date={formatDate(b.date)}
          paidTo={b.client}
          stamp={voided ? { label: "Voided", tone: "danger" } : { label: "Paid", tone: "success" }}
          details={[
            { label: "Job", value: b.job.jobNumber },
            { label: "Product", value: b.job.productName },
            { label: "Paid by", value: PAYMENT_METHOD_LABEL[b.method] },
            ...(b.reference
              ? [
                  {
                    label: "Reference",
                    value: <span className="num">{b.reference}</span>,
                  },
                ]
              : []),
            ...(b.mainBill && !b.mainBill.cancelled ? [{ label: "Main bill", value: b.mainBill.billNumber }] : []),
          ]}
        >
          <SheetSection title="Work paid for" aside={`${formatQty(b.qty)} pcs`}>
            <SheetTable>
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Design</th>
                  <th className="r">Pieces</th>
                  <th className="r">Rate</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="num text-fg-faint">{i + 1}</td>
                    <td>
                      <div className="font-medium">{l.designName}</div>
                      <div className="text-xs text-fg-muted">{b.job.productName}</div>
                    </td>
                    <td className="r">{formatQty(l.qty)}</td>
                    <td className="r">{formatINR(l.ratePaise)}</td>
                    <td className="r font-medium">{formatINR(l.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="r">{formatQty(b.qty)}</td>
                  <td />
                  <td className="r">{formatINR(b.amountPaise)}</td>
                </tr>
              </tfoot>
            </SheetTable>
          </SheetSection>

          <AmountBox label="Amount paid" paise={b.amountPaise}>
            <div className="mt-1 text-xs text-fg-muted">
              Paid by {PAYMENT_METHOD_LABEL[b.method]}
              {b.reference && <span className="num"> · Ref. {b.reference}</span>} on {formatDate(b.date)}
            </div>
          </AmountBox>

          {b.notes && (
            <SheetSection title="Notes">
              <p className="text-xs leading-relaxed whitespace-pre-line text-fg-2">{b.notes}</p>
            </SheetSection>
          )}
        </BillSheet>
      </div>

      <ReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Void ${b.billNumber}?`}
        description={`It stays in history, crossed out. Its ${formatQty(b.qty)} pieces go back to "to pay"${b.mainBill && !b.mainBill.cancelled ? `, and main bill ${b.mainBill.billNumber} is cancelled until the job is fully paid again` : ""}.`}
        confirmLabel="Void sub bill"
        loading={voidBill.isPending}
        onConfirm={(r) => voidBill.mutate(r)}
      />
    </div>
  );
}
