"use client";

import { formatINR, L, type PaymentMethod, type SubBillDetail } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MethodChips } from "@/components/returns/method-chips";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";
import { paiseToInput, rupeesInput } from "@/lib/returns";

/**
 * Owner-only: change a recorded payment. Always asks why; the voucher then shows "Edited by …" and the old
 * and new values are kept in its history.
 */
export function EditPaymentDialog({ bill, open, onOpenChange }: { bill: SubBillDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const qtyBased = bill.lines.length > 0;
  const initial = () => ({
    amount: paiseToInput(bill.amountPaise),
    date: bill.date.slice(0, 10),
    method: bill.method as PaymentMethod,
    reference: bill.reference ?? "",
    notes: bill.notes ?? "",
    reason: "",
    advanceReason: "",
  });
  const [f, setF] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [needsAdvance, setNeedsAdvance] = useState<number | null>(null);

  const amountPaise = rupeesInput(f.amount);
  const changed = {
    amountPaise: !qtyBased && amountPaise !== bill.amountPaise,
    date: f.date !== bill.date.slice(0, 10),
    method: f.method !== bill.method,
    reference: f.reference.trim() !== (bill.reference ?? ""),
    notes: f.notes.trim() !== (bill.notes ?? ""),
  };
  const anyChange = Object.values(changed).some(Boolean);
  const errors = {
    amount: !qtyBased && !(amountPaise > 0) ? "Enter the amount paid" : undefined,
    date: f.date ? undefined : "Choose a date",
    reason: f.reason.trim().length < 3 ? "Say why this payment is being changed" : undefined,
    advance: needsAdvance !== null && f.advanceReason.trim().length < 3 ? "Add a reason for the advance" : undefined,
  };

  const save = useMutation({
    mutationFn: () =>
      api.patch<SubBillDetail>(`/sub-bills/${bill.id}`, {
        reason: f.reason.trim(),
        ...(changed.amountPaise ? { amountPaise } : {}),
        ...(changed.date ? { date: f.date } : {}),
        ...(changed.method ? { method: f.method } : {}),
        ...(changed.reference ? { reference: f.reference.trim() } : {}),
        ...(changed.notes ? { notes: f.notes.trim() } : {}),
        ...(needsAdvance !== null ? { advanceReason: f.advanceReason.trim() } : {}),
      }),
    onSuccess: (b) => {
      qc.setQueryData(["sub-bill", bill.id], b);
      qc.invalidateQueries();
      toast.success(
        b.mainBill && !b.mainBill.cancelled
          ? `${b.billNumber} updated. ${b.job.jobNumber} is fully paid – ${L.mainBill} ${b.mainBill.billNumber}.`
          : `${b.billNumber} updated. ${b.job.jobNumber} now has ${formatINR(b.challanMoney.outstandingPaise)} outstanding.`,
      );
      close(false);
    },
    onError: (e) => {
      const d = e instanceof ApiError ? (e.body.details as { needsAdvanceReason?: boolean; outstandingPaise?: number } | undefined) : undefined;
      if (d?.needsAdvanceReason) {
        setNeedsAdvance(d.outstandingPaise ?? 0);
        return;
      }
      toast.error(e.message);
    },
  });

  const close = (o: boolean) => {
    if (!o) {
      setF(initial());
      setTouched(false);
      setNeedsAdvance(null);
    }
    onOpenChange(o);
  };

  const submit = () => {
    setTouched(true);
    if (!anyChange || Object.values(errors).some(Boolean)) return;
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      wide
      title={`Edit ${bill.billNumber}`}
      description={`${bill.client.name} · ${bill.job.jobNumber}. The voucher will show who changed it and when; the old values stay in its history.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!anyChange} onClick={submit}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount paid" required error={touched ? errors.amount : undefined} hint={qtyBased ? "Paid by design quantity – void and re-enter to change the amount." : changed.amountPaise ? `Was ${formatINR(bill.amountPaise)}` : undefined}>
            <MoneyInput
              value={f.amount}
              disabled={qtyBased}
              onChange={(e) => {
                setF({ ...f, amount: e.target.value });
                setNeedsAdvance(null);
              }}
            />
          </Field>
          <Field label="Date" required error={touched ? errors.date : undefined}>
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        </div>
        <MethodChips id="edit-paid-by" value={f.method} onChange={(method) => setF({ ...f, method })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference">
            <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="UPI / cheque no." />
          </Field>
          <Field label="Notes">
            <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>
        {needsAdvance !== null && (
          <Notice tone="warning">
            Only {formatINR(needsAdvance)} is payable on {bill.job.jobNumber}. {formatINR(Math.max(0, amountPaise - needsAdvance))} will be recorded as an advance.
            <Field label="Reason for the advance" required error={touched ? errors.advance : undefined} className="w-full">
              <Input autoFocus value={f.advanceReason} onChange={(e) => setF({ ...f, advanceReason: e.target.value })} placeholder="Paid ahead for the next lot" />
            </Field>
          </Notice>
        )}
        <Field label="Why is this being changed?" required error={touched ? errors.reason : undefined} hint="Kept in the voucher's history with your name.">
          <Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Entered ₹3,000 instead of ₹3,500" />
        </Field>
        {touched && !anyChange && <p className="text-xs text-fg-muted">Nothing has been changed yet.</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
