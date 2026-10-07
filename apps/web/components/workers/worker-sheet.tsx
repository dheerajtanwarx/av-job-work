"use client";

import { formatDate, formatINR, formatQty, JOB_STATUS_LABEL, L, type ClientSummary, type Settings } from "@av/shared";
import Link from "next/link";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { workerDocDisplay } from "@/lib/worker-docs";

/** Printable worker profile: details, Aadhaar images (when the viewer may see them) and linked challans. */
export function WorkerSheet({ data, terms, biz, showAadhaar, ref }: { data: ClientSummary; terms: string; biz?: Settings; showAadhaar: boolean; ref?: Ref<HTMLElement> }) {
  const c = data.client;
  const returns = data.timeline.filter((e) => e.type === "return").length;
  const payments = data.subBills.filter((b) => !b.voidedAt).length;
  const aadhaar = showAadhaar && (c.aadhaarFrontId || c.aadhaarBackId);

  return (
    <article ref={ref} className="sheet print-plain overflow-hidden rounded-lg border border-border">
      <div className="p-6 sm:p-9 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#18181b] pb-4">
          <div className="flex min-w-0 items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {biz?.logo && <img src={biz.logo} alt="" className="size-14 shrink-0 object-contain" />}
            <div className="min-w-0">
              <div className="text-xl leading-7 font-bold">{biz?.businessName ?? "AV Creation"}</div>
              {biz?.address && <div className="mt-1 max-w-sm text-xs whitespace-pre-line text-fg-muted">{biz.address}</div>}
            </div>
          </div>
          <div className="text-right text-xs text-fg-muted">Printed {formatDate(new Date().toISOString())}</div>
        </header>

        <h1 className="mt-4 text-center text-lg font-bold tracking-[0.2em] uppercase">Worker Profile</h1>

        <div className="mt-4 flex flex-wrap items-center gap-4 rounded border border-[#18181b]/30 p-4">
          {c.photoId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workerDocDisplay(c.photoId)} alt={c.name} className="size-24 rounded-full object-cover ring-1 ring-[#18181b]/20" />
          ) : (
            <div className="grid size-24 place-items-center rounded-full border border-dashed border-[#18181b]/30 text-[11px] text-fg-faint">No photo</div>
          )}
          <div className="min-w-0">
            <div className="text-xl font-bold uppercase">{c.name}</div>
            <div className="num text-[13px] text-fg-muted">{[c.workerCode, c.phone, c.alternatePhone].filter(Boolean).join(" · ")}</div>
            {c.businessName && <div className="text-[13px]">{c.businessName}</div>}
            {!c.isActive && <div className="mt-1 text-xs font-semibold tracking-wide text-[#c0352a] uppercase">Archived</div>}
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          <Box label="Work / items" value={c.workItems || "—"} />
          <Box label="Payment terms" value={terms} />
          <Box label="Address" value={c.address || "—"} />
          <Box label="Linked records" value={`${data.jobs.length} ${data.jobs.length === 1 ? "challan" : "challans"} · ${returns} returns · ${payments} payments`} />
        </dl>
        {(c.email || c.gstin || c.pan) && <p className="mt-2 text-xs text-fg-muted">{[c.email, c.gstin && `GSTIN ${c.gstin}`, c.pan && `PAN ${c.pan}`].filter(Boolean).join(" · ")}</p>}

        {aadhaar && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="text-[11px] font-semibold tracking-wide uppercase">Aadhaar photos</h2>
            <div className="mt-2 flex flex-wrap gap-4">
              {[
                { id: c.aadhaarFrontId, label: "Front" },
                { id: c.aadhaarBackId, label: "Back" },
              ].map((a) =>
                a.id ? (
                  <figure key={a.label}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={workerDocDisplay(a.id)} alt={`Aadhaar ${a.label}`} className="h-36 rounded border border-[#18181b]/20 object-contain" />
                    <figcaption className="mt-0.5 text-[11px] text-fg-muted">{a.label}</figcaption>
                  </figure>
                ) : null,
              )}
            </div>
          </section>
        )}

        <section className="mt-5">
          <h2 className="text-[11px] font-semibold tracking-wide uppercase">Linked {L.jobs.toLowerCase()}</h2>
          {data.jobs.length === 0 ? (
            <p className="mt-2 text-[13px] text-fg-muted">No {L.jobs.toLowerCase()} yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12px] [&_td]:border [&_td]:border-[#18181b]/30 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-[#18181b]/40 [&_th]:bg-[#f4f4f2] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[10px] [&_th]:font-semibold [&_th]:uppercase">
                <thead>
                  <tr>
                    <th>{L.jobNumber}</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="!text-right">Issued</th>
                    <th className="!text-right">Received</th>
                    <th className="!text-right">Final</th>
                    <th className="!text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {data.jobs.map((j) => (
                    <tr key={j.id} className="break-inside-avoid">
                      <td className="font-medium">{j.jobNumber}</td>
                      <td>{formatDate(j.jobDate)}</td>
                      <td>{JOB_STATUS_LABEL[j.status]}</td>
                      <td className="text-right">{formatQty(j.totals.sent)}</td>
                      <td className="text-right">{formatQty(j.totals.ok)}</td>
                      <td className="text-right">{formatINR(j.money.valuePaise)}</td>
                      <td className="text-right">{formatINR(j.money.outstandingPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {c.notes && (
          <div className="mt-4 text-[13px]">
            <span className="font-semibold">Notes: </span>
            <span className="whitespace-pre-wrap">{c.notes}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#18181b]/20 px-3 py-2">
      <dt className="text-[10px] tracking-wide text-fg-muted uppercase">{label}</dt>
      <dd className="mt-0.5 font-semibold whitespace-pre-line">{value}</dd>
    </div>
  );
}

export function WorkerPreviewDialog({
  open,
  onOpenChange,
  printHref,
  ...sheet
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  printHref: string;
  data: ClientSummary;
  terms: string;
  biz?: Settings;
  showAadhaar: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Print preview"
      description={`${sheet.data.client.name} · ${sheet.data.client.workerCode}`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild>
            <Link href={printHref}>Print</Link>
          </Button>
        </>
      }
    >
      <WorkerSheet {...sheet} />
    </Dialog>
  );
}
