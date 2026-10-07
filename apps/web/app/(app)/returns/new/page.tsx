"use client";

import { formatDate, formatINR, formatQty, L, PAYMENT_POLICY_LABEL, roundQty, todayISO, type JobItemView, type PayableFlags, type PaymentMethod, type ReturnDetail, type ReturnResult } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, ChevronDown, PackageCheck, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChoiceCards, MethodChips } from "@/components/returns/method-chips";
import { PhotoButtons, PhotoGrid, usePhotoQueue } from "@/components/returns/photo-uploader";
import { initLine, lineCalc, ReturnLineCard, type LineState } from "@/components/returns/return-line-card";
import { ReturnSuccess } from "@/components/returns/return-success";
import { JobStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { SearchInput } from "@/components/ui/toolbar";
import { api, ApiError } from "@/lib/api";
import { useSettings } from "@/lib/queries";
import { newIdempotencyKey, rupeesInput, useIsManager, useJob, useOpenJobs } from "@/lib/returns";
import { cn } from "@/lib/utils";

type PayMode = "full" | "partial" | "none";

function StepTitle({ n, children, aside }: { n: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="num grid size-6 place-items-center rounded-full bg-fg text-xs font-semibold text-bg">{n}</span>
        {children}
      </h2>
      {aside}
    </div>
  );
}

function RecordReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const jobId = params.get("job") ?? "";
  const openJobs = useOpenJobs();
  const job = useJob(jobId);
  const settings = useSettings();
  const isManager = useIsManager();
  const photos = usePhotoQueue();

  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("none");
  const [partial, setPartial] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [needsAdvance, setNeedsAdvance] = useState(false);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [showErrors, setShowErrors] = useState(false);
  const [noPhotoOpen, setNoPhotoOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ r: ReturnResult; date: string; lineIdFor: (tag: string | null) => string | null } | null>(null);
  const paymentRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setLines({});
    setNotes("");
    setPartial("");
    setReference("");
    setAdvanceReason("");
    setNeedsAdvance(false);
    setShowErrors(false);
    setIdemKey(newIdempotencyKey());
    photos.clear();
  };

  // A different challan starts a fresh form.
  useEffect(() => {
    resetForm();
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Default the payment choice from the challan's terms: "Immediate" means pay now.
  useEffect(() => {
    if (job.data) setPayMode(job.data.terms.policy === "IMMEDIATE" ? "full" : "none");
  }, [job.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaults: PayableFlags = {
    payDamaged: settings.data?.payDamagedDefault ?? false,
    payRejected: settings.data?.payRejectedDefault ?? false,
    payLost: settings.data?.payLostDefault ?? false,
  };
  const items = useMemo(() => job.data?.items ?? [], [job.data]);
  const get = (it: JobItemView) => lines[it.id] ?? initLine(it);
  const set = (it: JobItemView, patch: Partial<LineState>) => setLines((ls) => ({ ...ls, [it.id]: { ...(ls[it.id] ?? initLine(it)), ...patch } }));

  const calcs = items.map((it) => ({ it, l: get(it), c: lineCalc(it, get(it), defaults, isManager) }));
  const entered = calcs.filter((x) => x.c.total > 0);
  const received = roundQty(entered.reduce((s, x) => s + x.c.total, 0));
  const good = roundQty(entered.reduce((s, x) => s + x.c.line.okQty, 0));
  const value = entered.reduce((s, x) => s + x.c.amountPaise, 0);
  const pendingBefore = job.data?.totals.pending ?? 0;
  const pendingAfter = roundQty(calcs.reduce((s, x) => s + (x.c.total > 0 ? x.c.after : x.it.pending), 0));
  const earlierOutstanding = job.data?.money.outstandingPaise ?? 0;

  const amountPaise = payMode === "full" ? value : payMode === "partial" ? rupeesInput(partial) : 0;
  const problems: string[] = [];
  if (received === 0) problems.push("Enter at least one quantity");
  if (calcs.some((x) => x.c.hasError)) problems.push("Fix the highlighted quantities or rates");
  if (entered.some((x) => x.c.needsReason)) problems.push("Some quantities are more than pending: add a reason or correct them");
  if (entered.some((x) => x.c.needsPayReason)) problems.push("Give a reason for changing what is paid");
  if (payMode === "partial" && !(amountPaise > 0)) problems.push("Enter the amount paid now");
  if (needsAdvance && amountPaise > 0 && !advanceReason.trim()) problems.push("Give a reason for paying more than is due (advance)");

  const save = useMutation({
    mutationFn: () =>
      api.post<ReturnResult>(`/jobs/${jobId}/returns`, {
        date,
        notes: notes || null,
        // Same key as the payment (different table): a retried submit returns the saved return, never a second one.
        idempotencyKey: idemKey,
        lines: entered.map(({ it, l, c }) => ({
          jobItemId: it.id,
          okQty: c.line.okQty,
          damagedQty: c.line.damagedQty,
          rejectedQty: c.line.rejectedQty,
          lostQty: c.line.lostQty,
          ratePaise: c.ratePaise,
          exceptionReason: c.over ? l.reason.trim() : null,
          ...(isManager && c.overridden ? { ...c.flags, payOverrideReason: l.payReason.trim() } : {}),
        })),
        payment:
          amountPaise > 0
            ? { amountPaise, method, reference: reference || null, advanceReason: advanceReason.trim() || null, idempotencyKey: idemKey }
            : null,
      }),
    onSuccess: async (r) => {
      qc.invalidateQueries();
      // Map design tags to this return's line ids so photos are linked to the right design.
      const byItem = new Map(r.lines.map((ln) => [ln.jobItemId, ln.id]));
      const only = r.lines.length === 1 ? r.lines[0].id : null;
      const lineIdFor = (tag: string | null) => only ?? (tag ? (byItem.get(tag) ?? null) : null);
      setResult({ r, date, lineIdFor });
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(`${r.returnNumber} saved: ${formatQty(r.receivedNow)} ${r.job.unit} on ${r.job.jobNumber}`);
      if (r.voucher && r.voucher.email.status === "failed") toast.warning(`Payment voucher not emailed. ${r.voucher.email.message}`);
      if (photos.items.length) {
        const failed = await photos.uploadAll(r.id, lineIdFor);
        if (failed) toast.error(`${failed} photo${failed === 1 ? "" : "s"} could not be uploaded. Tap Retry.`);
        else toast.success("Photos uploaded");
        qc.invalidateQueries({ queryKey: ["return", r.id] });
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) {
        const d = (e.body.details ?? {}) as { needsAdvanceReason?: boolean; exceeds?: { jobItemId: string }[] };
        if (d.needsAdvanceReason) {
          setNeedsAdvance(true);
          setShowErrors(true);
          paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          return toast.error(e.message);
        }
        if (d.exceeds?.length) {
          setShowErrors(true);
          return toast.error(e.message);
        }
      }
      toast.error(e.message || "Could not save");
    },
  });

  const submit = (confirmedNoPhoto = false) => {
    setShowErrors(true);
    if (problems.length) return toast.error(problems[0]);
    if (!photos.items.length && !confirmedNoPhoto) return setNoPhotoOpen(true);
    setNoPhotoOpen(false);
    save.mutate();
  };

  const retryOne = (key: string) => result && photos.uploadAll(result.r.id, result.lineIdFor, key);
  const retryAll = () => result && photos.uploadAll(result.r.id, result.lineIdFor);

  // ───────────── Success ─────────────
  if (result)
    return (
      <>
        <PageHeader title={`Record ${L.return}`} />
        <ReturnSuccess
          result={result.r}
          date={result.date}
          queue={photos}
          onRetry={retryOne}
          onRetryAll={retryAll}
          onAnother={() => {
            if (photos.items.some((p) => p.status === "uploading")) return toast.error("Wait for the photos to finish uploading");
            if (photos.items.some((p) => p.status === "error")) return toast.error("Some photos failed to upload. Retry them or open the return to add them later.");
            resetForm();
            setResult(null);
            window.scrollTo({ top: 0 });
          }}
        />
      </>
    );

  // ───────────── Step 1: choose challan ─────────────
  if (!jobId) {
    const all = openJobs.data ?? [];
    const s = search.trim().toLowerCase();
    const list = s ? all.filter((j) => [j.jobNumber, j.client.name, j.product.name, ...j.designs].some((x) => x.toLowerCase().includes(s))) : all;
    return (
      <>
        <PageHeader title={`Record ${L.return}`} subtitle="Pick the challan the job worker brought work back for." />
        <StepTitle n={1}>Select {L.job.toLowerCase()}</StepTitle>
        <SearchInput value={search} onChange={setSearch} placeholder="Worker, challan no., product, design…" label="Search challans" className="mb-3 sm:w-96 [&_input]:h-11" />
        <Card className="overflow-hidden">
          {openJobs.isPending ? (
            <LoadingBlock rows={4} />
          ) : openJobs.isError ? (
            <div className="p-4">
              <ErrorBlock error={openJobs.error} onRetry={() => openJobs.refetch()} />
            </div>
          ) : all.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Nothing is outside">
              All material is back. Challans show up here once material is issued.
            </EmptyState>
          ) : list.length === 0 ? (
            <EmptyState icon={Search} title="No matching challan">
              Try the worker&apos;s name or the challan number.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((j) => (
                <li key={j.id}>
                  <button
                    onClick={() => router.replace(`/returns/new?job=${j.id}`, { scroll: false })}
                    className="flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-100 hover:bg-surface-2 active:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{j.client.name}</div>
                      <div className="num truncate text-[13px] text-fg-2">
                        {j.jobNumber} · {j.product.name}
                      </div>
                      <div className="truncate text-xs text-fg-muted">
                        {j.designs.join(", ")} · issued {formatDate(j.jobDate)}
                        {j.overdue && <span className="font-medium text-danger"> · Overdue</span>}
                      </div>
                    </div>
                    <div className="num shrink-0 text-right">
                      <div className="text-[15px] font-semibold text-warning">{formatQty(j.totals.pending)}</div>
                      <div className="text-xs text-fg-muted">{j.unit} pending</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  }

  if (job.isPending)
    return (
      <>
        <PageHeader title={`Record ${L.return}`} />
        <Card className="overflow-hidden">
          <LoadingBlock rows={5} />
        </Card>
      </>
    );
  if (job.isError)
    return (
      <>
        <PageHeader title={`Record ${L.return}`} />
        <ErrorBlock error={job.error} onRetry={() => job.refetch()} />
      </>
    );

  const j = job.data;
  const unit = j.unit;
  const open = calcs.filter((x) => x.it.pending > 0 || x.c.total > 0);
  const done = calcs.filter((x) => !(x.it.pending > 0 || x.c.total > 0));
  const tags = items.length > 1 ? items.map((it) => ({ value: it.id, label: it.designName })) : undefined;

  return (
    <>
      <PageHeader title={`Record ${L.return}`} subtitle="Good quantity, rate, photo and payment, in one step." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
      >
        <div className="min-w-0 space-y-6">
          {/* 1 · Challan */}
          <section>
            <StepTitle
              n={1}
              aside={
                <Button type="button" variant="ghost" onClick={() => router.replace("/returns/new", { scroll: false })} className="min-h-10">
                  Change
                </Button>
              }
            >
              {L.job}
            </StepTitle>
            <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{j.client.name}</div>
                <div className="num flex flex-wrap items-center gap-x-2 text-[13px] text-fg-2">
                  {j.jobNumber} · {j.product.name} <JobStatusBadge status={j.status} overdue={j.overdue} />
                </div>
                <div className="num text-xs text-fg-muted">
                  Issued {formatDate(j.jobDate)} · payment: {PAYMENT_POLICY_LABEL[j.terms.policy]}
                  {j.terms.days > 0 && j.terms.policy !== "IMMEDIATE" && j.terms.policy !== "MANUAL" ? ` (${j.terms.days} days)` : ""}
                </div>
              </div>
              <div className="num text-right">
                <div className="text-lg leading-6 font-semibold text-warning">
                  {formatQty(j.totals.pending)} <span className="text-xs font-normal text-fg-muted">{unit}</span>
                </div>
                <div className="text-xs text-fg-muted">pending</div>
              </div>
            </Card>
          </section>

          {/* 2 · Quantities */}
          <section>
            <StepTitle
              n={2}
              aside={
                j.totals.pending > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-10"
                    onClick={() => setLines((ls) => Object.fromEntries(items.map((it) => [it.id, { ...(ls[it.id] ?? initLine(it)), ok: it.pending ? String(it.pending) : "" }])))}
                  >
                    Everything came back
                  </Button>
                )
              }
            >
              Quantity received
            </StepTitle>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {(open.length ? open : calcs).map(({ it, l, c }) => (
                  <ReturnLineCard key={it.id} item={it} state={l} calc={c} onChange={(p) => set(it, p)} isManager={isManager} defaults={defaults} showErrors={showErrors} />
                ))}
                {open.length > 0 && done.length > 0 && (
                  <li>
                    <button type="button" onClick={() => setShowDone((v) => !v)} className="flex min-h-11 w-full items-center gap-1.5 px-4 text-[13px] text-fg-muted hover:text-fg">
                      <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} />
                      {done.length} design{done.length === 1 ? "" : "s"} fully returned
                    </button>
                  </li>
                )}
                {open.length > 0 &&
                  showDone &&
                  done.map(({ it, l, c }) => (
                    <ReturnLineCard key={it.id} item={it} state={l} calc={c} onChange={(p) => set(it, p)} isManager={isManager} defaults={defaults} showErrors={showErrors} />
                  ))}
              </ul>
            </Card>
            <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Field label="Received date" hint="The exact time is recorded automatically.">
                <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} className="h-11 pointer-coarse:h-11" />
              </Field>
              <Field label="Notes" hint="Optional">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. worker's own slip no." className="h-11 pointer-coarse:h-11" />
              </Field>
            </div>
          </section>

          {/* 3 · Photos */}
          <section>
            <StepTitle n={3} aside={<span className="num text-xs text-fg-muted">{photos.items.length ? `${photos.items.length} selected` : "Required"}</span>}>
              DESIGN / JOB WORK PHOTO
            </StepTitle>
            <Card className={cn("space-y-3 p-4", showErrors && !photos.items.length && "border-warning/50")}>
              <PhotoButtons onFiles={(f) => photos.add(f, null)} hasPhotos={photos.items.length > 0} disabled={save.isPending} />
              {photos.items.length === 0 ? (
                <p className="flex items-start gap-1.5 text-[13px] text-warning">
                  <Camera className="mt-0.5 size-4 shrink-0" /> Take a clear photo of the finished design. Every return should have one.
                </p>
              ) : (
                <>
                  <PhotoGrid queue={photos} tags={tags} />
                  <p className="text-xs text-fg-muted">Photos upload after you save. {tags ? "Pick the design shown in each photo." : ""}</p>
                </>
              )}
            </Card>
          </section>

          {/* 4 · Payment */}
          <section ref={paymentRef}>
            <StepTitle n={4}>Payment</StepTitle>
            <Card className="space-y-4 p-4">
              <ChoiceCards<PayMode>
                label="Payment now"
                value={payMode}
                onChange={(m) => {
                  setPayMode(m);
                  setNeedsAdvance(false);
                }}
                options={[
                  { value: "full", label: "Pay full", sub: formatINR(value) },
                  { value: "partial", label: "Partial", sub: "Enter amount" },
                  { value: "none", label: "No payment now", sub: "₹0" },
                ]}
              />
              {earlierOutstanding > 0 && (
                <p className="num text-xs text-fg-muted">
                  {formatINR(earlierOutstanding)} is already unpaid on this challan from earlier returns.{" "}
                  <button
                    type="button"
                    className="font-medium text-accent hover:underline"
                    onClick={() => {
                      setPayMode("partial");
                      setPartial(String((earlierOutstanding + value) / 100));
                    }}
                  >
                    Pay everything due ({formatINR(earlierOutstanding + value)})
                  </button>
                </p>
              )}
              {payMode === "partial" && (
                <Field label="Amount paid now" required error={showErrors && !(amountPaise > 0) ? "Enter the amount" : undefined}>
                  <MoneyInput value={partial} onChange={(e) => setPartial(e.target.value)} className="h-12 text-lg font-semibold pointer-coarse:h-12" placeholder="0" autoFocus />
                </Field>
              )}
              {payMode !== "none" && (
                <>
                  <MethodChips value={method} onChange={setMethod} />
                  {method !== "CASH" && (
                    <Field label="Reference" hint="Optional">
                      <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." className="h-11 pointer-coarse:h-11" />
                    </Field>
                  )}
                </>
              )}
              {needsAdvance && amountPaise > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning-subtle p-3">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    <AlertTriangle className="size-4 text-warning" /> This is more than is payable. The extra is recorded as an advance.
                  </div>
                  <Input
                    className="mt-2"
                    value={advanceReason}
                    onChange={(e) => setAdvanceReason(e.target.value)}
                    placeholder="Reason for the advance (required)"
                    aria-label="Advance reason"
                    aria-invalid={(showErrors && !advanceReason.trim()) || undefined}
                  />
                </div>
              )}
            </Card>
          </section>
          <div className="h-20 lg:hidden" aria-hidden />
        </div>

        {/* Desktop summary */}
        <aside className="hidden lg:sticky lg:top-8 lg:block lg:self-start">
          <Card>
            <div className="border-b border-border px-4 py-3">
              <div className="text-xs text-fg-muted">Received now</div>
              <div className="num mt-0.5 text-2xl leading-8 font-semibold tracking-[-0.01em]">
                {formatQty(received)} <span className="text-sm font-normal text-fg-muted">{unit}</span>
              </div>
              {received !== good && <div className="num text-xs text-danger">{formatQty(roundQty(received - good))} damaged/rejected/lost</div>}
            </div>
            <dl className="space-y-1.5 px-4 py-3 text-[13px]">
              <Row label="Pending before" value={`${formatQty(pendingBefore)} ${unit}`} />
              <Row label="Pending after" value={`${formatQty(pendingAfter)} ${unit}`} cls="text-warning" />
              <Row label="Work value" value={formatINR(value)} />
              <Row label="Paying now" value={formatINR(amountPaise > 0 ? amountPaise : 0)} />
              <Row label="Photos" value={photos.items.length ? String(photos.items.length) : "None"} cls={photos.items.length ? "" : "text-warning"} />
            </dl>
            <div className="border-t border-border p-3">
              <Button type="submit" size="lg" className="h-11 w-full" loading={save.isPending} disabled={received === 0}>
                Save return
              </Button>
            </div>
          </Card>
        </aside>

        {/* Mobile sticky save bar (sits above the bottom nav) */}
        <div className="no-print fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface/95 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-[1200px] items-center gap-3">
            <div className="num min-w-0 flex-1 leading-tight">
              <div className="text-base font-semibold">{formatINR(value)}</div>
              <div className="truncate text-xs text-fg-muted">
                {formatQty(received)} {unit} · {payMode === "none" || !(amountPaise > 0) ? "no payment" : `paying ${formatINR(amountPaise)}`}
              </div>
            </div>
            <Button type="submit" size="lg" className="h-12 min-w-36 text-[15px]" loading={save.isPending} disabled={received === 0}>
              Save return
            </Button>
          </div>
        </div>
      </form>

      <Dialog
        open={noPhotoOpen}
        onOpenChange={setNoPhotoOpen}
        title="No design photo"
        description="AV Creation keeps a photo of every job work return."
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => submit(true)} loading={save.isPending}>
              Save without photo
            </Button>
            <Button className="min-h-11" onClick={() => setNoPhotoOpen(false)}>
              <Camera /> Add photo
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">You haven&apos;t added a photo of the returned design. You can still save and add photos later from the return page.</p>
      </Dialog>
    </>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={cn("num font-medium", cls)}>{value}</dd>
    </div>
  );
}

export default function RecordReturnPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <RecordReturn />
    </Suspense>
  );
}
