"use client";

import { formatDate, formatINR, formatQty, L, roundQty, type JobDetail, type Settings, type Unit } from "@av/shared";
import Link from "next/link";
import type { Ref } from "react";
import { termsLabel } from "@/components/forms/payment-terms";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { jobPhotoThumb } from "@/lib/job-photos";

/** Everything printed on a job work challan; built from a saved challan or from the unsaved form. */
export interface ChallanSheetData {
  /** null while the challan is not saved yet. */
  jobNumber: string | null;
  jobDate: string;
  expectedReturnDate: string | null;
  cancelled?: boolean;
  worker: { name: string; workerCode?: string | null; phone?: string | null; address?: string | null } | null;
  productName: string | null;
  jobWorkTypeName: string | null;
  terms: string;
  notes: string | null;
  items: ChallanSheetItem[];
}

export interface ChallanSheetItem {
  key: string;
  designName: string;
  designCode?: string | null;
  notes?: string | null;
  material: string | null;
  quantity: number;
  unit: Unit;
  ratePaise: number;
  valuePaise: number;
  /** Image URLs (saved thumbnails or local previews). */
  itemPhotos: string[];
  designPhotos: string[];
}

export function sheetFromJob(job: JobDetail, worker?: { workerCode?: string | null; phone?: string | null; address?: string | null } | null): ChallanSheetData {
  return {
    jobNumber: job.jobNumber,
    jobDate: job.jobDate,
    expectedReturnDate: job.expectedReturnDate,
    cancelled: job.status === "CANCELLED",
    worker: { name: job.client.name, ...worker },
    productName: job.product.name,
    jobWorkTypeName: job.jobWorkType?.name ?? null,
    terms: termsLabel(job.terms.policy, job.terms.days),
    notes: job.notes,
    items: job.items.map((i) => ({
      key: i.id,
      designName: i.designName,
      designCode: i.designCode,
      notes: i.notes,
      material: i.material ? `${i.material.code} · ${i.material.name}` : null,
      quantity: i.quantity,
      unit: i.unit,
      ratePaise: i.ratePaise,
      valuePaise: i.expectedValuePaise,
      itemPhotos: i.photos.filter((p) => p.kind === "ITEM").map((p) => jobPhotoThumb(p.id)),
      designPhotos: i.photos.filter((p) => p.kind === "DESIGN").map((p) => jobPhotoThumb(p.id)),
    })),
  };
}

