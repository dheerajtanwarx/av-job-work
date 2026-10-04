"use client";

import { exceedsPending, formatDate, formatINR, formatQty, todayISO, type JobDetail, type JobListRow, type ReturnResult } from "@av/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, PackageCheck, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { JobStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      <PageHeader eyebrow="Returns" title="Record a return" subtitle="Enter how many pieces came back for each design. We do the maths." />

      {result && (
        <Card className="mb-5 overflow-hidden border-leaf/30 animate-rise">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-leaf-50 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-leaf" />
              <div>
                <div className="font-display text-lg font-semibold text-ink">
                  {formatQty(result.receivedNow)} pieces received on {result.job.jobNumber}
                  {result.justCompleted && <span className="text-leaf"> · Job completed 🎉</span>}
                </div>
                <div className="text-sm text-ink-2">
                  {result.job.totals.pending > 0 ? (
                    <>
                      Still pending: <b>{formatQty(result.job.totals.pending)}</b> ({result.job.items.filter((i) => i.pending > 0).map((i) => `${i.designName} ${i.pending}`).join(", ")})
                    </>
                  ) : (
                    "Nothing pending on this job."
                  )}{" "}
                  · Work done now: <b>{formatINR(result.okValueNowPaise)}</b>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.job.totals.unbilledQty > 0 &&
                (result.billingPolicy === "AFTER_EACH_RETURN" || (result.billingPolicy === "ON_COMPLETION" && result.justCompleted) || result.billingPolicy === "MANUAL") && (
                  <Button asChild variant={result.billingPolicy === "MANUAL" ? "secondary" : "primary"}>
                    <Link href={`/invoices/new?clientId=${result.job.client.id}&jobId=${result.job.id}`}>
                      <ReceiptText /> Bill {formatINR(result.job.totals.unbilledValuePaise)} now
                    </Link>
                  </Button>
                )}
              <Button asChild variant="secondary">
                <Link href={`/jobs/${result.job.id}`}>Open job</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-5 p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Which job came back?">
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
      </Card>

      {!jobId ? (
        <Card>
          {openJobs.data && openJobs.data.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Nothing is outside right now">
              All material is back. When you send a new job, it will show up here.
            </EmptyState>
          ) : (
            <div>
              <div className="px-5 pt-4 pb-2 text-sm font-semibold text-muted">Jobs with pieces outside</div>
              <ul className="divide-y divide-line">
                {(openJobs.data ?? []).map((j) => (
                  <li key={j.id}>
                    <button onClick={() => router.replace(`/returns/new?job=${j.id}`, { scroll: false })} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-paper">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">
                          <span className="text-indigo">{j.jobNumber}</span> · {j.client.name}
                        </div>
                        <div className="truncate text-sm text-muted">{j.product.name} · {j.designs.join(", ")} · sent {formatDate(j.jobDate)}</div>
                      </div>
                      <div className="text-right">
                        <div className="num font-display text-xl font-semibold text-marigold-700">{formatQty(j.totals.pending)}</div>
                        <div className="text-xs text-muted">pending</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {openJobs.isPending && <LoadingBlock rows={3} />}
            </div>
          )}
        </Card>
      ) : job.isPending ? (
        <LoadingBlock />
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
          className="grid gap-5 lg:grid-cols-[1fr_19rem]"
        >
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">{job.data.jobNumber} · {job.data.client.name}</h2>
                  <JobStatusBadge status={job.data.status} />
                </div>
                <p className="text-sm text-muted">{job.data.product.name} · sent {formatDate(job.data.jobDate)}</p>
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
            <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem_9rem] gap-3 border-y border-line bg-card px-5 py-2 text-xs font-semibold tracking-wide text-muted uppercase sm:grid">
              <span>Design</span>
              <span className="text-right">Sent</span>
              <span className="text-right">Back so far</span>
              <span className="text-right">Pending</span>
              <span className="text-right">Received now</span>
            </div>
            <ul className="divide-y divide-line">
              {items.map((it) => {
                const l = get(it.id);
                const over = calc.over.includes(it.id);
                const after = Math.max(0, it.pending - n(l.ok) - n(l.damaged) - n(l.rejected) - n(l.lost));
                return (
                  <li key={it.id} className={cn("px-5 py-3", it.pending === 0 && !n(l.ok) && "bg-paper/50")}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem_9rem]">
                      <div className="min-w-0">
                        <div className="font-semibold">{it.designName}</div>
                        <div className="text-xs text-muted sm:hidden">
                          Sent {it.sent} · back {it.ok + it.exceptions} · <b className="text-marigold-700">pending {it.pending}</b>
                        </div>
                        <FlowBar className="mt-1 hidden max-w-32 sm:flex" sent={it.sent} ok={it.ok + n(l.ok)} exceptions={it.exceptions + n(l.damaged) + n(l.rejected) + n(l.lost)} pending={after} />
                      </div>
                      <div className="num hidden text-right text-muted sm:block">{formatQty(it.sent)}</div>
                      <div className="num hidden text-right text-muted sm:block">{formatQty(it.ok + it.exceptions)}</div>
                      <div className="hidden text-right sm:block">
                        {it.pending > 0 ? <span className="num font-bold text-marigold-700">{formatQty(it.pending)}</span> : <span className="text-leaf">0 ✓</span>}
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={l.ok}
                          onChange={(e) => set(it.id, { ok: e.target.value })}
                          aria-invalid={over}
                          aria-label={`${it.designName} received now`}
                          className="num h-11 w-24 text-right text-lg font-semibold"
                          placeholder="0"
                        />
                        {it.pending > 0 && (
                          <button type="button" className="rounded-md px-1.5 py-1 text-xs font-semibold text-indigo hover:bg-indigo-50" onClick={() => set(it.id, { ok: String(it.pending) })} title="All pending pieces">
                            All
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={() => set(it.id, { showIssues: !l.showIssues })} className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-madder">
                        <ChevronDown className={cn("size-3.5 transition-transform", l.showIssues && "rotate-180")} />
                        Damaged / rejected / lost
                        {n(l.damaged) + n(l.rejected) + n(l.lost) > 0 && <span className="text-madder">({n(l.damaged) + n(l.rejected) + n(l.lost)})</span>}
                      </button>
                      {(n(l.ok) > 0 || n(l.damaged) + n(l.rejected) + n(l.lost) > 0) && !over && (
                        <span className="text-xs text-muted">
                          After this: <b className={after ? "text-marigold-700" : "text-leaf"}>{after} pending</b>
                        </span>
                      )}
                    </div>
                    {l.showIssues && (
                      <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-madder-50/60 p-3 sm:max-w-md">
                        {(["damaged", "rejected", "lost"] as const).map((k) => (
                          <Field key={k} label={<span className="capitalize">{k}</span>}>
                            <Input type="number" inputMode="numeric" min={0} value={l[k]} onChange={(e) => set(it.id, { [k]: e.target.value })} className="num text-right" placeholder="0" />
                          </Field>
                        ))}
                        <p className="col-span-3 text-xs text-madder">These are kept separate from good pieces and are not billed.</p>
                      </div>
                    )}
                    {over && (
                      <div className="mt-2 rounded-lg border border-marigold/40 bg-marigold-50 p-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-marigold-700">
                          <AlertTriangle className="size-4" /> Only {it.pending} pending, but {n(l.ok) + n(l.damaged) + n(l.rejected) + n(l.lost)} entered.
                        </div>
                        <Input className="mt-2" value={l.reason} onChange={(e) => set(it.id, { reason: e.target.value })} placeholder="Reason to record it anyway (e.g. extra pieces returned)" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5">
              <div className="text-sm font-semibold text-muted uppercase">Received now</div>
              <div className="num font-display text-5xl font-semibold text-ink">{formatQty(calc.received)}</div>
              {calc.received !== calc.ok && <div className="text-sm text-madder">{formatQty(calc.received - calc.ok)} damaged/rejected/lost</div>}
              <div className="stitch my-4" />
              <div className="flex justify-between text-sm">
                <span className="text-muted">Pending before</span>
                <span className="num font-semibold">{formatQty(job.data.totals.pending)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted">Pending after</span>
                <span className="num font-semibold text-marigold-700">{formatQty(Math.max(0, job.data.totals.pending - calc.received))}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted">Work value done</span>
                <span className="num font-semibold text-leaf">{formatINR(calc.value)}</span>
              </div>
              <Field label="Notes" className="mt-4">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. challan no." />
              </Field>
              <Button type="submit" size="lg" variant="accent" className="mt-4 w-full" loading={save.isPending} disabled={calc.received === 0}>
                <PackageCheck /> Save return
              </Button>
            </Card>
          </div>
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
