"use client";

import { formatDate, formatINR, L, todayISO } from "@av/shared";
import { PackageCheck, Plus, Shirt } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AnalyticsCharts } from "@/components/charts/analytics";
import { AttentionList, KpiCards, MaterialHolders, RecentPhotos, TodayReturns } from "@/components/dashboard/panels";
import { TrendPanel } from "@/components/dashboard/trends";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { EmptyState, ErrorBlock, LoadingBlock, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { Tabs } from "@/components/ui/tabs";
import { DateRange } from "@/components/ui/toolbar";
import { useDashboard, useDashboardCharts, type DateRangeValue } from "@/lib/reports";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function MoreLink({ href, children = "View all" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-fg-muted transition-colors hover:text-fg">
      {children}
    </Link>
  );
}

type Preset = "all" | "month" | "90d" | "year" | "custom";

function presetRange(p: Preset): DateRangeValue {
  const t = todayISO();
  const d = new Date(`${t}T00:00:00Z`);
  if (p === "month") return { from: `${t.slice(0, 8)}01`, to: t };
  if (p === "90d") return { from: new Date(d.getTime() - 89 * 86400000).toISOString().slice(0, 10), to: t };
  if (p === "year") {
    // Indian financial year: 1 April – 31 March.
    const y = +t.slice(0, 4) - (+t.slice(5, 7) < 4 ? 1 : 0);
    return { from: `${y}-04-01`, to: t };
  }
  return {};
}

function RangePicker({ preset, range, onChange, allowAll = true }: { preset: Preset; range: DateRangeValue; onChange: (p: Preset, r: DateRangeValue) => void; allowAll?: boolean }) {
  const options: { value: Preset; label: string }[] = [
    ...(allowAll ? [{ value: "all" as const, label: "All time" }] : []),
    { value: "month", label: "This month" },
    { value: "90d", label: "90 days" },
    { value: "year", label: "This FY" },
    { value: "custom", label: "Custom" },
  ];
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Segmented label="Period" value={preset} onChange={(p) => onChange(p, p === "custom" ? range : presetRange(p))} options={options} className="max-w-full overflow-x-auto" />
      {preset === "custom" && <DateRange from={range.from ?? ""} to={range.to ?? ""} onFrom={(v) => onChange("custom", { ...range, from: v || undefined })} onTo={(v) => onChange("custom", { ...range, to: v || undefined })} />}
    </div>
  );
}

/** The last twelve months, this one included. */
function last12(): DateRangeValue {
  const t = todayISO();
  const y = +t.slice(0, 4);
  const m = +t.slice(5, 7) - 11;
  const from = m > 0 ? `${y}-${String(m).padStart(2, "0")}-01` : `${y - 1}-${String(m + 12).padStart(2, "0")}-01`;
  return { from, to: t };
}

const rise = (i: number) => ({ className: "rise", style: { "--i": i } as React.CSSProperties });

function Trends() {
  const [range] = useState(last12);
  const q = useDashboardCharts(range);
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  return !q.data ? <Skeleton className="h-[330px] rounded-lg" /> : <TrendPanel c={q.data} />;
}

