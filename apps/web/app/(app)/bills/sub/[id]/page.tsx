"use client";

import { formatDate, formatINR, formatQty, L, NOTIFY_CHANNEL_LABEL, PAYMENT_METHOD_LABEL, type NotificationRow, type NotifyChannel, type SubBillDetail, type SubBillWithEmail } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FileCheck2, History, Mail, MailCheck, MailWarning, MailX, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AmountBox, BillSheet, ChallanAccount, SheetSection, SheetTable } from "@/components/billing/bill-sheet";
import { EditPaymentDialog } from "@/components/billing/edit-payment-dialog";
import { NotificationStatusBadge, formatDateTime } from "@/components/billing/notification-status";
import { BillStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditedTag, editedText } from "@/components/ui/edited";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ErrorBlock, LoadingBlock, Notice } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { api } from "@/lib/api";
import { useRole } from "@/lib/returns";

export default function SubBillPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["sub-bill", id],
    queryFn: () => api.get<SubBillDetail>(`/sub-bills/${id}`),
  });
  const { isOwner } = useRole();
  const [voidOpen, setVoidOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const voidBill = useMutation({
    mutationFn: (reason: string) => api.post<SubBillDetail>(`/sub-bills/${id}/void`, { reason }),
    onSuccess: (b) => {
      qc.invalidateQueries();
      toast.success(
        b.mainBill?.cancelled
          ? `${L.subBill} voided. ${L.mainBill} ${b.mainBill.billNumber} is cancelled until the challan is fully paid again.`
          : `${L.subBill} voided. Its amount is payable again.`,
      );
      setVoidOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const sendEmail = useMutation({
    mutationFn: () => api.post<SubBillWithEmail>(`/sub-bills/${id}/email`),
    onSuccess: ({ email, ...b }) => {
      qc.setQueryData(["sub-bill", id], b);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setResendOpen(false);
      if (email.status === "sent") toast.success(email.message);
      else toast.error(email.message);
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
  const settled = b.mainBill && !b.mainBill.cancelled ? b.mainBill : null;
  const lastEmail = b.notifications.find((n) => n.channel === "email");

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/bills" className="hover:text-fg">
              {L.subBills}
            </Link>{" "}
            / {L.subBill}
          </div>
          <div className="flex flex-wrap items-center gap-x-3">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{b.billNumber}</h1>
            <BillStatusBadge state={voided ? "voided" : "paid"} />
            <EditedTag edited={b.edited} />
          </div>
          <div className="num mt-0.5 text-[13px] text-fg-muted">
            <Link href={`/clients/${b.client.id}`} className="font-medium text-fg-2 hover:text-accent">
              {b.client.name}
            </Link>{" "}
            ·{" "}
            <Link href={`/jobs/${b.job.id}`} className="hover:text-accent">
              {b.job.jobNumber}
            </Link>{" "}
            · {formatDate(b.date)} · <span className="font-medium text-fg-2">{formatINR(b.amountPaise)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {settled && (
            <Button asChild variant="secondary">
              <Link href={`/bills/main/${settled.id}`}>
                <FileCheck2 /> {L.mainBill} {settled.billNumber}
              </Link>
            </Button>
          )}
          {!voided && (
            <Button
              variant="ghost"
              disabled={!b.client.email}
              title={b.client.email ? `Send to ${b.client.email}` : `${b.client.name} has no email address`}
              onClick={() => setResendOpen(true)}
            >
              <Mail /> {lastEmail ? "Resend email" : "Email voucher"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer /> Print / Save PDF
          </Button>
          {!voided && isOwner && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit payment
            </Button>
          )}
          {!voided && isOwner && (
            <Menu>
              <MenuItem danger icon={<Ban />} onSelect={() => setVoidOpen(true)}>
                Void {L.subBill.toLowerCase()}
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {voided && (
        <Notice tone="danger" icon={Ban} className="no-print">
          <span className="font-medium text-fg">
            Voided on {formatDate(b.voidedAt)}
            {b.voidedBy ? ` by ${b.voidedBy}` : ""}.
          </span>{" "}
          <span className="text-fg-muted">{b.voidReason}</span>
        </Notice>
      )}

      {!voided && !isOwner && (
        <p className="no-print text-xs text-fg-muted">Only an owner can change or void a recorded payment.</p>
      )}

      {!voided && <EmailBanner bill={b} last={lastEmail} onResend={() => setResendOpen(true)} />}

      <div className="mx-auto max-w-3xl">
        <BillSheet
          business={b.business}
          kind="Job work payment"
          title={L.subBill}
          number={b.billNumber}
          date={formatDate(b.date)}
          paidTo={b.client}
          stamp={voided ? { label: "Voided", tone: "danger" } : { label: "Paid", tone: "success" }}
          details={[
            { label: L.job, value: <span className="num">{b.job.jobNumber}</span> },
            { label: "Product", value: b.job.productName },
            {
              label: "Against return",
              value: b.returnNumber ? (
                <Link href={`/returns/${b.returnId}`} className="num hover:text-accent">
                  {b.returnNumber}
                </Link>
              ) : (
                <span className="text-fg-muted">Not linked (on account)</span>
              ),
            },
            { label: "Payment method", value: PAYMENT_METHOD_LABEL[b.method] },
            ...(b.reference ? [{ label: "Reference", value: <span className="num">{b.reference}</span> }] : []),
            ...(b.enteredBy ? [{ label: "Entered by", value: b.enteredBy }] : []),
            ...(b.edited ? [{ label: "Last edited", value: editedText(b.edited).replace(/^Edited /, "") }] : []),
            ...(settled ? [{ label: L.mainBill, value: settled.billNumber }] : []),
          ]}
        >
          <AmountBox label="Amount paid" paise={b.amountPaise}>
            <div className="mt-1 text-xs text-fg-muted">
              Paid by {PAYMENT_METHOD_LABEL[b.method]}
              {b.reference && <span className="num"> · Ref. {b.reference}</span>} on {formatDate(b.date)}
            </div>
          </AmountBox>

          {b.advanceReason && (
            <SheetSection title="Advance">
              <p className="text-xs leading-relaxed text-fg-2">
                Part of this payment is an advance beyond the work value returned so far. Reason: <span className="font-medium">{b.advanceReason}</span>
              </p>
            </SheetSection>
          )}

          <SheetSection title={`${L.job} ${b.job.jobNumber} account`} aside={voided ? "Excludes this voided voucher" : "Including this payment"}>
            <ChallanAccount money={b.challanMoney} />
          </SheetSection>

          {b.lines.length > 0 && (
            <SheetSection title="Work paid for (by quantity)" aside={`Total qty ${formatQty(b.qty)}`}>
              <SheetTable>
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Design</th>
                    <th className="r">Qty</th>
                    <th className="r">Rate</th>
                    <th className="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {b.lines.map((l, i) => (
                    <tr key={l.id}>
                      <td className="num text-fg-faint">{i + 1}</td>
                      <td className="font-medium">{l.designName}</td>
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
                    <td className="r">{formatINR(b.lines.reduce((s, l) => s + l.amountPaise, 0))}</td>
                  </tr>
                </tfoot>
              </SheetTable>
            </SheetSection>
          )}

          {b.notes && (
            <SheetSection title="Notes">
              <p className="text-xs leading-relaxed whitespace-pre-line text-fg-2">{b.notes}</p>
            </SheetSection>
          )}
        </BillSheet>
      </div>

      <ChangeHistory rows={b.history} />

      <NotificationLog rows={b.notifications} />

      {isOwner && !voided && <EditPaymentDialog bill={b} open={editOpen} onOpenChange={setEditOpen} />}

      <ConfirmDialog
        open={resendOpen}
        onOpenChange={setResendOpen}
        title={lastEmail ? `Resend ${b.billNumber}?` : `Email ${b.billNumber}?`}
        description={
          lastEmail?.status === "sent"
            ? `It was already emailed to ${lastEmail.recipient}. ${b.client.name} will receive another copy at ${b.client.email}.`
            : `${b.client.name} will receive this ${L.subBill.toLowerCase()} at ${b.client.email}.`
        }
        confirmLabel={lastEmail ? "Resend email" : "Send email"}
        loading={sendEmail.isPending}
        onConfirm={() => sendEmail.mutate()}
      />
      <ReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Void ${b.billNumber}?`}
        description={`It stays in history, crossed out, and ${formatINR(b.amountPaise)} becomes payable again on ${b.job.jobNumber}${settled ? `. ${L.mainBill} ${settled.billNumber} is cancelled until the challan is fully paid again` : ""}.`}
        confirmLabel={`Void ${L.subBill.toLowerCase()}`}
        loading={voidBill.isPending}
        onConfirm={(r) => voidBill.mutate(r)}
      />
    </div>
  );
}

/** What happened to the last email of this voucher – failures show the server's error text. */
function EmailBanner({ bill, last, onResend }: { bill: SubBillDetail; last: NotificationRow | undefined; onResend: () => void }) {
  const resend = bill.client.email ? (
    <Button size="sm" variant="secondary" onClick={onResend}>
      <Mail /> {last ? "Resend" : "Send"}
    </Button>
  ) : undefined;
  if (!last)
    return (
      <Notice tone="neutral" icon={Mail} className="no-print" action={resend}>
        <span className="text-fg-2">Not emailed yet.</span>{" "}
        <span className="text-fg-muted">{bill.client.email ? `Send it to ${bill.client.email}.` : `${bill.client.name} has no email address – add one on the worker's profile.`}</span>
      </Notice>
    );
  if (last.status === "sent")
    return (
      <Notice tone="accent" icon={MailCheck} className="no-print" action={resend}>
        <span className="font-medium text-fg">Emailed to {last.recipient}</span> <span className="text-fg-muted">on {formatDateTime(last.createdAt)}{last.auto ? " (automatic)" : ""}.</span>
      </Notice>
    );
  if (last.status === "failed")
    return (
      <Notice tone="danger" icon={MailX} className="no-print" action={resend}>
        <span className="font-medium text-fg">Email to {last.recipient ?? "the job worker"} failed</span>{" "}
        <span className="text-fg-muted">on {formatDateTime(last.createdAt)}:</span> <span className="font-mono text-xs break-all text-danger">{last.error}</span>
        <div className="text-xs text-fg-muted">The payment is saved. Check the SMTP settings or the address, then resend.</div>
      </Notice>
    );
  return (
    <Notice tone="warning" icon={MailWarning} className="no-print" action={resend}>
      <span className="font-medium text-fg">Not emailed:</span> <span className="text-fg-muted">{last.error ?? "skipped"}</span>
    </Notice>
  );
}

const ACTION_LABEL: Record<string, string> = { create: "Recorded", update: "Edited", void: "Voided", email: "Emailed", email_failed: "Email failed" };

/** Who recorded, changed, voided and emailed this voucher – newest first, with the reason for each change. */
function ChangeHistory({ rows }: { rows: SubBillDetail["history"] }) {
  return (
    <Card className="no-print mx-auto max-w-3xl overflow-hidden">
      <CardHeader title="History" description="Every change to this payment, with who made it." />
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-fg-muted">
          <History className="size-4" /> No history yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((h, i) => (
            <li key={i} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className={h.action === "update" ? "font-medium text-warning" : h.action === "void" ? "font-medium text-danger" : "font-medium"}>{ACTION_LABEL[h.action] ?? h.action}</span>
                  <span className="text-fg-muted">by {h.user ?? "unknown"}</span>
                </div>
                {h.summary && <div className="mt-0.5 text-xs break-words text-fg-2">{h.summary}</div>}
                {h.reason && h.action !== "create" && <div className="mt-0.5 text-xs text-fg-muted">Reason: {h.reason}</div>}
              </div>
              <div className="num text-right text-xs text-fg-muted">{formatDateTime(h.at)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NotificationLog({ rows }: { rows: NotificationRow[] }) {
  return (
    <Card className="no-print mx-auto max-w-3xl overflow-hidden">
      <CardHeader title="Notification log" description="Every email (and future WhatsApp / SMS) attempt for this voucher." />
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-fg-muted">Nothing sent yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <NotificationStatusBadge status={n.status} />
                  <span className="font-medium">{NOTIFY_CHANNEL_LABEL[n.channel as NotifyChannel] ?? n.channel}</span>
                  {n.recipient && <span className="truncate text-fg-muted">to {n.recipient}</span>}
                </div>
                {n.error && <div className="mt-0.5 text-xs break-words text-fg-muted">{n.error}</div>}
              </div>
              <div className="num text-right text-xs text-fg-muted">
                <div>{formatDateTime(n.createdAt)}</div>
                <div>{n.auto ? "Automatic" : "Sent manually"}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
