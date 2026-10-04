"use client";

import { DISPATCH_KIND_LABEL, formatQty, qtyFitsUnit, roundQty, todayISO, UNIT_DECIMALS, type DispatchKind, type JobDetail } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { api, ApiError } from "@/lib/api";

interface StockShort {
  materialId: string;
  name: string;
  unit: string;
  available: number;
  wanted: number;
}

const HINT: Record<DispatchKind, string> = {
  INITIAL: "Issue the rest of the ordered quantity.",
  ADDITIONAL: "Issue more than ordered (extra material). A reason is required.",
  REWORK: "Send damaged / rejected pieces back for rework. A reason is required.",
};

/** Material issue: Initial / Additional / Rework, with a reason and stock-shortage override. */
export function DispatchDialog({ job, open, onOpenChange, initialKind }: { job: JobDetail; open: boolean; onOpenChange: (o: boolean) => void; initialKind?: DispatchKind }) {
  const qc = useQueryClient();
  const canInitial = job.items.some((i) => i.notYetSent > 0);
  const canRework = job.items.some((i) => i.rejected + i.damaged - i.reworkSent > 0);
  const defaultKind: DispatchKind = initialKind ?? (canInitial ? "INITIAL" : canRework ? "REWORK" : "ADDITIONAL");
  const [kind, setKind] = useState<DispatchKind>(defaultKind);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [short, setShort] = useState<StockShort[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const max = (id: string) => {
    const it = job.items.find((i) => i.id === id)!;
    if (kind === "INITIAL") return it.notYetSent;
    if (kind === "REWORK") return Math.max(0, roundQty(it.rejected + it.damaged - it.reworkSent));
    return Infinity;
  };
  useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setDate(todayISO());
      setNotes("");
      setReason("");
      setShort(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    setQty(Object.fromEntries(job.items.map((i) => [i.id, kind === "INITIAL" && i.notYetSent ? String(i.notYetSent) : ""])));
    setShort(null);
    setError(null);
  }, [kind, job.items]);

  const lines = Object.entries(qty).map(([jobItemId, v]) => ({ jobItemId, qty: Number(v) || 0 }));
  const units = new Set(job.items.map((i) => i.unit));
  const total = roundQty(lines.reduce((s, l) => s + l.qty, 0));
  const totalLabel = units.size === 1 ? `${formatQty(total)} ${[...units][0]}` : formatQty(total);
  const needsReason = kind !== "INITIAL" || !!short;

  const m = useMutation({
    mutationFn: () => api.post<JobDetail>(`/jobs/${job.id}/dispatches`, { date, kind, notes: notes || null, reason: reason.trim() || null, lines }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${DISPATCH_KIND_LABEL[kind]}: ${totalLabel} recorded`);
      onOpenChange(false);
    },
    onError: (e) => {
      const details = e instanceof ApiError ? (e.body.details as { stockShort?: StockShort[] } | undefined) : undefined;
      if (e instanceof ApiError && e.status === 422 && details?.stockShort?.length) {
        setShort(details.stockShort);
        setError(null);
        return;
      }
      setError(e.message);
      toast.error(e.message);
    },
  });

  function send() {
    for (const it of job.items) {
      const q = Number(qty[it.id]) || 0;
      if (q < 0) return setError(`${it.designName}: quantity can't be negative`);
      if (q && !qtyFitsUnit(q, it.unit)) return setError(`${it.designName}: ${UNIT_DECIMALS[it.unit] ? `max ${UNIT_DECIMALS[it.unit]} decimals` : "whole numbers only"} in ${it.unit}`);
      if (q > max(it.id) + 1e-9) return setError(`${it.designName}: at most ${formatQty(max(it.id))} ${it.unit}`);
    }
    if (needsReason && reason.trim().length < 3) return setError(short ? "Give a reason to issue more than the warehouse holds" : `Give a reason for the ${DISPATCH_KIND_LABEL[kind].toLowerCase()}`);
    setError(null);
    m.mutate();
  }

  const kinds = [
    canInitial && { value: "INITIAL" as const, label: "Initial" },
    { value: "ADDITIONAL" as const, label: "Additional" },
    canRework && { value: "REWORK" as const, label: "Rework" },
  ].filter(Boolean) as { value: DispatchKind; label: string }[];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Issue material"
      description={`${job.jobNumber} · ${job.client.name}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={short ? "danger" : "primary"} onClick={send} loading={m.isPending} disabled={total <= 0}>
            {short ? "Issue anyway" : `Issue ${totalLabel}`}
          </Button>
        </>
      }
    >
      <Segmented label="Kind of issue" className="mb-1.5 w-full sm:w-auto [&>button]:flex-1" value={kind} onChange={setKind} options={kinds} />
      <p className="mb-4 text-xs text-fg-muted">{HINT[kind]}</p>

      <div className="mb-4 overflow-hidden rounded-lg border border-border">
        <table className="ledger">
          <thead>
            <tr>
              <th>Design / material</th>
              <th className="r">{kind === "INITIAL" ? "Not yet issued" : kind === "REWORK" ? "Can rework" : "Issued so far"}</th>
              <th className="r">Issue now</th>
            </tr>
          </thead>
          <tbody>
            {job.items.map((i) => {
              const mx = max(i.id);
              return (
                <tr key={i.id}>
                  <td>
                    <div className="font-medium">{i.designName}</div>
                    {i.material && <div className="text-xs text-fg-muted">{i.material.code} · {i.material.name}</div>}
                  </td>
                  <td className="r text-fg-muted">
                    {formatQty(kind === "ADDITIONAL" ? i.sent : mx)} <span className="text-xs">{i.unit}</span>
                  </td>
                  <td className="r">
                    <Input
                      type="number"
                      inputMode={UNIT_DECIMALS[i.unit] ? "decimal" : "numeric"}
                      min={0}
                      max={Number.isFinite(mx) ? mx : undefined}
                      step={UNIT_DECIMALS[i.unit] ? 1 / 10 ** UNIT_DECIMALS[i.unit] : 1}
                      disabled={mx === 0}
                      value={qty[i.id] ?? ""}
                      onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                      className="num ml-auto w-24 text-right"
                      aria-label={`Issue ${i.designName} in ${i.unit}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {short && (
        <div className="mb-4 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2.5 text-[13px]">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-danger">
            <AlertTriangle className="size-3.5" /> Not enough stock in the warehouse
          </div>
          <ul className="num space-y-0.5 text-xs text-fg-2">
            {short.map((s) => (
              <li key={s.materialId}>
                {s.name}: {formatQty(s.available)} {s.unit} in stock, issuing {formatQty(s.wanted)} – <b>{formatQty(roundQty(s.wanted - s.available))} short</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date issued">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
        {needsReason && (
          <Field label="Reason" required className="sm:col-span-2" hint="Recorded in the challan history and audit log.">
            <Textarea rows={2} autoFocus={!!short} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "REWORK" ? "Stitching uneven – sent back to fix" : kind === "ADDITIONAL" ? "Worker needs 20 more pieces for the same order" : "Stock arrived, receipt not entered yet"} />
          </Field>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </Dialog>
  );
}
