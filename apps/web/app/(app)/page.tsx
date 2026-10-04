"use client";

import { formatDate, formatINR, formatQty, type Dashboard } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, PackageCheck, Plus, ReceiptText, Shirt, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Tile({ label, value, sub, href, tone = "ink", delay = 0 }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: "ink" | "marigold" | "madder" | "leaf" | "indigo"; delay?: number }) {
  const body = (
    <div className="group h-full rounded-[var(--radius-card)] border border-line bg-card p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)] animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between text-[0.8rem] font-semibold tracking-wide text-muted uppercase">
        {label}
        {href && <ArrowRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-indigo" />}
      </div>
      <div className={cn("num mt-2 font-display text-[2.4rem] leading-none font-semibold tracking-tight", { ink: "text-ink", marigold: "text-marigold-700", madder: "text-madder", leaf: "text-leaf", indigo: "text-indigo" }[tone])}>{value}</div>
      {sub && <div className="mt-2 text-sm text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export default function DashboardPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard") });
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const empty = d && d.ops.activeJobs === 0 && d.ops.draftJobs === 0 && d.money.billedPaise === 0 && d.recentActivity.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <div className="text-sm font-semibold tracking-[0.12em] text-marigold-700 uppercase">{formatDate(new Date())}</div>
          <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-tight">{greeting()}.</h1>
          <p className="text-muted">
            {d ? (
              d.ops.piecesOutside > 0 ? (
                <>
                  <b className="text-ink">{formatQty(d.ops.piecesOutside)} pieces</b> are with {d.ops.clientsWithPending} client{d.ops.clientsWithPending === 1 ? "" : "s"} right now.
                </>
              ) : (
                "All your material is back in hand."
              )
            ) : (
              <Skeleton className="h-5 w-64" />
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="accent" size="lg"><Link href="/returns/new"><PackageCheck /> Record Return</Link></Button>
          <Button asChild size="lg"><Link href="/jobs/new"><Plus /> New Job</Link></Button>
        </div>
      </div>

      {empty && (
        <Card>
          <EmptyState icon={Shirt} title="Let's send out your first job" action={<Button asChild size="lg"><Link href="/jobs/new"><Plus /> Create first job</Link></Button>}>
            Pick a client, choose the product, and add each design with its quantity and rate. We will track every piece until it comes back and is paid for.
          </EmptyState>
        </Card>
      )}

      {/* Operations */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-muted uppercase"><Briefcase className="size-4" /> Material</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {!d ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-[var(--radius-card)]" />) : (
            <>
              <Tile label="Pieces outside" value={formatQty(d.ops.piecesOutside)} tone={d.ops.piecesOutside ? "marigold" : "leaf"} sub="sent but not back" href="/reports?tab=pending" />
              <Tile label="Active jobs" value={d.ops.activeJobs} sub={d.ops.draftJobs ? `${d.ops.draftJobs} draft not sent` : "in progress"} href="/jobs?status=active" delay={40} />
              <Tile label="Overdue jobs" value={d.ops.overdueJobs} tone={d.ops.overdueJobs ? "madder" : "ink"} sub="past expected return date" href="/jobs?status=overdue" delay={80} />
              <Tile label="Clients with pieces" value={d.ops.clientsWithPending} sub="have your material" href="/reports?tab=pending" delay={120} />
            </>
          )}
        </div>
      </section>

      {/* Money */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-muted uppercase"><ReceiptText className="size-4" /> Money</h2>
        {!d ? <Skeleton className="h-36 rounded-[var(--radius-card)]" /> : (
          <Card className="grid grid-cols-2 divide-line overflow-hidden sm:grid-cols-4 sm:divide-x">
            {[
              { label: "Work completed", value: d.money.completedValuePaise, tone: "text-ink", sub: d.money.unbilledPaise ? `${formatINR(d.money.unbilledPaise)} not billed yet` : "all billed", href: "/invoices/new" },
              { label: "Billed", value: d.money.billedPaise, tone: "text-indigo", sub: "total of invoices", href: "/invoices" },
              { label: "Received", value: d.money.paidPaise, tone: "text-leaf", sub: "payments in", href: "/payments" },
              { label: "Outstanding", value: d.money.outstandingPaise, tone: d.money.outstandingPaise ? "text-madder" : "text-faint", sub: "still to collect", href: "/reports?tab=outstanding" },
            ].map((m, i) => (
              <Link key={m.label} href={m.href} className={cn("group relative p-5 hover:bg-paper", i < 2 && "max-sm:border-b max-sm:border-line", i % 2 === 0 && "max-sm:border-r max-sm:border-line")}>
                <div className="text-[0.8rem] font-semibold tracking-wide text-muted uppercase">{m.label}</div>
                <div className={cn("num mt-2 font-display text-[1.65rem] leading-none font-semibold tracking-tight sm:text-[2rem]", m.tone)}>{formatINR(m.value)}</div>
                <div className="mt-2 text-sm text-muted">{m.sub}</div>
                {i < 3 && <ArrowRight className="absolute top-1/2 -right-2.5 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-card p-0.5 text-faint sm:block" />}
              </Link>
            ))}
          </Card>
        )}
      </section>

      {!d ? <LoadingBlock /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Who has my material?" description="Pieces still with each client" action={<Link href="/reports?tab=pending" className="text-sm font-semibold text-indigo hover:underline">Full report</Link>} />
            {d.clientsPending.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Nobody – everything is back.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.clientsPending.slice(0, 6).map((c) => (
                  <li key={c.clientId}>
                    <Link href={`/clients/${c.clientId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                      <Users className="size-4 text-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{c.clientName}</div>
                        <div className="text-sm text-muted">{c.jobs} job{c.jobs > 1 ? "s" : ""} · work worth {formatINR(c.pendingValuePaise)}</div>
                      </div>
                      <div className="num font-display text-xl font-semibold text-marigold-700">{formatQty(c.pending)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Overdue jobs" description="Past their expected return date" />
            {d.overdue.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No overdue jobs. 👍</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.overdue.slice(0, 6).map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                      <AlertTriangle className="size-4 text-madder" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold"><span className="text-indigo">{j.jobNumber}</span> · {j.client.name}</div>
                        <div className="flex items-center gap-1 text-sm text-madder"><CalendarClock className="size-3.5" /> due {formatDate(j.expectedReturnDate)}</div>
                      </div>
                      <div className="text-right"><div className="num font-semibold">{formatQty(j.totals.pending)}</div><div className="text-xs text-muted">pending</div></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Designs still pending" description="Across all open jobs" />
            {d.designsPending.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No designs pending.</p>
            ) : (
              <ul className="space-y-3 px-5 pb-5">
                {d.designsPending.slice(0, 8).map((x) => {
                  const max = d.designsPending[0].pending || 1;
                  return (
                    <li key={x.designId}>
                      <Link href={`/jobs?designId=${x.designId}&status=open`} className="group block">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold group-hover:text-indigo">{x.designName} <span className="font-normal text-muted">· {x.jobs} job{x.jobs > 1 ? "s" : ""}</span></span>
                          <span className="num font-semibold text-marigold-700">{formatQty(x.pending)}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-paper-2"><div className="h-full rounded-full bg-marigold" style={{ width: `${(x.pending / max) * 100}%` }} /></div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Ready to bill" description="Completed work not billed yet" />
            {d.readyToBill.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">Nothing waiting to be billed.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {d.readyToBill.slice(0, 6).map((r) => (
                  <li key={r.clientId} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{r.clientName}</div>
                      <div className="text-sm text-muted">{formatQty(r.qty)} pieces</div>
                    </div>
                    <div className="num font-semibold">{formatINR(r.valuePaise)}</div>
                    <Button asChild size="sm" variant="secondary"><Link href={`/invoices/new?clientId=${r.clientId}`}>Bill</Link></Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {d && d.recentActivity.length > 0 && (
        <Card>
          <CardHeader title="Recent activity" />
          <ul className="divide-y divide-line border-t border-line">
            {d.recentActivity.map((a, i) => (
              <li key={i}>
                <Link href={a.href} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-paper">
                  <span>{a.text}</span>
                  <span className="shrink-0 text-muted">{formatDate(a.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
