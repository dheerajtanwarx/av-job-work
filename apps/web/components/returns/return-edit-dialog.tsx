"use client";

import { formatINR, formatQty, lineAmount, payableQty, returnLineTotal, UNIT_DECIMALS, type ReturnDetail, type ReturnLineView } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { paiseToInput, parseQty, qtyError, rupeesInput } from "@/lib/returns";
import { cn } from "@/lib/utils";

interface EditLine {
  ok: string;
  damaged: string;
  rejected: string;
  lost: string;
  rate: string;
  payDamaged: boolean;
  payRejected: boolean;
  payLost: boolean;
  exceptionReason: string;
}

const fromLine = (l: ReturnLineView): EditLine => ({
  ok: String(l.okQty),
  damaged: String(l.damagedQty),
  rejected: String(l.rejectedQty),
  lost: String(l.lostQty),
  rate: paiseToInput(l.ratePaise),
  payDamaged: l.payDamaged,
  payRejected: l.payRejected,
  payLost: l.payLost,
  exceptionReason: l.exceptionReason ?? "",
});

const QTY = [
  ["ok", "Good"],
  ["damaged", "Damaged"],
  ["rejected", "Rejected"],
  ["lost", "Lost"],
] as const;

/** Edit quantities, rate and (managers) payable flags. A reason is always required and kept in the history. */
export function ReturnEditDialog({
  detail,
  open,
  onOpenChange,
  isManager,
  onSaved,
}: {
  detail: ReturnDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isManager: boolean;
  onSaved: (warnings: string[]) => void;
}) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Record<string, EditLine>>({});
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLines(Object.fromEntries(detail.lines.map((l) => [l.id, fromLine(l)])));
    setDate(detail.date.slice(0, 10));
    setNotes(detail.notes ?? "");
    setReason("");
    setTouched(false);
    // Only on open: a background refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const calc = detail.lines.map((l) => {
    const e = lines[l.id] ?? fromLine(l);
    const errors: Record<string, string> = {};
    for (const [k] of QTY) {
      const err = qtyError(e[k], l.unit);
      if (err) errors[k] = err;
    }
    const n = (v: string) => Math.max(0, parseQty(v) || 0);
    const q = { okQty: n(e.ok), damagedQty: n(e.damaged), rejectedQty: n(e.rejected), lostQty: n(e.lost) };
    const ratePaise = rupeesInput(e.rate);
    if (Number.isNaN(ratePaise)) errors.rate = "Enter a valid rate";
    const total = returnLineTotal(q);
    const over = total > l.pendingBefore + 1e-9;
    const payable = payableQty(q, e);
    return { l, e, q, ratePaise, errors, over, total, payable, valuePaise: Number.isNaN(ratePaise) ? 0 : lineAmount(payable, ratePaise) };
  });
  const totalValue = calc.reduce((s, c) => s + c.valuePaise, 0);
  const reasonMissing = reason.trim().length < 3;
  const invalid = calc.some((c) => Object.keys(c.errors).length > 0 || (c.over && !c.e.exceptionReason.trim()));

  const save = useMutation({
    mutationFn: () =>
      api.patch<ReturnDetail & { warnings: string[] }>(`/returns/${detail.id}`, {
        reason: reason.trim(),
        date,
        notes: notes || null,
        lines: calc.map((c) => ({
          id: c.l.id,
          okQty: c.q.okQty,
          damagedQty: c.q.damagedQty,
          rejectedQty: c.q.rejectedQty,
          lostQty: c.q.lostQty,
          ratePaise: c.ratePaise,
          exceptionReason: c.e.exceptionReason.trim() || null,
          ...(isManager ? { payDamaged: c.e.payDamaged, payRejected: c.e.payRejected, payLost: c.e.payLost } : {}),
        })),
      }),
    onSuccess: ({ warnings, ...d }) => {
      qc.setQueryData(["return", detail.id], d);
      qc.invalidateQueries();
      toast.success(`${detail.returnNumber} updated`);
      warnings.forEach((w) => toast.warning(w));
      onSaved(warnings);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });

  const set = (id: string, patch: Partial<EditLine>) => setLines((ls) => ({ ...ls, [id]: { ...(ls[id] ?? fromLine(detail.lines.find((l) => l.id === id)!)), ...patch } }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={`Edit ${detail.returnNumber}`}
      description="Pending quantities, value and payments update everywhere. The change and reason are kept in the history."
      footer={
        <>
          <Button variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="min-h-11 sm:min-h-0"
            loading={save.isPending}
            onClick={() => {
              setTouched(true);
              if (reasonMissing) return toast.error("Give a reason for the change");
              if (invalid) return toast.error("Fix the highlighted lines");
              save.mutate();
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {calc.map(({ l, e, errors, over, total, payable, valuePaise }) => {
          const decimals = UNIT_DECIMALS[l.unit] ?? 0;
          return (
            <div key={l.id} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[13px] font-semibold">{l.designName}</div>
                <div className="num text-xs text-fg-muted">
                  Room on this return: {formatQty(l.pendingBefore)} {l.unit} · challan rate {formatINR(l.challanRatePaise)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {QTY.map(([k, label]) => (
                  <Field key={k} label={<span className="text-xs">{label}</span>} error={touched ? errors[k] : undefined}>
                    <Input
                      inputMode={decimals > 0 ? "decimal" : "numeric"}
                      value={e[k]}
                      onChange={(ev) => set(l.id, { [k]: ev.target.value.replace(",", ".") })}
                      aria-invalid={!!errors[k] || undefined}
                      className="num h-10 text-right"
                    />
                  </Field>
                ))}
                <Field label={<span className="text-xs">Rate / {l.unit}</span>} error={touched ? errors.rate : undefined}>
                  <MoneyInput value={e.rate} onChange={(ev) => set(l.id, { rate: ev.target.value })} className="h-10 text-right" />
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                {isManager ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span className="text-fg-muted">Pay for:</span>
                    {(
                      [
                        ["payDamaged", "Damaged"],
                        ["payRejected", "Rejected"],
                        ["payLost", "Lost"],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5">
                        <input type="checkbox" className="size-4" checked={e[k]} onChange={(ev) => set(l.id, { [k]: ev.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <span className="text-fg-muted">Payable: good{[e.payDamaged && " + damaged", e.payRejected && " + rejected", e.payLost && " + lost"].filter(Boolean).join("")}</span>
                )}
                <span className="num font-medium">
                  {formatQty(payable)} × {formatINR(Number.isNaN(rupeesInput(e.rate)) ? 0 : rupeesInput(e.rate))} = {formatINR(valuePaise)}
                </span>
              </div>
              {over && (
                <div className="mt-2 rounded-md border border-warning/30 bg-warning-subtle p-2.5">
                  <div className="num flex items-center gap-1.5 text-xs font-medium">
                    <AlertTriangle className="size-3.5 text-warning" /> {formatQty(total)} entered, only {formatQty(l.pendingBefore)} can be on this return.
                  </div>
                  <Input
                    className="mt-2"
                    value={e.exceptionReason}
                    onChange={(ev) => set(l.id, { exceptionReason: ev.target.value })}
                    placeholder="Reason to record it anyway"
                    aria-invalid={(touched && !e.exceptionReason.trim()) || undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
        <div className="num flex justify-between text-[13px]">
          <span className="text-fg-muted">New work value</span>
          <span className={cn("font-semibold", totalValue !== detail.valuePaise && "text-accent")}>
            {formatINR(totalValue)}
            {totalValue !== detail.valuePaise && <span className="ml-1 font-normal text-fg-muted">(was {formatINR(detail.valuePaise)})</span>}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <Field label="Received date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason for the change" required error={touched && reasonMissing ? "Give a short reason (kept in the history)" : undefined}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Recount at the shop: 2 more pieces were damaged" />
        </Field>
      </div>
    </Dialog>
  );
}