export function ChallanSheet({ data, biz, qr, publicUrl, ref }: { data: ChallanSheetData; biz?: Settings; qr?: string | null; publicUrl?: string; ref?: Ref<HTMLElement> }) {
  const qtyByUnit = new Map<Unit, number>();
  for (const i of data.items) qtyByUnit.set(i.unit, roundQty((qtyByUnit.get(i.unit) ?? 0) + i.quantity));
  const totalValue = data.items.reduce((s, i) => s + i.valuePaise, 0);
  const withPhotos = data.items.map((i, idx) => ({ ...i, idx })).filter((i) => i.itemPhotos.length || i.designPhotos.length);

  return (
    <article ref={ref} className="sheet print-plain overflow-hidden rounded-lg border border-border">
      <div className="p-6 sm:p-9 print:p-0">
        {/* Letterhead */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#18181b] pb-4">
          <div className="flex min-w-0 items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {biz?.logo && <img src={biz.logo} alt="" className="size-16 shrink-0 object-contain" />}
            <div className="min-w-0">
              <div className="text-2xl leading-7 font-bold tracking-[-0.01em]">{biz?.businessName ?? "AV Creation"}</div>
              {biz?.address && <div className="mt-1 max-w-sm text-xs leading-relaxed whitespace-pre-line text-fg-muted">{biz.address}</div>}
              {(biz?.phone || biz?.email) && <div className="mt-0.5 text-xs text-fg-muted">{[biz.phone && `Mob: ${biz.phone}`, biz.email].filter(Boolean).join(" · ")}</div>}
            </div>
          </div>
          {qr && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code for this challan" className="size-24" />
              <div className="mt-0.5 text-[9px] tracking-wide text-fg-muted uppercase">Scan to view status</div>
            </div>
          )}
        </header>

        <h1 className="mt-4 text-center text-lg font-bold tracking-[0.2em] uppercase">Job Work Challan</h1>
        {data.cancelled && <div className="mt-1 text-center text-sm font-semibold tracking-widest text-[#c0352a] uppercase">Cancelled</div>}

        {/* Particulars */}
        <div className="mt-4 grid border border-[#18181b]/40 text-[13px] sm:grid-cols-2">
          <dl className="divide-y divide-[#18181b]/20 sm:border-r sm:border-[#18181b]/40">
            <Row label={L.jobNumber} value={data.jobNumber ? <span className="font-semibold">{data.jobNumber}</span> : <span className="text-fg-muted italic">Given on save</span>} />
            <Row label="Date" value={formatDate(data.jobDate)} />
            <Row
              label="Worker"
              value={
                <span className="font-semibold">
                  {data.worker?.name ?? "—"}
                  {data.worker?.workerCode ? ` (${data.worker.workerCode})` : ""}
                </span>
              }
            />
            <Row label="Mobile" value={data.worker?.phone ?? "—"} />
            {data.worker?.address && <Row label="Address" value={<span className="whitespace-pre-line">{data.worker.address}</span>} />}
          </dl>
          <dl className="divide-y divide-[#18181b]/20 max-sm:border-t max-sm:border-[#18181b]/40">
            <Row label="Product" value={data.productName ?? "—"} />
            <Row label={L.jobWorkType} value={data.jobWorkTypeName ?? "—"} />
            <Row label="Expected return" value={data.expectedReturnDate ? formatDate(data.expectedReturnDate) : "—"} />
            <Row label="Payment terms" value={data.terms} />
          </dl>
        </div>

        {/* Design-wise table */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-[13px] [&_td]:border [&_td]:border-[#18181b]/30 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-[#18181b]/40 [&_th]:bg-[#f4f4f2] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Design</th>
                <th>Material</th>
                <th className="!text-right">Qty</th>
                <th>Unit</th>
                <th className="!text-right">Rate</th>
                <th className="!text-right">Value</th>
              </tr>
            </thead>
            <tbody className="num">
              {data.items.map((i, idx) => (
                <tr key={i.key}>
                  <td className="text-fg-muted">{idx + 1}</td>
                  <td>
                    <div className="font-medium">{i.designName}</div>
                    {i.designCode && <div className="text-[11px] text-fg-muted">{i.designCode}</div>}
                    {i.notes && <div className="text-[11px] text-fg-muted">{i.notes}</div>}
                  </td>
                  <td>{i.material ?? "—"}</td>
                  <td className="text-right">{formatQty(i.quantity)}</td>
                  <td>{i.unit}</td>
                  <td className="text-right">{formatINR(i.ratePaise)}</td>
                  <td className="text-right font-medium">{formatINR(i.valuePaise)}</td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 5 - data.items.length) }).map((_, i) => (
                <tr key={`blank-${i}`} aria-hidden>
                  <td>&nbsp;</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
            <tfoot className="num font-semibold">
              <tr>
                <td colSpan={3} className="text-right">
                  Total
                </td>
                <td colSpan={2} className="text-right">
                  {[...qtyByUnit].map(([u, n]) => `${formatQty(n)} ${u}`).join(" · ")}
                </td>
                <td />
                <td className="text-right">{formatINR(totalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-fg-muted">Value = quantity × agreed job work rate. Final payment is on the work actually returned. This is a job work challan, not a sale.</p>

        {/* Reference photos */}
        {withPhotos.length > 0 && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="text-[11px] font-semibold tracking-wide uppercase">Reference photos</h2>
            <div className="mt-2 space-y-3">
              {withPhotos.map((i) => (
                <div key={i.key} className="break-inside-avoid rounded border border-[#18181b]/30 p-2.5">
                  <div className="text-[13px] font-medium">
                    {i.idx + 1}. {i.designName}
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <PhotoStrip label="Item / material" urls={i.itemPhotos} />
                    <PhotoStrip label="Design / sample" urls={i.designPhotos} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.notes && (
          <div className="mt-4 text-[13px]">
            <span className="font-semibold">Notes: </span>
            <span className="whitespace-pre-wrap">{data.notes}</span>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-14 grid grid-cols-3 gap-6 text-center text-xs">
          {["Material issued by", "Received by", "Signature"].map((s) => (
            <div key={s}>
              <div className="h-10" />
              <div className="border-t border-[#18181b]/60 pt-1.5 font-medium">{s}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-between gap-2 text-[10px] text-fg-faint">
          <span>For {biz?.businessName ?? "AV Creation"}</span>
          {publicUrl && <span className="num break-all">{publicUrl}</span>}
        </div>
      </div>
    </article>
  );
}

function PhotoStrip({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div>
      <div className="text-[11px] text-fg-muted">{label}</div>
      {urls.length ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {urls.map((u, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt={`${label} ${n + 1}`} className="size-20 rounded border border-[#18181b]/20 object-cover" />
          ))}
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-fg-faint">—</div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 px-3 py-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

/** On-screen preview of the challan. Saved challans link to the print page; unsaved ones must be saved first. */
export function ChallanPreviewDialog({ open, onOpenChange, data, biz, printHref }: { open: boolean; onOpenChange: (o: boolean) => void; data: ChallanSheetData; biz?: Settings; printHref?: string }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Print preview"
      description={printHref ? `${L.jobFull} ${data.jobNumber}` : "How the challan will print. Save it to print or share."}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {printHref && (
            <Button asChild>
              <Link href={printHref}>Print</Link>
            </Button>
          )}
        </>
      }
    >
      <ChallanSheet data={data} biz={biz} />
    </Dialog>
  );
}
