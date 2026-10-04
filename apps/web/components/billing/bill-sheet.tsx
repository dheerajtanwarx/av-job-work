import { amountInWords, formatINR, type Client, type Settings } from "@av/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Printable paper layout shared by sub bills and main bills.
 * Always renders as paper (`.sheet`) and prints edge to edge on A4.
 */
export function BillSheet({
  business,
  kind,
  title,
  number,
  date,
  paidTo,
  details,
  stamp,
  children,
}: {
  business: Settings;
  /** Small caps label above the title, e.g. "Payment voucher". */
  kind: string;
  title: string;
  number: string;
  date: string;
  paidTo: Client;
  /** Right-hand block next to "Paid to": job / product facts. */
  details: { label: string; value: ReactNode }[];
  stamp?: { label: string; tone: "danger" | "success" };
  children: ReactNode;
}) {
  return (
    <article className="sheet print-plain min-w-0 overflow-hidden rounded-lg border border-border">
      <div className="h-1 bg-fg print:h-0.5" aria-hidden />
      <div className="p-6 sm:p-10 print:p-0 print:pt-4">
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
            <div className="mt-0.5 text-[15px] font-semibold">{title}</div>
            <dl className="num mt-2 grid grid-cols-[auto_auto] justify-start gap-x-3 gap-y-0.5 text-xs sm:justify-end">
              <dt className="text-fg-muted">Bill no.</dt>
              <dd className="font-semibold">{number}</dd>
              <dt className="text-fg-muted">Date</dt>
              <dd className="text-fg-2">{date}</dd>
            </dl>
          </div>
        </header>

        {/* Parties */}
        <div className="mt-8 grid gap-6 rounded-md border border-border sm:grid-cols-2 sm:gap-0">
          <div className="px-4 py-3 sm:border-r sm:border-border">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Paid to</div>
            <div className="mt-1 text-sm font-semibold">{paidTo.name}</div>
            {paidTo.businessName && <div className="text-xs text-fg-2">{paidTo.businessName}</div>}
            {paidTo.address && <div className="mt-0.5 text-xs whitespace-pre-line text-fg-muted">{paidTo.address}</div>}
            {paidTo.phone && <div className="num text-xs text-fg-muted">{paidTo.phone}</div>}
            {paidTo.gstin && <div className="num text-xs text-fg-muted">GSTIN {paidTo.gstin}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs sm:border-t-0">
            {details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-fg-muted">{d.label}</dt>
                <dd className="font-medium text-fg-2">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-8 space-y-8">{children}</div>

        {/* Signatures */}
        <div className="break-inside-avoid">
          <footer className="mt-12 grid grid-cols-2 items-end gap-10 text-xs text-fg-muted print:mt-10">
            <div>
              <div className="border-t border-border-strong pt-1.5">Received by</div>
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
              <div className="border-t border-border-strong pt-1.5">Authorised signatory</div>
              <div className="text-[11px] text-fg-faint">For {business.businessName}</div>
            </div>
          </footer>
          <p className="mt-6 text-center text-[10px] text-fg-faint">This is a payment record for internal use, not a tax invoice.</p>
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

/** Ledger table that bleeds to the sheet edge on phones. */
export function SheetTable({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-6 overflow-x-auto sm:mx-0">
      <table className="ledger [&_td:first-child]:pl-6 sm:[&_td:first-child]:pl-0 [&_th:first-child]:pl-6 sm:[&_th:first-child]:pl-0 [&_td:last-child]:pr-6 sm:[&_td:last-child]:pr-0 [&_th:last-child]:pr-6 sm:[&_th:last-child]:pr-0">
        {children}
      </table>
    </div>
  );
}
