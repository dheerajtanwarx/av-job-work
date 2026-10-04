"use client";

import { formatDate, formatINR, formatQty, L, roundQty, type JobDetail, type Unit } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileDown, Link2, Printer, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { termsLabel } from "@/components/forms/payment-terms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorBlock, PageSkeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useClientSummary, useJob, useSettings } from "@/lib/queries";

/** Collects the page's CSS so the downloaded challan renders the same offline. */
function collectCss() {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css += Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
    } catch {
      /* cross-origin sheet – skip */
    }
  }
  return css;
}

function downloadHtml(el: HTMLElement, filename: string, title: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${collectCss()}</style></head><body style="background:#fff;padding:24px;max-width:860px;margin:0 auto">${el.outerHTML}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ChallanPrintPage() {
  const { id } = useParams<{ id: string }>();
  const q = useJob(id);
  const settings = useSettings();
  const worker = useClientSummary(q.data?.client.id);
  const qc = useQueryClient();
  const sheet = useRef<HTMLElement>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [confirmRegen, setConfirmRegen] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  const publicUrl = q.data && origin ? `${origin}/c/${q.data.publicToken}` : "";
  useEffect(() => {
    if (!publicUrl) return;
    let alive = true;
    QRCode.toDataURL(publicUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [publicUrl]);

  const regen = useMutation({
    mutationFn: () => api.post<JobDetail>(`/jobs/${id}/public-token`),
    onSuccess: (job) => {
      qc.setQueryData(["job", id], job);
      setConfirmRegen(false);
      toast.success("New QR link created. The old QR code no longer works.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <PageSkeleton rows={6} />;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const job = q.data;
  const biz = settings.data;
  const c = worker.data?.client;
  const filename = `${job.jobNumber}-challan.html`;

  const qtyByUnit = new Map<Unit, number>();
  for (const i of job.items) qtyByUnit.set(i.unit, roundQty((qtyByUnit.get(i.unit) ?? 0) + i.quantity));
  const totalValue = job.items.reduce((s, i) => s + i.expectedValuePaise, 0);

  async function share() {
    const data = { title: `${L.jobFull} ${job.jobNumber}`, text: `${L.jobFull} ${job.jobNumber} – ${job.client.name}`, url: publicUrl };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    copyLink();
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Challan link copied");
    } catch {
      toast.error(`Couldn't copy. Link: ${publicUrl}`);
    }
  }

  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost">
          <Link href={`/jobs/${job.id}`}>
            <ArrowLeft /> {job.jobNumber}
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button variant="secondary" onClick={() => window.print()} title="Choose “Save as PDF” as the printer">
            <FileDown /> Save PDF
          </Button>
          <Button variant="secondary" onClick={() => sheet.current && downloadHtml(sheet.current, filename, `${job.jobNumber} challan`)} title="Download a printable copy (HTML)">
            <Download /> Download
          </Button>
          <Button variant="secondary" onClick={share} disabled={!publicUrl}>
            <Share2 /> Share
          </Button>
          <Button variant="ghost" onClick={copyLink} disabled={!publicUrl} aria-label="Copy link">
            <Link2 />
          </Button>
          <Button variant="ghost" onClick={() => setConfirmRegen(true)} title="Regenerate QR link">
            <RefreshCw /> New QR
          </Button>
        </div>
        <p className="w-full text-xs text-fg-muted">To save a PDF, click Save PDF and choose “Save as PDF” as the printer. Download saves a printable copy you can open offline.</p>
      </div>

      <article ref={sheet} className="sheet print-plain overflow-hidden rounded-lg border border-border">
        <div className="p-6 sm:p-9 print:p-0">
          {/* Letterhead */}
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#18181b] pb-4">
            <div className="flex min-w-0 items-start gap-4">
              {biz?.logo && <img src={biz.logo} alt="" className="size-16 shrink-0 object-contain" />}
              <div className="min-w-0">
                <div className="text-2xl leading-7 font-bold tracking-[-0.01em]">{biz?.businessName ?? "AV Creation"}</div>
                {biz?.address && <div className="mt-1 max-w-sm text-xs leading-relaxed whitespace-pre-line text-fg-muted">{biz.address}</div>}
                {(biz?.phone || biz?.email) && <div className="mt-0.5 text-xs text-fg-muted">{[biz.phone && `Mob: ${biz.phone}`, biz.email].filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
            {qr && (
              <div className="text-center">
                <img src={qr} alt="QR code for this challan" className="size-24" />
                <div className="mt-0.5 text-[9px] tracking-wide text-fg-muted uppercase">Scan to view status</div>
              </div>
            )}
          </header>

          <h1 className="mt-4 text-center text-lg font-bold tracking-[0.2em] uppercase">Job Work Challan</h1>
          {job.status === "CANCELLED" && <div className="mt-1 text-center text-sm font-semibold tracking-widest text-[#c0352a] uppercase">Cancelled</div>}

          {/* Particulars */}
          <div className="mt-4 grid border border-[#18181b]/40 text-[13px] sm:grid-cols-2">
            <dl className="divide-y divide-[#18181b]/20 sm:border-r sm:border-[#18181b]/40">
              <Row label={L.jobNumber} value={<span className="font-semibold">{job.jobNumber}</span>} />
              <Row label="Date" value={formatDate(job.jobDate)} />
              <Row label="Worker" value={<span className="font-semibold">{job.client.name}{c?.workerCode ? ` (${c.workerCode})` : ""}</span>} />
              <Row label="Mobile" value={c?.phone ?? "—"} />
              {c?.address && <Row label="Address" value={<span className="whitespace-pre-line">{c.address}</span>} />}
            </dl>
            <dl className="divide-y divide-[#18181b]/20 max-sm:border-t max-sm:border-[#18181b]/40">
              <Row label="Product" value={job.product.name} />
              <Row label={L.jobWorkType} value={job.jobWorkType?.name ?? "—"} />
              <Row label="Expected return" value={job.expectedReturnDate ? formatDate(job.expectedReturnDate) : "—"} />
              <Row label="Payment terms" value={termsLabel(job.terms.policy, job.terms.days)} />
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
                {job.items.map((i, idx) => (
                  <tr key={i.id}>
                    <td className="text-fg-muted">{idx + 1}</td>
                    <td>
                      <div className="font-medium">{i.designName}</div>
                      {i.designCode && <div className="text-[11px] text-fg-muted">{i.designCode}</div>}
                      {i.notes && <div className="text-[11px] text-fg-muted">{i.notes}</div>}
                    </td>
                    <td>{i.material ? `${i.material.code} · ${i.material.name}` : "—"}</td>
                    <td className="text-right">{formatQty(i.quantity)}</td>
                    <td>{i.unit}</td>
                    <td className="text-right">{formatINR(i.ratePaise)}</td>
                    <td className="text-right font-medium">{formatINR(i.expectedValuePaise)}</td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 5 - job.items.length) }).map((_, i) => (
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

          {job.notes && (
            <div className="mt-4 text-[13px]">
              <span className="font-semibold">Notes: </span>
              <span className="whitespace-pre-wrap">{job.notes}</span>
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

      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        title="Create a new QR link?"
        description="The QR code on challans already printed or shared will stop working. Use this if a link was shared with the wrong person."
        confirmLabel="Create new link"
        danger
        loading={regen.isPending}
        onConfirm={() => regen.mutate()}
      />
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
