"use client";

import { REPORTS, type ReportGroup } from "@av/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";
import { ClientsReport, PaymentsReport, PendingReport, ToPayReport } from "@/components/reports/legacy";
import { CatalogReport } from "@/components/reports/report-view";
import { Select } from "@/components/ui/input";
import { LoadingBlock, PageHeader } from "@/components/ui/misc";
import type { ReportFilterValues } from "@/lib/reports";
import { cn } from "@/lib/utils";

/** Old ?tab= links keep working. */
const LEGACY_TABS: Record<string, string> = { pending: "pending-material", clients: "client-summary", payments: "payments", "to-pay": "to-pay" };
const FILTER_KEYS: (keyof ReportFilterValues)[] = ["from", "to", "date", "clientId", "designId", "productId", "jobWorkTypeId", "materialId", "jobId", "status"];
const GROUPS: ReportGroup[] = ["Material", "Money", "Work", "Photos", "Ledgers"];

function Reports() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const id = params.get("report") ?? LEGACY_TABS[params.get("tab") ?? ""] ?? "material-outside";
  const meta = REPORTS.find((r) => r.id === id) ?? REPORTS[0];

  // Filters live in the URL, so a filtered report can be bookmarked or shared (dashboard links rely on this).
  const filters = useMemo(() => {
    const f: ReportFilterValues = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);

  const go = useCallback(
    (report: string, f: ReportFilterValues) => {
      const s = new URLSearchParams({ report });
      for (const [k, v] of Object.entries(f)) if (v) s.set(k, v);
      router.replace(`${path}?${s.toString()}`, { scroll: false });
    },
    [path, router],
  );

  const keep = (next: string) => {
    // Carry over the filters the next report understands.
    const m = REPORTS.find((r) => r.id === next)!;
    const f: ReportFilterValues = {};
    for (const [k, v] of Object.entries(filters) as [keyof ReportFilterValues, string][]) {
      const key = k === "from" || k === "to" ? "range" : k;
      if (m.filters.includes(key as never)) f[k] = v;
    }
    go(next, f);
  };

  return (
    <>
      <div className="no-print">
        <PageHeader title="Reports" subtitle="Where your material is, and where your money is." />
      </div>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        {/* Report picker: a select on phones, a grouped list on desktop */}
        <div className="no-print mb-4 lg:hidden">
          <Select value={meta.id} onChange={(e) => keep(e.target.value)} aria-label="Report">
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <nav aria-label="Reports" className="no-print hidden lg:block">
          {GROUPS.map((g) => (
            <div key={g} className="mb-4">
              <div className="mb-1 px-2 text-[11px] font-medium tracking-wide text-fg-faint uppercase">{g}</div>
              <ul>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => keep(r.id)}
                      aria-current={r.id === meta.id ? "page" : undefined}
                      className={cn(
                        "flex h-8 w-full items-center rounded-md px-2 text-left text-[13px] transition-colors",
                        r.id === meta.id ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <section className="min-w-0">
          <div className="mb-4">
            <h2 className="text-[15px] font-semibold text-fg print:hidden">{meta.title}</h2>
            <p className="mt-0.5 text-[13px] text-fg-muted print:hidden">{meta.description}</p>
          </div>
          {meta.legacy ? (
            <>
              {meta.id === "pending-material" && <PendingReport />}
              {meta.id === "client-summary" && <ClientsReport />}
              {meta.id === "payments" && <PaymentsReport />}
              {meta.id === "to-pay" && <ToPayReport />}
            </>
          ) : (
            <CatalogReport key={meta.id} meta={meta} filters={filters} onFilters={(f) => go(meta.id, f)} />
          )}
        </section>
      </div>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Reports />
    </Suspense>
  );
}
