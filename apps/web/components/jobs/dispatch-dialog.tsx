"use client";

import { formatQty, todayISO, type JobDetail } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function DispatchDialog({ job, open, onOpenChange }: { job: JobDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const canSend = job.items.some((i) => i.notYetSent > 0);
  const [kind, setKind] = useState<"INITIAL" | "REWORK">(canSend ? "INITIAL" : "REWORK");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const max = (id: string) => {
    const it = job.items.find((i) => i.id === id)!;
    return kind === "INITIAL" ? it.notYetSent : Math.max(0, it.rejected + it.damaged - it.reworkSent);
  };
  useEffect(() => {
    if (open) {
      const k = canSend ? "INITIAL" : "REWORK";
      setKind(k);
      setDate(todayISO());
      setNotes("");
    }
  }, [open, canSend]);
  useEffect(() => {
    setQty(Object.fromEntries(job.items.map((i) => [i.id, kind === "INITIAL" ? String(i.notYetSent || "") : ""])));
  }, [kind, job.items]);

  const total = Object.values(qty).reduce((s, v) => s + (Number(v) || 0), 0);
  const m = useMutation({
    mutationFn: () => api.post<JobDetail>(`/jobs/${job.id}/dispatches`, { date, kind, notes, lines: Object.entries(qty).map(([jobItemId, v]) => ({ jobItemId, qty: Number(v) || 0 })) }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(`${formatQty(total)} pieces ${kind === "REWORK" ? "sent for rework" : "sent"}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "REWORK" ? "Send for rework" : "Send material"}
      description={`${job.jobNumber} · ${job.client.name}`}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={total === 0}>
            Send {formatQty(total)} pieces
          </Button>
        </>
      }
    >
      <div className="mb-4 inline-flex rounded-lg border border-line bg-paper p-1">
        {(["INITIAL", "REWORK"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", kind === k ? "bg-card text-ink shadow-sm" : "text-muted")}
          >
            {k === "INITIAL" ? "Remaining pieces" : "Rework (rejected / damaged)"}
          </button>
        ))}
      </div>
      <table className="ledger mb-4">
        <thead>
          <tr><th>Design</th><th className="r">{kind === "INITIAL" ? "Not yet sent" : "Can rework"}</th><th className="r">Send now</th></tr>
        </thead>
        <tbody>
          {job.items.map((i) => (
            <tr key={i.id}>
              <td className="font-medium">{i.designName}</td>
              <td className="r num text-muted">{formatQty(max(i.id))}</td>
              <td className="r">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={max(i.id)}
                  disabled={max(i.id) === 0}
                  value={qty[i.id] ?? ""}
                  onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                  className="num ml-auto w-24 text-right"
                  aria-label={`Send ${i.designName}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date sent"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
      </div>
    </Dialog>
  );
}
