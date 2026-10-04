"use client";

import { formatDate, formatINR, formatQty, JOB_STATUS_LABEL, L, type PublicChallan } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { FileQuestion } from "lucide-react";
import { useParams } from "next/navigation";
import { JobStatusBadge, PayStatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

class PublicError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function load(token: string): Promise<PublicChallan> {
  const res = await fetch(`/api/public/challans/${encodeURIComponent(token)}`, { cache: "no-store", credentials: "omit" });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new PublicError(res.status, data?.message ?? "Could not load this challan");
  return data as PublicChallan;
}

const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

export default function PublicChallanPage() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({ queryKey: ["public-challan", token], queryFn: () => load(token), retry: false, refetchOnWindowFocus: false });

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Invalid message={q.error.message} />
      ) : (
        <ChallanView c={q.data} />
      )}
    </main>
  );
}

function ChallanView({ c }: { c: PublicChallan }) {
  const u = c.unit;
  const notGood = c.totals.damaged + c.totals.rejected + c.totals.lost;
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        {c.business.logo && <img src={c.business.logo} alt="" className="size-12 shrink-0 rounded object-contain" />}
        <div className="min-w-0">
          <div className="truncate text-base leading-6 font-semibold tracking-[-0.01em]">{c.business.name}</div>
          <div className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">{L.jobFull}</div>
        </div>
      </header>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs text-fg-muted">{L.jobNumber}</div>
            <div className="num text-xl leading-7 font-semibold">{c.challanNumber}</div>
          </div>
          <JobStatusBadge status={c.status} overdue={c.overdue} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <Fact label="Date" value={formatDate(c.challanDate)} />
          <Fact label={L.client} value={c.workerName} />
          <Fact label="Product" value={c.product} />
          {c.jobWorkType && <Fact label={L.jobWorkType} value={c.jobWorkType} />}
        </dl>
      </Panel>

      <Panel title="Material">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
          <Figure label="Issued" value={`${formatQty(c.totals.issued)} ${u}`} />
          <Figure label="Received good" value={`${formatQty(c.totals.returned)} ${u}`} tone="text-success" />
          <Figure label="Not good" value={`${formatQty(notGood)} ${u}`} tone={notGood > 0 ? "text-warning" : undefined} />
          <Figure label="Pending" value={`${formatQty(c.totals.pending)} ${u}`} tone={c.totals.pending > 0 ? "text-orange-700 dark:text-orange-300" : undefined} />
        </div>
        {notGood > 0 && (
          <p className="mt-2 text-xs text-fg-muted">
            Damaged {formatQty(c.totals.damaged)} · Rejected {formatQty(c.totals.rejected)} · Lost {formatQty(c.totals.lost)}
          </p>
        )}
      </Panel>

      <Panel title="Design-wise">
        <ul className="-mx-4 divide-y divide-border">
          {c.designs.map((d, i) => (
            <li key={i} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">
                  {d.designName}
                  {d.designCode && <span className="num ml-1.5 text-xs font-normal text-fg-muted">{d.designCode}</span>}
                </span>
                <span className={cn("num text-xs", d.pending > 0 ? "font-medium text-fg-2" : "text-success")}>
                  {d.pending > 0 ? `${formatQty(d.pending)} ${d.unit} pending` : "All back"}
                </span>
              </div>
              <dl className="num mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-xs sm:grid-cols-6">
                <Mini label="Issued" n={d.issued} />
                <Mini label="Good" n={d.returned} />
                <Mini label="Damaged" n={d.damaged} />
                <Mini label="Rejected" n={d.rejected} />
                <Mini label="Lost" n={d.lost} />
                <Mini label="Pending" n={d.pending} />
              </dl>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Payment">
        <div className="mb-3">
          <PayStatusBadge status={c.payStatus} />
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
          <Figure label="Job work value" value={formatINR(c.money.workValuePaise)} />
          <Figure label="Paid" value={formatINR(c.money.paidPaise)} tone="text-success" />
          {c.money.advancePaise > 0 ? (
            <Figure label="Advance" value={formatINR(c.money.advancePaise)} tone="text-warning" />
          ) : (
            <Figure label="Outstanding" value={formatINR(c.money.outstandingPaise)} tone={c.money.outstandingPaise > 0 ? "text-danger" : "text-success"} />
          )}
        </div>
      </Panel>

      <Panel title={`Return history (${c.returns.length})`}>
        {c.returns.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nothing has come back yet.</p>
        ) : (
          <ul className="-mx-4 divide-y divide-border">
            {c.returns.map((r) => (
              <li key={r.returnNumber} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="num text-[13px] font-medium">{r.returnNumber}</div>
                  <div className="num text-xs text-fg-muted">
                    {formatDate(r.date)} · {time.format(new Date(r.receivedAt))}
                  </div>
                </div>
                <div className="num text-right text-xs">
                  <div className="text-[13px] font-medium">{formatINR(r.valuePaise)}</div>
                  <div className="text-fg-muted">
                    {formatQty(r.qty)} {u}
                    {r.okQty !== r.qty && ` (${formatQty(r.okQty)} good)`}
                    {r.ratePaise !== null ? ` @ ${formatINR(r.ratePaise)}` : " · mixed rates"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="pt-2 text-center text-[11px] text-fg-faint">
        Read-only view · {JOB_STATUS_LABEL[c.status]} · Updated {formatDate(c.generatedAt)}, {time.format(new Date(c.generatedAt))}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-4">
      {title && <h2 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-fg-muted uppercase">{title}</h2>}
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-[11px] text-fg-muted">{label}</div>
      <div className={cn("num mt-0.5 text-[15px] font-semibold", tone)}>{value}</div>
    </div>
  );
}

function Mini({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className={cn("font-medium", n === 0 && "text-fg-faint")}>{formatQty(n)}</dd>
    </div>
  );
}

function Loading() {
  return (
    <div aria-busy aria-label="Loading" className="space-y-4">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

function Invalid({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-surface px-6 py-14 text-center">
      <FileQuestion className="mb-3 size-6 text-fg-faint" strokeWidth={1.75} aria-hidden />
      <h1 className="text-sm font-semibold">Challan not available</h1>
      <p className="mt-1 max-w-xs text-[13px] text-fg-muted">{message}</p>
    </div>
  );
}
