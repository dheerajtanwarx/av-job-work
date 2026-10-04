"use client";

import { formatDate, formatINR, formatQty, type Dashboard } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Plus, Shirt } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function ListPanel({ children, empty }: { children: ReactNode; empty?: ReactNode }) {
  return <Card className="overflow-hidden">{empty ? <p className="px-4 py-6 text-center text-[13px] text-fg-muted">{empty}</p> : <ul className="divide-y divide-border">{children}</ul>}</Card>;
}

const rowCls = "flex min-h-11 items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2";

function MoreLink({ href, children = "View all" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-fg-muted transition-colors hover:text-fg">
      {children}
    </Link>
  );
}

export default function DashboardPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard") });
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const empty = d && d.ops.activeJobs === 0 && d.ops.draftJobs === 0 && d.money.billedPaise === 0 && d.recentActivity.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">{formatDate(new Date())}</div>
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{greeting()}</h1>
          <div className="mt-0.5 text-[13px] text-fg-muted">
            {d ? (
              d.ops.piecesOutside > 0 ? (
                <>
                  <span className="num font-medium text-fg">{formatQty(d.ops.piecesOutside)} pieces</span> are with {d.ops.clientsWithPending} client{d.ops.clientsWithPending === 1 ? "" : "s"} right now.
                </>
              ) : (
                "All your material is back in hand."
              )
            ) : (
              <Skeleton className="mt-1 h-3.5 w-56" />
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href="/returns/new">
              <PackageCheck /> Record return
            </Link>
          </Button>
          <Button asChild>
            <Link href="/jobs/new">
              <Plus /> New job
            </Link>
          </Button>
        </div>
      </div>

      {empty && (
        <Card>
          <EmptyState
            icon={Shirt}
            title="No jobs yet"
            action={
              <Button asChild>
                <Link href="/jobs/new">
                  <Plus /> Create first job
                </Link>
              </Button>
            }
          >
            Pick a client and product, then add each design with its quantity and rate. Every piece is tracked until it&apos;s back and paid for.
          </EmptyState>
        </Card>
      )}

      <div className="space-y-3">
        <Section title="Material">
          {!d ? (
            <Skeleton className="h-[86px] rounded-lg" />
          ) : (
            <MetricStrip className="grid-cols-2 lg:grid-cols-4">
              <Metric label="Pieces outside" value={formatQty(d.ops.piecesOutside)} tone={d.ops.piecesOutside ? "warning" : "fg"} sub="Sent, not back yet" href="/reports?tab=pending" />
              <Metric label="Active jobs" value={formatQty(d.ops.activeJobs)} sub={d.ops.draftJobs ? `${d.ops.draftJobs} draft not sent` : "In progress"} href="/jobs?status=active" />
              <Metric label="Overdue jobs" value={formatQty(d.ops.overdueJobs)} tone={d.ops.overdueJobs ? "danger" : "fg"} sub="Past expected return" href="/jobs?status=overdue" />
              <Metric label="Clients holding pieces" value={formatQty(d.ops.clientsWithPending)} sub="Have your material" href="/reports?tab=pending" />
            </MetricStrip>
          )}
        </Section>

        <Section title="Money">
          {!d ? (
            <Skeleton className="h-[86px] rounded-lg" />
          ) : (
            <MetricStrip className="grid-cols-2 lg:grid-cols-4">
              <Metric label="Work completed" value={formatINR(d.money.completedValuePaise)} sub={d.money.unbilledPaise ? `${formatINR(d.money.unbilledPaise)} not billed` : "All billed"} href="/invoices/new" />
              <Metric label="Billed" value={formatINR(d.money.billedPaise)} sub="Total of invoices" href="/invoices" />
              <Metric label="Received" value={formatINR(d.money.paidPaise)} sub="Payments in" href="/payments" />
              <Metric label="Outstanding" value={formatINR(d.money.outstandingPaise)} tone={d.money.outstandingPaise ? "danger" : "fg"} sub="Still to collect" href="/reports?tab=outstanding" />
            </MetricStrip>
          )}
        </Section>
      </div>

      {!d ? (
        <Card>
          <LoadingBlock />
        </Card>
      ) : (
        <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
          <Section title="Who has my material" action={<MoreLink href="/reports?tab=pending">Full report</MoreLink>}>
            <ListPanel empty={d.clientsPending.length === 0 && "Everything is back."}>
              {d.clientsPending.slice(0, 6).map((c) => (
                <li key={c.clientId}>
                  <Link href={`/clients/${c.clientId}`} className={rowCls}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{c.clientName}</div>
                      <div className="num text-xs text-fg-muted">
                        {c.jobs} job{c.jobs > 1 ? "s" : ""} · {formatINR(c.pendingValuePaise)} of work
                      </div>
                    </div>
                    <div className="num text-right text-[13px] font-medium text-warning">
                      {formatQty(c.pending)} <span className="text-xs font-normal text-fg-muted">pcs</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ListPanel>
          </Section>

          <Section title="Overdue jobs" action={d.overdue.length > 0 && <MoreLink href="/jobs?status=overdue" />}>
            <ListPanel empty={d.overdue.length === 0 && "No overdue jobs."}>
              {d.overdue.slice(0, 6).map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className={rowCls}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">
                        <span className="num font-medium text-fg">{j.jobNumber}</span>
                        <span className="text-fg-muted"> · {j.client.name}</span>
                      </div>
                      <div className="num text-xs text-danger">Due {formatDate(j.expectedReturnDate)}</div>
                    </div>
                    <div className="num text-right text-[13px] font-medium">
                      {formatQty(j.totals.pending)} <span className="text-xs font-normal text-fg-muted">pending</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ListPanel>
          </Section>

          <Section title="Designs still pending" description="Across open jobs">
            {d.designsPending.length === 0 ? (
              <ListPanel empty="No designs pending.">{null}</ListPanel>
            ) : (
              <Card className="overflow-hidden py-1">
                <ul>
                  {d.designsPending.slice(0, 8).map((x) => {
                    const max = d.designsPending[0].pending || 1;
                    return (
                      <li key={x.designId}>
                        <Link href={`/jobs?designId=${x.designId}&status=open`} className="group block px-4 py-2 transition-colors duration-100 hover:bg-surface-2">
                          <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="min-w-0 truncate font-medium">
                              {x.designName}{" "}
                              <span className="font-normal text-fg-muted">
                                · {x.jobs} job{x.jobs > 1 ? "s" : ""}
                              </span>
                            </span>
                            <span className="num font-medium">{formatQty(x.pending)}</span>
                          </div>
                          <div className="mt-1.5 h-[3px] rounded-full bg-surface-3">
                            <div className="h-full rounded-full bg-warning-solid" style={{ width: `${(x.pending / max) * 100}%` }} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </Section>

          <Section title="Ready to bill" description="Completed, not billed">
            <ListPanel empty={d.readyToBill.length === 0 && "Nothing waiting to be billed."}>
              {d.readyToBill.slice(0, 6).map((r) => (
                <li key={r.clientId} className="flex min-h-11 items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{r.clientName}</div>
                    <div className="num text-xs text-fg-muted">{formatQty(r.qty)} pieces</div>
                  </div>
                  <div className="num text-[13px] font-medium">{formatINR(r.valuePaise)}</div>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/invoices/new?clientId=${r.clientId}`}>Bill</Link>
                  </Button>
                </li>
              ))}
            </ListPanel>
          </Section>
        </div>
      )}

      {d && d.recentActivity.length > 0 && (
        <Section title="Recent activity">
          <ListPanel>
            {d.recentActivity.map((a, i) => (
              <li key={i}>
                <Link href={a.href} className="flex min-h-10 items-center justify-between gap-4 px-4 py-2 text-[13px] transition-colors duration-100 hover:bg-surface-2">
                  <span className="min-w-0 text-fg-2">{a.text}</span>
                  <span className="num shrink-0 text-xs text-fg-muted">{formatDate(a.at)}</span>
                </Link>
              </li>
            ))}
          </ListPanel>
        </Section>
      )}
    </div>
  );
}
