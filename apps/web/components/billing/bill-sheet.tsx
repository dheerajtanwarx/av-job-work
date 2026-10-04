import { amountInWords, formatINR, type Client, type MoneyPosition, type Settings } from "@av/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Printable A4 paper layout shared by Payment Vouchers and Final Settlements.
 * These are payment records for job work – not sales or tax invoices – so no GST is shown or charged.
 * Always renders as paper (`.sheet`) and prints edge to edge on A4.
 */
export function BillSheet({
  business,
  kind,
  title,
  number,
  numberLabel = "Voucher no.",
  date,
  paidTo,
  details,
  stamp,
  signatures = { worker: "Received by", business: "Paid by" },
  children,
}: {
  business: Settings;
  /** Small caps label above the title, e.g. "Job work payment". */
  kind: string;
  /** Document title, e.g. "Payment Voucher". Printed in capitals. */
  title: string;
  number: string;
  numberLabel?: string;
  date: string;
  paidTo: Client;
  /** Right-hand block next to "Paid to": challan / return / payment facts. */
  details: { label: string; value: ReactNode }[];
  stamp?: { label: string; tone: "danger" | "success" };
  /** Signature line captions: the job worker's (left) and the business's (right). */
  signatures?: { worker: string; business: string };
  children: ReactNode;
}) {
  return (
    <article className="sheet print-plain min-w-0 overflow-hidden rounded-lg border border-border">
      <div className="h-1 bg-fg print:h-0.5" aria-hidden />
      <div className="p-5 sm:p-10 print:p-0 print:pt-4">
        {/* Letterhead */}
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-0 items-start gap-4">
            {business.logo && <img src={business.logo} alt="" className="size-14 shrink-0 object-contain" />}
            <div className="min-w-0">
              <div className="text-lg leading-6 font-semibold tracking-[-0.01em]">{business.businessName}</div>
              {business.address && <div className="mt-1 max-w-xs text-xs leading-relaxed whitespace-pre-line text-fg-muted">{business.address}</div>}
              {(business.phone || business.email) && <div className="mt-0.5 text-xs text-fg-muted">{[business.phone, business.email].filter(Boolean).join(" · ")}</div>}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-fg-muted uppercase">{kind}</div>
            <div className="mt-0.5 text-[15px] font-bold tracking-[0.06em] uppercase">{title}</div>
            <dl className="num mt-2 grid grid-cols-[auto_auto] justify-start gap-x-3 gap-y-0.5 text-xs sm:justify-end">
              <dt className="text-fg-muted">{numberLabel}</dt>
              <dd className="font-semibold">{number}</dd>
              <dt className="text-fg-muted">Date</dt>
              <dd className="text-fg-2">{date}</dd>
            </dl>
          </div>
        </header>

        {/* Parties */}
        <div className="mt-8 grid gap-6 rounded-md border border-border sm:grid-cols-2 sm:gap-0">
          <div className="px-4 py-3 sm:border-r sm:border-border">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Paid to (job worker)</div>
            <div className="mt-1 text-sm font-semibold">
              {paidTo.name}
              {paidTo.workerCode && <span className="num ml-2 text-xs font-normal text-fg-muted">{paidTo.workerCode}</span>}
            </div>
            {paidTo.businessName && <div className="text-xs text-fg-2">{paidTo.businessName}</div>}
            {paidTo.address && <div className="mt-0.5 text-xs whitespace-pre-line text-fg-muted">{paidTo.address}</div>}
            {paidTo.phone && <div className="num text-xs text-fg-muted">{paidTo.phone}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs sm:border-t-0">
            {details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-fg-muted">{d.label}</dt>
                <dd className="min-w-0 font-medium break-words text-fg-2">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-8 space-y-8">{children}</div>

        {/* Signatures */}
        <div className="break-inside-avoid">
          <footer className="mt-14 grid grid-cols-2 items-end gap-10 text-xs text-fg-muted print:mt-12">
            <div>
              <div className="border-t border-border-strong pt-1.5">{signatures.worker}</div>
              <div className="text-[11px] text-fg-faint">{paidTo.name}</div>
            </div>
            <div className="text-right">
              {stamp && (
                <div
                  className={cn(
                    "mb-3 inline-block rotate-[-4deg] rounded border-2 px-3 py-1 text-xs font-bold tracking-[0.18em] uppercase",
                    stamp.tone === "danger" ? "border-danger/50 text-danger" : "border-success/50 text-success",
                  )}
                >
                  {stamp.label}
                </div>
              )}
              <div className="border-t border-border-strong pt-1.5">{signatures.business}</div>
              <div className="text-[11px] text-fg-faint">For {business.businessName}</div>
            </div>
          </footer>
          <p className="mt-6 text-center text-[10px] text-fg-faint">Payment record for job work charges. This is not a sales or tax invoice; no GST is charged.</p>
        </div>
      </div>
    </article>
  );
}

/** Section heading inside a sheet. */
export function SheetSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-border pb-1.5">
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-fg-muted uppercase">{title}</h2>
        {aside && <div className="text-xs text-fg-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Grand total in figures and words. */
export function AmountBox({ label, paise, children }: { label: string; paise: number; children?: ReactNode }) {
  return (
    <div className="flex break-inside-avoid flex-wrap items-end justify-between gap-4 rounded-md bg-surface-2 px-4 py-3 print:border print:border-border">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Amount in words</div>
        <div className="mt-0.5 text-[13px] font-medium text-fg-2 italic">{amountInWords(paise)}</div>
        {children}
      </div>
      <div className="text-right">
        <div className="text-xs text-fg-muted">{label}</div>
        <div className="num text-2xl leading-8 font-semibold tracking-[-0.01em]">{formatINR(paise)}</div>
      </div>
    </div>
  );
}

/** Challan account: job work value, paid and outstanding (or advance). */
export function ChallanAccount({ money, className }: { money: MoneyPosition; className?: string }) {
  const rows: [string, number, string?][] = [
    ["Job work value", money.valuePaise],
    ["Paid to date", money.paidPaise],
    money.advancePaise > 0 ? ["Advance (paid over value)", money.advancePaise, "text-warning"] : ["Outstanding", money.outstandingPaise, money.outstandingPaise > 0 ? "text-danger" : "text-success"],
  ];
  return (
    <dl className={cn("num grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs", className)}>
      {rows.map(([label, paise, tone]) => (
        <div key={label} className="bg-surface px-3 py-2.5 print:bg-white">
          <dt className="text-fg-muted">{label}</dt>
          <dd className={cn("mt-0.5 text-sm font-semibold", tone)}>{formatINR(paise)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Ledger table that bleeds to the sheet edge on phones. */
export function SheetTable({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:mx-0">
      <table className="ledger [&_td:first-child]:pl-5 sm:[&_td:first-child]:pl-0 [&_th:first-child]:pl-5 sm:[&_th:first-child]:pl-0 [&_td:last-child]:pr-5 sm:[&_td:last-child]:pr-0 [&_th:last-child]:pr-5 sm:[&_th:last-child]:pr-0">
        {children}
      </table>
    </div>
  );
}