function Overview() {
  const [preset, setPreset] = useState<Preset>("all");
  const [range, setRange] = useState<DateRangeValue>({});
  const q = useDashboard(range);
  const d = q.data;
  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const ranged = !!(range.from || range.to);
  const empty = d && d.ops.activeJobs === 0 && d.ops.draftJobs === 0 && d.money.completedValuePaise === 0 && d.recentActivity.length === 0;

  return (
    <div className="space-y-8">
      {empty && (
        <Card>
          <EmptyState
            icon={Shirt}
            title={`No ${L.jobs.toLowerCase()} yet`}
            action={
              <Button asChild>
                <Link href="/jobs/new">
                  <Plus /> Create first {L.job.toLowerCase()}
                </Link>
              </Button>
            }
          >
            Pick a {L.client.toLowerCase()} and material, then add each design with its quantity and rate. Every piece is tracked until it&apos;s back and paid for.
          </EmptyState>
        </Card>
      )}

      <div {...rise(0)}>
        <Section
          title="Key figures"
          description={ranged ? `Work and payments ${range.from ? formatDate(range.from) : "…"} – ${range.to ? formatDate(range.to) : "today"}` : undefined}
          action={
            <RangePicker
              preset={preset}
              range={range}
              onChange={(p, r) => {
                setPreset(p);
                setRange(r);
              }}
            />
          }
        >
          {!d ? <Skeleton className="h-[188px] rounded-lg" /> : <KpiCards k={d.kpis} ranged={ranged} />}
        </Section>
      </div>

      <div {...rise(1)}>
        <Section title="Trends" description="Last 12 months" action={<MoreLink href="/?tab=analytics">More charts</MoreLink>}>
          <Trends />
        </Section>
      </div>

      <div {...rise(2)}>
        <Section title="Attention required" description={d && d.attention.length ? `${d.attention.length} thing${d.attention.length === 1 ? "" : "s"} to look at` : undefined}>
          {!d ? <Skeleton className="h-36 rounded-lg" /> : <AttentionList items={d.attention} />}
        </Section>
      </div>

      <div {...rise(3)}>
        <Section title="Who has my material?" description="Pending with each worker, oldest first" action={<MoreLink href="/reports?report=material-outside">Full report</MoreLink>}>
          {!d ? (
            <Card>
              <LoadingBlock rows={4} />
            </Card>
          ) : (
            <MaterialHolders rows={d.materialHolders} />
          )}
        </Section>
      </div>

      <div className="rise grid gap-x-6 gap-y-8 lg:grid-cols-2" style={{ "--i": 4 } as React.CSSProperties}>
        <Section
          title="Who brought material today?"
          description={d ? `${d.todayReturns.length} line${d.todayReturns.length === 1 ? "" : "s"} · ${formatINR(d.todayReturns.reduce((s, r) => s + r.valuePaise, 0))}` : undefined}
          action={<MoreLink href="/reports?report=arrivals">All of today</MoreLink>}
        >
          {!d ? <Skeleton className="h-40 rounded-lg" /> : <TodayReturns rows={d.todayReturns.slice(0, 10)} />}
        </Section>

        <Section title="Recent activity">
          {!d ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : d.recentActivity.length === 0 ? (
            <Card className="px-4 py-6 text-center text-[13px] text-fg-muted">Nothing yet.</Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {d.recentActivity.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="flex min-h-10 items-center justify-between gap-4 px-4 py-2 text-[13px] transition-colors duration-100 hover:bg-surface-2">
                      <span className="min-w-0 text-fg-2">{a.text}</span>
                      <span className="num shrink-0 text-xs text-fg-muted">{formatDate(a.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>
      </div>

      <div {...rise(5)}>
        <Section title="Recent design returns" action={<MoreLink href="/gallery">Gallery</MoreLink>}>
          {!d ? <Skeleton className="h-48 rounded-lg" /> : <RecentPhotos photos={d.recentPhotos} />}
        </Section>
      </div>
    </div>
  );
}

function Analytics() {
  const [preset, setPreset] = useState<Preset>("year");
  const [range, setRange] = useState<DateRangeValue>(presetRange("year"));
  const q = useDashboardCharts(range);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">{q.data ? `${formatDate(q.data.range.from)} – ${formatDate(q.data.range.to)}` : " "}</p>
        <RangePicker
          preset={preset}
          range={range}
          allowAll={false}
          onChange={(p, r) => {
            setPreset(p);
            setRange(r);
          }}
        />
      </div>
      {q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className={q.isFetching ? "opacity-70 transition-opacity" : undefined}>
          <AnalyticsCharts c={q.data} />
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = params.get("tab") === "analytics" ? "analytics" : "overview";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-fg-muted">{formatDate(new Date())}</div>
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{greeting()}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href="/returns/new">
              <PackageCheck /> Record return
            </Link>
          </Button>
          <Button asChild>
            <Link href="/jobs/new">
              <Plus /> New {L.job.toLowerCase()}
            </Link>
          </Button>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={(v) => router.replace(v === "overview" ? path : `${path}?tab=${v}`, { scroll: false })}
        items={[
          { value: "overview", label: "Overview" },
          { value: "analytics", label: "Analytics" },
        ]}
      />
      {tab === "overview" ? <Overview /> : <Analytics />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Dashboard />
    </Suspense>
  );
}

