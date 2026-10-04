"use client";

import { exceedsPending, formatDate, formatINR, formatQty, todayISO, type JobDetail, type JobListRow, type ReturnResult } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, PackageCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { JobStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, ErrorBlock, FlowBar, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LineState {
  ok: string;
  damaged: string;
  rejected: string;
  lost: string;
  reason: string;
  showIssues: boolean;
}
const emptyLine: LineState = { ok: "", damaged: "", rejected: "", lost: "", reason: "", showIssues: false };
const n = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

function RecordReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const jobId = params.get("job") ?? "";
  const openJobs = useQuery({ queryKey: ["jobs", "pending"], queryFn: () => api.get<JobListRow[]>("/jobs?pending=true") });
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api.get<JobDetail>(`/jobs/${jobId}`), enabled: !!jobId });
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<ReturnResult | null>(null);

  useEffect(() => {
    setLines({});
    setResult(null);
  }, [jobId]);

  const items = job.data?.items ?? [];
  const get = (id: string) => lines[id] ?? emptyLine;
  const set = (id: string, patch: Partial<LineState>) => setLines((ls) => ({ ...ls, [id]: { ...get(id), ...patch } }));

  const calc = useMemo(() => {
    let received = 0,
      ok = 0,
      value = 0;
    const over: string[] = [];
    for (const it of items) {
      const l = get(it.id);
      const line = { okQty: n(l.ok), damagedQty: n(l.damaged), rejectedQty: n(l.rejected), lostQty: n(l.lost) };
      const tot = line.okQty + line.damagedQty + line.rejectedQty + line.lostQty;
      received += tot;
      ok += line.okQty;
      value += line.okQty * it.ratePaise;
      if (tot > 0 && exceedsPending(it.pending, line)) over.push(it.id);
    }
    return { received, ok, value, over };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, items]);

  const save = useMutation({
    mutationFn: () =>
      api.post<ReturnResult>(`/jobs/${jobId}/returns`, {
        date,
        notes,
        lines: items.map((it) => {
          const l = get(it.id);
          return { jobItemId: it.id, okQty: n(l.ok), damagedQty: n(l.damaged), rejectedQty: n(l.rejected), lostQty: n(l.lost), exceptionReason: l.reason || null };
        }),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      setResult(r);
      setLines({});
      setNotes("");
      toast.success(`${formatQty(r.receivedNow)} pieces recorded on ${r.job.jobNumber}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });

  const missingReason = calc.over.some((id) => !get(id).reason.trim());
  const jobOptions = (openJobs.data ?? []).map((j) => ({
    value: j.id,
    label: `${j.jobNumber} · ${j.client.name}`,
    sub: `${j.product.name} · ${formatQty(j.totals.pending)} pending · ${j.designs.join(", ")}`,
    keywords: [j.client.name, j.product.name, ...j.designs],
  }));
  // Keep the selected job visible even if it just completed
  if (job.data && !jobOptions.some((o) => o.value === job.data.id)) jobOptions.unshift({ value: job.data.id, label: `${job.data.jobNumber} · ${job.data.client.name}`, sub: job.data.product.name, keywords: [] });

  return (
    <>
      <PageHeader title="Record a return" subtitle="Enter how many pieces came back for each design." />

      {result && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-success/25 bg-success-subtle px-4 py-3 animate-[pop-in_150ms_ease-out]">
          <div className="flex min-w-0 items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="min-w-0">
              <div className="num text-[13px] font-semibold text-fg">
                {formatQty(result.receivedNow)} pieces received on {result.job.jobNumber}
                {result.justCompleted && <span className="font-medium text-success"> · Job completed</span>}
              </div>
              <div className="num mt-0.5 text-xs text-fg-2">
                {result.job.totals.pending > 0 ? (
                  <>
                    Still pending: <span className="font-medium text-fg">{formatQty(result.job.totals.pending)}</span> ({result.job.items.filter((i) => i.pending > 0).map((i) => `${i.designName} ${i.pending}`).join(", ")})
                  </>
                ) : (
                  "Nothing pending on this job."
                )}{" "}
                · Work done now: <span className="font-medium text-fg">{formatINR(result.okValueNowPaise)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={`/jobs/${result.job.id}`}>Open job</Link>
            </Button>
            {result.job.totals.unbilledQty > 0 &&
              (result.billingPolicy === "AFTER_EACH_RETURN" || (result.billingPolicy === "AFTER_COMPLETION" && result.justCompleted) || result.billingPolicy === "MANUAL") && (
                <Button asChild variant={result.billingPolicy === "MANUAL" ? "secondary" : "primary"}>
                  <Link href={`/bills/new?jobId=${result.job.id}`}>
                    <Wallet /> Pay {formatINR(result.job.totals.unbilledValuePaise)} now
                  </Link>
                </Button>
              )}
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-[minmax(0,28rem)_10rem]">
        <Field label="Job">
          <Combobox
            autoFocus={!jobId}
            options={jobOptions}
            value={jobId}
            onChange={(id) => router.replace(`/returns/new?job=${id}`, { scroll: false })}
            placeholder={openJobs.isPending ? "Loading…" : "Search job no. or client"}
            emptyText="No jobs with pending pieces"
          />
        </Field>
        <Field label="Date received">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {!jobId ? (
        openJobs.data && openJobs.data.length === 0 ? (
          <Card>
            <EmptyState icon={PackageCheck} title="Nothing is outside">
              All material is back. New jobs show up here once sent.
            </EmptyState>
          </Card>
        ) : (
          <Section title="Jobs with pieces outside">
            <Card className="overflow-hidden">
              {openJobs.isPending ? (
                <LoadingBlock rows={3} />
              ) : (
                <ul className="divide-y divide-border">
                  {(openJobs.data ?? []).map((j) => (
                    <li key={j.id}>
                      <button onClick={() => router.replace(`/returns/new?job=${j.id}`, { scroll: false })} className="flex min-h-12 w-full items-center gap-4 px-4 py-2 text-left transition-colors duration-100 hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px]">
                            <span className="font-medium">{j.jobNumber}</span>
                            <span className="text-fg-muted"> · {j.client.name}</span>
                          </div>
                          <div className="num truncate text-xs text-fg-muted">
                            {j.product.name} · {j.designs.join(", ")} · sent {formatDate(j.jobDate)}
                          </div>
                        </div>
                        <div className="num text-right text-[13px] font-medium text-warning">
                          {formatQty(j.totals.pending)} <span className="text-xs font-normal text-fg-muted">pending</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>
        )
      ) : job.isPending ? (
        <Card className="overflow-hidden">
          <LoadingBlock />
        </Card>
      ) : job.isError ? (
        <ErrorBlock error={job.error} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (calc.received === 0) return toast.error("Enter at least one quantity");
            if (missingReason) return toast.error("Some quantities are more than pending. Add a reason or correct them.");
            save.mutate();
          }}
          className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem]"
        >
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3">
                  <h2 className="text-[13px] font-semibold">
                    {job.data.jobNumber} · {job.data.client.name}
                  </h2>
                  <JobStatusBadge status={job.data.status} />
                </div>
                <p className="num text-xs text-fg-muted">
                  {job.data.product.name} · sent {formatDate(job.data.jobDate)}
                </p>
              </div>
              {job.data.totals.pending > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setLines(Object.fromEntries(items.map((it) => [it.id, { ...get(it.id), ok: it.pending ? String(it.pending) : "" }])))}
                >
                  Everything came back
                </Button>
              )}
            </div>
            <Card className="overflow-hidden">
              <div className="hidden h-[34px] grid-cols-[minmax(0,1fr)_4rem_5rem_4.5rem_8.5rem] items-center gap-3 border-b border-border px-4 text-xs font-medium text-fg-muted sm:grid">
                <span>Design</span>
                <span className="text-right">Sent</span>
                <span className="text-right">Back so far</span>
                <span className="text-right">Pending</span>
                <span className="text-right">Received now</span>
              </div>
              <ul className="divide-y divide-border">
                {items.map((it) => {
                  const l = get(it.id);
                  const over = calc.over.includes(it.id);
                  const after = Math.max(0, it.pending - n(l.ok) - n(l.damaged) - n(l.rejected) - n(l.lost));
                  const issues = n(l.damaged) + n(l.rejected) + n(l.lost);
                  return (
                    <li key={it.id} className={cn("px-4 py-2.5", it.pending === 0 && !n(l.ok) && "bg-surface-2/40")}>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_4rem_5rem_4.5rem_8.5rem]">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{it.designName}</div>
                          <div className="num text-xs text-fg-muted sm:hidden">
                            Sent {it.sent} · back {it.ok + it.exceptions} · <span className="font-medium text-warning">pending {it.pending}</span>
                          </div>
                          <FlowBar className="mt-1.5 hidden max-w-28 sm:flex" sent={it.sent} ok={it.ok + n(l.ok)} exceptions={it.exceptions + issues} pending={after} />
                        </div>
                        <div className="num hidden text-right text-[13px] text-fg-muted sm:block">{formatQty(it.sent)}</div>
                        <div className="num hidden text-right text-[13px] text-fg-muted sm:block">{formatQty(it.ok + it.exceptions)}</div>
                        <div className="num hidden text-right text-[13px] sm:block">
                          {it.pending > 0 ? <span className="font-medium text-warning">{formatQty(it.pending)}</span> : <span className="text-fg-muted">0 ✓</span>}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {it.pending > 0 && (
                            <button type="button" className="h-7 rounded px-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg" onClick={() => set(it.id, { ok: String(it.pending) })} title="All pending pieces">
                              All
                            </button>
                          )}
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={l.ok}
                            onChange={(e) => set(it.id, { ok: e.target.value })}
                            aria-invalid={over}
                            aria-label={`${it.designName} received now`}
                            className="num h-9 w-20 text-right text-sm font-medium pointer-coarse:h-10"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          aria-expanded={l.showIssues}
                          onClick={() => set(it.id, { showIssues: !l.showIssues })}
                          className="-ml-1 inline-flex h-6 items-center gap-1 rounded px-1 text-xs text-fg-muted transition-colors hover:text-fg"
                        >
                          <ChevronDown className={cn("size-3 transition-transform duration-150", l.showIssues && "rotate-180")} />
                          Damaged / rejected / lost
                          {issues > 0 && <span className="num text-danger">({issues})</span>}
                        </button>
                        {(n(l.ok) > 0 || issues > 0) && !over && (
                          <span className="num text-xs text-fg-muted">
                            After this: <span className={cn("font-medium", after ? "text-warning" : "text-success")}>{after} pending</span>
                          </span>
                        )}
                      </div>
                      {l.showIssues && (
                        <div className="mt-2 mb-1 grid grid-cols-3 gap-2 sm:max-w-sm">
                          {(["damaged", "rejected", "lost"] as const).map((k) => (
                            <Field key={k} label={<span className="text-xs capitalize">{k}</span>}>
                              <Input type="number" inputMode="numeric" min={0} value={l[k]} onChange={(e) => set(it.id, { [k]: e.target.value })} className="num text-right" placeholder="0" />
                            </Field>
                          ))}
                          <p className="col-span-3 text-xs text-fg-muted">Kept separate from good pieces and not paid for.</p>
                        </div>
                      )}
                      {over && (
                        <div className="mt-2 mb-1 rounded-md border border-warning/30 bg-warning-subtle p-2.5">
                          <div className="num flex items-center gap-1.5 text-xs font-medium text-fg">
                            <AlertTriangle className="size-3.5 text-warning" /> Only {it.pending} pending, but {n(l.ok) + issues} entered.
                          </div>
                          <Input className="mt-2" value={l.reason} onChange={(e) => set(it.id, { reason: e.target.value })} placeholder="Reason to record it anyway" aria-label={`Reason for ${it.designName}`} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <Card>
              <div className="border-b border-border px-4 py-3">
                <div className="text-xs text-fg-muted">Received now</div>
                <div className="num mt-0.5 text-2xl leading-8 font-semibold tracking-[-0.01em]">{formatQty(calc.received)}</div>
                {calc.received !== calc.ok && <div className="num text-xs text-danger">{formatQty(calc.received - calc.ok)} damaged/rejected/lost</div>}
              </div>
              <dl className="space-y-1.5 px-4 py-3 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Pending before</dt>
                  <dd className="num font-medium">{formatQty(job.data.totals.pending)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Pending after</dt>
                  <dd className="num font-medium text-warning">{formatQty(Math.max(0, job.data.totals.pending - calc.received))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Work value done</dt>
                  <dd className="num font-medium">{formatINR(calc.value)}</dd>
                </div>
              </dl>
              <div className="space-y-3 border-t border-border p-3">
                <Field label="Notes">
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. challan no." />
                </Field>
                <Button type="submit" size="lg" className="w-full" loading={save.isPending} disabled={calc.received === 0}>
                  Save return
                </Button>
              </div>
            </Card>
          </aside>
        </form>
      )}
    </>
  );
}

export default function RecordReturnPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <RecordReturn />
    </Suspense>
  );
}
