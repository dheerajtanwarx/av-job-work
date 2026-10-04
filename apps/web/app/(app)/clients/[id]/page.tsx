"use client";

import { formatDate, formatINR, formatQty, type ClientSummary } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Pencil, Plus, ReceiptText, StickyNote } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { InvoicesTable } from "@/components/billing/invoices-table";
import { ClientDialog } from "@/components/forms/master-dialogs";
import { JobsTable } from "@/components/jobs/jobs-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip, Notice } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const tabs = ["Jobs", "Invoices", "History"] as const;

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["client", id], queryFn: () => api.get<ClientSummary>(`/clients/${id}`) });
  const [tab, setTab] = useState<(typeof tabs)[number]>("Jobs");
  const [edit, setEdit] = useState(false);
  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={8} />
      </Card>
    );
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const { client: c, totals: t } = q.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/clients" className="hover:text-fg">
              Clients
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{c.name}</h1>
            {!c.isActive && <Badge>Inactive</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-fg-muted">
            {[
              c.businessName && <span key="b">{c.businessName}</span>,
              c.phone && (
                <a key="p" href={`tel:${c.phone}`} className="num hover:text-fg">
                  {c.phone}
                </a>
              ),
              c.email && (
                <a key="e" href={`mailto:${c.email}`} className="hover:text-fg">
                  {c.email}
                </a>
              ),
              c.address && <span key="a">{c.address}</span>,
              c.gstin && (
                <span key="g" className="num">
                  GSTIN {c.gstin}
                </span>
              ),
            ]
              .filter(Boolean)
              .flatMap((el, i) => (i ? [<span key={`d${i}`} aria-hidden>·</span>, el] : [el]))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setEdit(true)}>
            <Pencil /> Edit
          </Button>
          {t.unbilledPaise > 0 && (
            <Button asChild variant="secondary">
              <Link href={`/invoices/new?clientId=${c.id}`}>
                <ReceiptText /> Bill {formatINR(t.unbilledPaise)}
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href={`/jobs/new?clientId=${c.id}`}>
              <Plus /> New job
            </Link>
          </Button>
        </div>
      </div>

      <MetricStrip className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Active jobs" value={formatQty(t.activeJobs)} sub={`${t.completedJobs} completed`} />
        <Metric label="Pieces sent" value={formatQty(t.sent)} sub={`${formatQty(t.received)} back${t.exceptions ? `, ${t.exceptions} issues` : ""}`} />
        <Metric label="Pending" value={formatQty(t.pending)} tone={t.pending ? "warning" : "fg"} sub="With this client" />
        <Metric label="Billed" value={formatINR(t.billedPaise)} sub={t.unbilledPaise ? `${formatINR(t.unbilledPaise)} unbilled` : undefined} />
        <Metric label="Paid" value={formatINR(t.paidPaise)} />
        <Metric label="Outstanding" value={formatINR(t.outstandingPaise)} tone={t.outstandingPaise ? "danger" : "fg"} />
      </MetricStrip>
      {c.notes && (
        <Notice icon={StickyNote}>
          <span className="whitespace-pre-wrap">{c.notes}</span>
        </Notice>
      )}

      <div>
        <Tabs
          className="mb-3"
          value={tab}
          onChange={setTab}
          items={tabs.map((x) => ({ value: x, label: x, count: x === "Jobs" ? q.data.jobs.length : x === "Invoices" ? q.data.invoices.length : undefined }))}
        />
        <Card className="overflow-hidden">
          {tab === "Jobs" && (q.data.jobs.length ? <JobsTable rows={q.data.jobs} hideClient /> : <EmptyState icon={Briefcase} title="No jobs yet" />)}
          {tab === "Invoices" && (q.data.invoices.length ? <InvoicesTable rows={q.data.invoices} hideClient /> : <EmptyState icon={ReceiptText} title="No invoices yet" />)}
          {tab === "History" && (
            <ul className="divide-y divide-border">
              {q.data.timeline.map((e, i) => (
                <li key={i}>
                  <Link href={e.href} className="flex min-h-10 items-center gap-3 px-4 py-2 text-[13px] transition-colors duration-100 hover:bg-surface-2">
                    <span className="num w-14 shrink-0 text-xs text-fg-muted">{formatDate(e.date).slice(0, 6)}</span>
                    <span className={cn("size-1.5 shrink-0 rounded-full", { job: "bg-accent", return: "bg-success", invoice: "bg-fg-muted", payment: "bg-success", completed: "bg-success", cancelled: "bg-danger", void: "bg-fg-faint" }[e.type] ?? "bg-fg-faint")} />
                    <span className={cn("min-w-0 flex-1 text-fg-2", e.type === "void" && "text-fg-muted line-through")}>{e.text}</span>
                    {e.amountPaise !== undefined && <span className="num font-medium">{formatINR(e.amountPaise)}</span>}
                  </Link>
                </li>
              ))}
              {q.data.timeline.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-fg-muted">Nothing yet.</li>}
            </ul>
          )}
        </Card>
      </div>
      <ClientDialog open={edit} onOpenChange={setEdit} client={c} />
    </div>
  );
}
