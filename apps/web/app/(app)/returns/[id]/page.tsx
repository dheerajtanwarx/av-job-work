"use client";

import { formatDate, formatINR, formatQty, L, roundQty } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, History, ImageOff, Pencil, Printer, Upload, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SubBillsTable } from "@/components/billing/sub-bills-table";
import { PhotoButtons, PhotoGrid, UploadSummary, usePhotoQueue } from "@/components/returns/photo-uploader";
import { ReturnEditDialog } from "@/components/returns/return-edit-dialog";
import { PayStatusPill } from "@/components/returns/status";
import { Button } from "@/components/ui/button";
import { SendWhatsAppButton } from "@/components/whatsapp/send-whatsapp";
import { Card, Section, TableWrap } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { EmptyState, ErrorBlock, LoadingBlock, Notice } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { api } from "@/lib/api";
import { formatTime, istDay, photoHref, photoThumb, receivedLabel, useIsManager, useReturn } from "@/lib/returns";
import { EditedTag } from "@/components/ui/edited";
import { cn } from "@/lib/utils";

export default function ReturnPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useReturn(id);
  const isManager = useIsManager();
  const photos = usePhotoQueue();
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const voidReturn = useMutation({
    mutationFn: (reason: string) => api.post(`/returns/${id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Return voided. Pending quantities and payments are updated. It stays in the history.");
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
  const r = q.data;
  const voided = !!r.voidedAt;
  const p = r.payment;
  const single = r.lines.length === 1 ? r.lines[0].id : null;
  const tags = r.lines.length > 1 ? r.lines.map((l) => ({ value: l.id, label: l.designName })) : undefined;
  const pendingUploads = photos.items.filter((x) => x.status !== "done").length;

  const upload = async (only?: string) => {
    const failed = await photos.uploadAll(r.id, (tag) => single ?? tag, only);
    qc.invalidateQueries({ queryKey: ["return", id] });
    if (failed) toast.error(`${failed} photo${failed === 1 ? "" : "s"} could not be uploaded. Tap Retry.`);
    else {
      toast.success("Photos uploaded");
      // Uploaded photos now show in the grid from the server; drop them from the local queue.
      setTimeout(() => photos.clear(), 600);
    }
  };

  const totals = r.lines.reduce(
    (s, l) => ({ ok: s.ok + l.okQty, damaged: s.damaged + l.damagedQty, rejected: s.rejected + l.rejectedQty, lost: s.lost + l.lostQty, payable: s.payable + l.payableQty }),
    { ok: 0, damaged: 0, rejected: 0, lost: 0, payable: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/returns" className="hover:text-fg">
              {L.returns}
            </Link>{" "}
            / {L.return}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className={cn("text-xl leading-7 font-semibold tracking-[-0.01em]", voided && "text-fg-muted line-through")}>{r.returnNumber}</h1>
            <PayStatusPill payment={p} voided={voided} />
            <EditedTag edited={r.editedAt ? { at: r.editedAt, by: r.editedBy } : null} />
          </div>
          <div className="num mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-muted">
            <Link href={`/clients/${r.client.id}`} className="font-medium text-fg-2 hover:text-accent">
              {r.client.name}
            </Link>
            <span aria-hidden>·</span>
            <Link href={`/jobs/${r.job.id}`} className="hover:text-accent">
              {L.job} {r.job.jobNumber}
            </Link>
            <span aria-hidden>·</span>
            <span>{r.productName}</span>
          </div>
          <div className="num mt-0.5 text-[13px] text-fg-2">
            Received {receivedLabel(r.date, r.receivedAt)}
            {r.enteredBy && <span className="text-fg-muted"> · entered by {r.enteredBy}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!voided && p && p.outstandingPaise > 0 && (
            <Button asChild>
              <Link href={`/bills/new?jobId=${r.job.id}&returnId=${r.id}`}>
                <Wallet /> Record payment for this return
              </Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href={`/returns/${r.id}/print`}>
              <Printer /> Receiving voucher
            </Link>
          </Button>
          {!voided && <SendWhatsAppButton target={{ kind: "return", id: r.id }} />}
          {!voided && (
            <Button variant="ghost" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          )}
          {!voided && (
            <Menu>
              <MenuItem danger icon={<Ban />} onSelect={() => setVoidOpen(true)}>
                Void return
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {voided && (
        <Notice tone="danger" icon={Ban}>
          <span className="font-semibold text-fg">VOID</span> <span className="text-fg-2">· voided on {formatDate(istDay(r.voidedAt!))}.</span> <span className="text-fg-muted">Reason: {r.voidReason ?? "—"}</span>
          <div className="mt-0.5 text-xs text-fg-muted">Quantities and value of this return no longer count. The record is kept for the audit trail.</div>
        </Notice>
      )}
      {warnings.length > 0 && (
        <Notice tone="warning" icon={AlertTriangle} action={<Button variant="ghost" size="sm" onClick={() => setWarnings([])}>Dismiss</Button>}>
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </Notice>
      )}

      {/* Payment state */}
      {p && !voided && (
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-5">
          {[
            { label: "Work value", value: formatINR(p.valuePaise) },
            { label: "Paid", value: formatINR(p.paidPaise), cls: p.paidPaise > 0 ? "text-success" : "" },
            { label: "Outstanding", value: formatINR(p.outstandingPaise), cls: p.outstandingPaise > 0 ? (p.overdueDays > 0 ? "text-danger" : "text-orange-700 dark:text-orange-300") : "" },
            { label: "Due date", value: p.dueDate ? formatDate(p.dueDate) : "No due date", cls: "text-[15px]" },
            {
              label: "Status",
              value: <PayStatusPill payment={p} />,
              sub: p.overdueDays > 0 ? `${p.overdueDays} day${p.overdueDays === 1 ? "" : "s"} overdue` : p.outstandingPaise > 0 && p.dueDate ? "Not yet due" : undefined,
            },
          ].map((m) => (
            <div key={m.label} className="bg-surface px-4 py-3">
              <div className="text-xs text-fg-muted">{m.label}</div>
              <div className={cn("num mt-1 text-lg leading-6 font-semibold", m.cls)}>{m.value}</div>
              {m.sub && <div className="mt-0.5 text-xs text-danger">{m.sub}</div>}
            </div>
          ))}
        </Card>
      )}

      {/* Lines */}
      <Section title="Designs received" description={`${r.lines.length} design${r.lines.length === 1 ? "" : "s"}`}>
        <Card className="overflow-hidden">
          <TableWrap>
            <table className="ledger ledger-sticky">
              <thead>
                <tr>
                  <th>Design</th>
                  <th className="r">Good</th>
                  <th className="r">Damaged</th>
                  <th className="r">Rejected</th>
                  <th className="r">Lost</th>
                  <th className="r">Rate</th>
                  <th className="r">Payable</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.id} className={cn(voided && "text-fg-muted line-through")}>
                    <td>
                      <div className="font-medium">{l.designName}</div>
                      {l.exceptionReason && <div className="max-w-56 text-xs text-warning no-underline">Exception: {l.exceptionReason}</div>}
                      {l.payOverrideReason && <div className="max-w-56 text-xs text-fg-muted">Payable changed: {l.payOverrideReason}</div>}
                    </td>
                    <td className="r font-medium">
                      {formatQty(l.okQty)} <span className="text-xs text-fg-muted">{l.unit}</span>
                    </td>
                    <td className={cn("r", l.damagedQty > 0 && "text-danger")}>
                      {formatQty(l.damagedQty)}
                      {l.payDamaged && l.damagedQty > 0 && <div className="text-[11px] text-fg-muted">paid</div>}
                    </td>
                    <td className={cn("r", l.rejectedQty > 0 && "text-danger")}>
                      {formatQty(l.rejectedQty)}
                      {l.payRejected && l.rejectedQty > 0 && <div className="text-[11px] text-fg-muted">paid</div>}
                    </td>
                    <td className={cn("r", l.lostQty > 0 && "text-danger")}>
                      {formatQty(l.lostQty)}
                      {l.payLost && l.lostQty > 0 && <div className="text-[11px] text-fg-muted">paid</div>}
                    </td>
                    <td className="r whitespace-nowrap">
                      {formatINR(l.ratePaise)}
                      {l.ratePaise !== l.challanRatePaise && <div className="text-xs text-warning">challan {formatINR(l.challanRatePaise)}</div>}
                    </td>
                    <td className="r">{formatQty(l.payableQty)}</td>
                    <td className="r font-semibold">{formatINR(l.valuePaise)}</td>
                  </tr>
                ))}
              </tbody>
              {r.lines.length > 1 && (
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="r">{formatQty(roundQty(totals.ok))}</td>
                    <td className="r">{formatQty(roundQty(totals.damaged))}</td>
                    <td className="r">{formatQty(roundQty(totals.rejected))}</td>
                    <td className="r">{formatQty(roundQty(totals.lost))}</td>
                    <td />
                    <td className="r">{formatQty(roundQty(totals.payable))}</td>
                    <td className="r">{formatINR(r.valuePaise)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </TableWrap>
        </Card>
        {r.notes && <p className="mt-2 text-[13px] text-fg-2">Notes: {r.notes}</p>}
      </Section>

      {/* Photos */}
      <Section title="Design / job work photos" description={r.photos.length ? `${r.photos.length} photo${r.photos.length === 1 ? "" : "s"}` : undefined}>
        <Card className="space-y-4 p-4">
          {r.photos.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-warning">
              <ImageOff className="size-4" /> No photo uploaded
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {r.photos.map((ph) => (
                <li key={ph.id}>
                  <Link href={photoHref(ph.id)} className="group block overflow-hidden rounded-lg border border-border bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoThumb(ph.id)} alt={`${ph.design?.name ?? r.returnNumber} photo`} loading="lazy" className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                  </Link>
                  <div className="mt-1 truncate text-[11px] text-fg-muted">
                    {ph.design?.name ?? "All designs"} · {formatTime(ph.uploadedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!voided && (
            <div className="space-y-3 border-t border-border pt-4">
              <PhotoButtons onFiles={(f) => photos.add(f, null)} hasPhotos={r.photos.length > 0 || photos.items.length > 0} />
              <PhotoGrid queue={photos} tags={tags} onRetry={(key) => upload(key)} />
              <UploadSummary queue={photos} onRetryAll={() => upload()} />
              {pendingUploads > 0 && !photos.items.some((x) => x.status === "uploading") && photos.items.some((x) => x.status === "ready") && (
                <Button size="lg" className="min-h-12 w-full sm:w-auto" onClick={() => upload()}>
                  <Upload /> Upload {pendingUploads} photo{pendingUploads === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          )}
        </Card>
      </Section>

      {/* Vouchers */}
      <Section
        title={`Linked ${L.subBills.toLowerCase()}`}
        action={
          !voided && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/bills/new?jobId=${r.job.id}&returnId=${r.id}`}>
                <Wallet /> New payment
              </Link>
            </Button>
          )
        }
      >
        <Card className="overflow-hidden">
          {r.vouchers.length === 0 ? (
            <EmptyState icon={Wallet} title="No payment voucher linked">
              {p && p.paidPaise > 0 ? "Payments on the challan are applied to this return automatically (oldest first)." : "Nothing has been paid against this return yet."}
            </EmptyState>
          ) : (
            <SubBillsTable rows={r.vouchers} hideClient hideJob />
          )}
        </Card>
      </Section>

      {/* History */}
      <Section title="History" description="Every change with who, when and why">
        <Card className="overflow-hidden">
          {r.history.length === 0 ? (
            <EmptyState icon={History} title="No history yet" />
          ) : (
            <ol className="divide-y divide-border">
              {r.history.map((h, i) => (
                <li key={i} className="px-4 py-3 text-[13px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium capitalize">{h.action}</span>
                    <span className="num text-xs text-fg-muted">
                      {formatDate(istDay(h.at))}, {formatTime(h.at)}
                      {h.user && ` · ${h.user}`}
                    </span>
                  </div>
                  {h.summary && <div className="mt-0.5 text-fg-2">{h.summary}</div>}
                  {h.reason && <div className="mt-0.5 text-xs text-fg-muted">Reason: {h.reason}</div>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </Section>

      <ReturnEditDialog detail={r} open={editOpen} onOpenChange={setEditOpen} isManager={isManager} onSaved={setWarnings} />
      <ReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Void ${r.returnNumber}?`}
        description="Its quantities go back to pending and its value is removed. Nothing is deleted: the return stays in the history marked VOID."
        confirmLabel="Void return"
        loading={voidReturn.isPending}
        onConfirm={(reason) => voidReturn.mutate(reason)}
      />
    </div>
  );
}
