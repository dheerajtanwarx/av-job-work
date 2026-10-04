"use client";

import { formatDate, formatINR, formatQty, type ClientSummary } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Pencil, Phone, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { InvoicesTable } from "@/components/billing/invoices-table";
import { ClientDialog } from "@/components/forms/master-dialogs";
import { JobsTable } from "@/components/jobs/jobs-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ErrorBlock, LoadingBlock, Stat } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const tabs = ["Jobs", "Invoices", "History"] as const;

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["client", id], queryFn: () => api.get<ClientSummary>(`/clients/${id}`) });
  const [tab, setTab] = useState<(typeof tabs)[number]>("Jobs");
  const [edit, setEdit] = useState(false);
  if (q.isPending) return <LoadingBlock rows={8} />;
  if (q.isError) return <ErrorBlock error={q.error} />;
  const { client: c, totals: t } = q.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 animate-rise">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-tight">{c.name}</h1>
            {!c.isActive && <Badge>Inactive</Badge>}
          </div>
          {c.businessName && <div className="text-muted">{c.businessName}</div>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
            {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-indigo"><Phone className="size-3.5" />{c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-indigo"><Mail className="size-3.5" />{c.email}</a>}
            {c.address && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{c.address}</span>}
            {c.gstin && <span>GSTIN {c.gstin}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href={`/jobs/new?clientId=${c.id}`}><Plus /> New job</Link></Button>
          {t.unbilledPaise > 0 && <Button asChild variant="secondary"><Link href={`/invoices/new?clientId=${c.id}`}><ReceiptText /> Bill {formatINR(t.unbilledPaise)}</Link></Button>}
          <Button variant="ghost" onClick={() => setEdit(true)}><Pencil /> Edit</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid grid-cols-3 gap-4 p-5">
          <Stat label="Active jobs" value={t.activeJobs} sub={`${t.completedJobs} completed`} />
          <Stat label="Pieces sent" value={formatQty(t.sent)} sub={`${formatQty(t.received)} back${t.exceptions ? `, ${t.exceptions} issues` : ""}`} />
          <Stat label="Pending" value={formatQty(t.pending)} tone={t.pending ? "marigold" : "leaf"} sub="with this client" />
        </Card>
        <Card className="grid grid-cols-3 gap-4 p-5">
          <Stat label="Billed" value={formatINR(t.billedPaise)} tone="indigo" sub={t.unbilledPaise ? `${formatINR(t.unbilledPaise)} unbilled` : undefined} />
          <Stat label="Paid" value={formatINR(t.paidPaise)} tone="leaf" />
          <Stat label="Outstanding" value={formatINR(t.outstandingPaise)} tone={t.outstandingPaise ? "madder" : "muted"} />
        </Card>
      </div>
      {c.notes && <p className="rounded-lg bg-marigold-50 px-4 py-2 text-sm text-marigold-700">{c.notes}</p>}

      <div className="flex gap-1 border-b border-line">
        {tabs.map((x) => (
          <button key={x} onClick={() => setTab(x)} className={cn("-mb-px border-b-2 px-4 py-2 font-semibold", tab === x ? "border-indigo text-indigo" : "border-transparent text-muted hover:text-ink")}>
            {x}
            <span className="ml-1.5 text-xs text-faint">{x === "Jobs" ? q.data.jobs.length : x === "Invoices" ? q.data.invoices.length : ""}</span>
          </button>
        ))}
      </div>

      <Card>
        {tab === "Jobs" && (q.data.jobs.length ? <JobsTable rows={q.data.jobs} hideClient /> : <p className="p-5 text-muted">No jobs yet for this client.</p>)}
        {tab === "Invoices" && (q.data.invoices.length ? <InvoicesTable rows={q.data.invoices} hideClient /> : <p className="p-5 text-muted">No invoices yet.</p>)}
        {tab === "History" && (
          <>
            <CardHeader title="Everything with this client" description="Newest first" />
            <ul className="divide-y divide-line border-t border-line">
              {q.data.timeline.map((e, i) => (
                <li key={i}>
                  <Link href={e.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-paper">
                    <span className="w-20 shrink-0 text-sm text-muted">{formatDate(e.date).slice(0, 6)}</span>
                    <span className={cn("size-2 shrink-0 rounded-full", { job: "bg-indigo", return: "bg-leaf", invoice: "bg-plum", payment: "bg-marigold", completed: "bg-leaf", cancelled: "bg-madder", void: "bg-faint" }[e.type] ?? "bg-faint")} />
                    <span className={cn("flex-1", e.type === "void" && "text-muted line-through")}>{e.text}</span>
                    {e.amountPaise !== undefined && <span className="num font-semibold">{formatINR(e.amountPaise)}</span>}
                  </Link>
                </li>
              ))}
              {q.data.timeline.length === 0 && <li className="p-5 text-muted">Nothing yet.</li>}
            </ul>
          </>
        )}
      </Card>
      <ClientDialog open={edit} onOpenChange={setEdit} client={c} />
    </div>
  );
}
