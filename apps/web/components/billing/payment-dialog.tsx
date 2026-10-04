"use client";

import { formatINR, PAYMENT_METHOD_LABEL, PAYMENT_METHODS, paiseToRupees, rupeesToPaise, todayISO, type InvoiceDetail, type PaymentMethod } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function PaymentDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: { id: string; invoiceNumber: string; outstandingPaise: number; totalPaise: number; client: { name: string } };
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  useEffect(() => {
    if (open) {
      setAmount(String(paiseToRupees(invoice.outstandingPaise)));
      setDate(todayISO());
      setReference("");
    }
  }, [open, invoice.outstandingPaise]);
  const paise = rupeesToPaise(amount || 0);
  const tooMuch = paise > invoice.outstandingPaise;
  const m = useMutation({
    mutationFn: () => api.post<InvoiceDetail>("/payments", { invoiceId: invoice.id, date, amountPaise: paise, method, reference }),
    onSuccess: (inv) => {
      qc.invalidateQueries();
      toast.success(`${formatINR(paise)} recorded. ${inv.outstandingPaise > 0 ? `${formatINR(inv.outstandingPaise)} still due.` : "Fully paid."}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description={`${invoice.invoiceNumber} · ${invoice.client.name} · ${formatINR(invoice.outstandingPaise)} outstanding`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={paise <= 0 || tooMuch}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount received" error={tooMuch ? `Only ${formatINR(invoice.outstandingPaise)} is outstanding` : undefined} hint={paise > 0 && paise < invoice.outstandingPaise ? `Partial payment. ${formatINR(invoice.outstandingPaise - paise)} will remain due.` : undefined}>
          <MoneyInput autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={tooMuch} className="h-10 text-base font-medium" />
        </Field>
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
