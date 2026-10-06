"use client";

import { L, type JobDetail } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileDown, Link2, Printer, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChallanSheet, sheetFromJob } from "@/components/jobs/challan-sheet";
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

      <ChallanSheet ref={sheet} data={sheetFromJob(job, c)} biz={biz} qr={qr} publicUrl={publicUrl} />

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
