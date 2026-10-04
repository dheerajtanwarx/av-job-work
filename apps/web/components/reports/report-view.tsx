"use client";

import { formatDate, formatINR, formatQty, L, todayISO, type ReportColumn, type ReportMeta, type ReportResult, type ReportRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileX, Filter, Printer, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Thumb, timeOf } from "@/components/dashboard/panels";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip } from "@/components/ui/misc";
import { DateRange } from "@/components/ui/toolbar";
import { api } from "@/lib/api";
import { useClients, useDesigns, useJobWorkTypes, useMaterials, useProducts } from "@/lib/queries";
import { exportHref, useReport, type ReportFilterValues } from "@/lib/reports";
import { cn } from "@/lib/utils";

const PAGE = 100;
const PRINT_TAKE = 500;

// ───────── Cells ─────────

function statusTone(label: string): Tone {
  const s = label.toLowerCase();
  if (s.includes("overdue") || s.includes("30+")) return "danger";
  if (s.includes("aging") || s.includes("due today") || s.includes("partially")) return "warning";
  if (s.includes("ok") || s.includes("completed") || s.includes("paid") || s.includes("not due")) return "success";
  if (s.includes("progress")) return "accent";
  return "neutral";
}

export function formatCell(type: ReportColumn["type"], v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-fg-faint">—</span>;
  switch (type) {
    case "qty":
      return formatQty(Number(v));
    case "money":
    case "rate":
      return formatINR(Number(v));
    case "int":
    case "days":
      return Number(v).toLocaleString("en-IN");
    case "pct":
      return `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
    case "date":
      return formatDate(String(v));
    case "datetime":
      return (
        <span className="whitespace-nowrap">
          {formatDate(String(v))} <span className="text-fg-muted">{timeOf(String(v))}</span>
        </span>
      );
    case "status":
      return (
        <Badge tone={statusTone(String(v))} dot className="bg-transparent px-0">
          {String(v)}
        </Badge>
      );
    default:
      return String(v);
  }
}

const numeric = (t: ReportColumn["type"]) => t !== "text" && t !== "status" && t !== "date" && t !== "datetime";

function Cell({ c, row }: { c: ReportColumn; row: ReportRow }) {
  const body = formatCell(c.type, row[c.key]);
  const href = c.link ? row.links?.[c.link] : undefined;
  return href ? (
    <Link href={href} className="font-medium hover:text-accent">
      {body}
    </Link>
  ) : (
    <>{body}</>
  );
}

// ───────── Filters ─────────

function useFilterOptions(meta: ReportMeta) {
  const has = (k: string) => meta.filters.includes(k as never);
  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);
  const types = useJobWorkTypes(false);
  const materials = useMaterials({});
  const jobs = useQuery({ queryKey: ["jobs", "picker"], queryFn: () => api.get<{ id: string; jobNumber: string; client: { name: string } }[]>("/jobs"), enabled: has("jobId") });
  return { has, clients, designs, products, types, materials, jobs };
}

function FilterFields({ meta, value, onChange }: { meta: ReportMeta; value: ReportFilterValues; onChange: (v: ReportFilterValues) => void }) {
  const o = useFilterOptions(meta);
  const set = (k: keyof ReportFilterValues, v: string) => onChange({ ...value, [k]: v || undefined });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {o.has("range") && (
        <Field label="Date range" className="sm:col-span-2">
          <DateRange from={value.from ?? ""} to={value.to ?? ""} onFrom={(v) => set("from", v)} onTo={(v) => set("to", v)} />
        </Field>
      )}
      {o.has("date") && (
        <Field label="Day">
          <Input type="date" value={value.date ?? todayISO()} onChange={(e) => set("date", e.target.value)} />
        </Field>
      )}
      {o.has("clientId") && (
        <Field label={L.client} required={meta.requires === "clientId"}>
          <Combobox options={[{ value: "", label: `All ${L.clients.toLowerCase()}` }, ...(o.clients.data ?? []).map((c) => ({ value: c.id, label: c.name, keywords: [c.phone ?? "", c.workerCode ?? ""] }))]} value={value.clientId ?? ""} onChange={(v) => set("clientId", v)} placeholder={`All ${L.clients.toLowerCase()}`} />
        </Field>
      )}
      {o.has("jobId") && (
        <Field label={L.job} required={meta.requires === "jobId"}>
          <Combobox options={(o.jobs.data ?? []).map((j) => ({ value: j.id, label: j.jobNumber, sub: j.client.name, keywords: [j.client.name] }))} value={value.jobId ?? ""} onChange={(v) => set("jobId", v)} placeholder={`Choose a ${L.job.toLowerCase()}`} />
        </Field>
      )}
      {o.has("designId") && (
        <Field label="Design">
          <Combobox options={[{ value: "", label: "All designs" }, ...(o.designs.data ?? []).map((d) => ({ value: d.id, label: d.name, keywords: [d.code ?? ""] }))]} value={value.designId ?? ""} onChange={(v) => set("designId", v)} placeholder="All designs" />
        </Field>
      )}
      {o.has("productId") && (
        <Field label="Product">
          <Select value={value.productId ?? ""} onChange={(e) => set("productId", e.target.value)}>
            <option value="">All products</option>
            {o.products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {o.has("jobWorkTypeId") && (
        <Field label={L.jobWorkType}>
          <Select value={value.jobWorkTypeId ?? ""} onChange={(e) => set("jobWorkTypeId", e.target.value)}>
            <option value="">All types</option>
            {o.types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {o.has("materialId") && (
        <Field label={L.material}>
          <Combobox options={[{ value: "", label: "All materials" }, ...(o.materials.data ?? []).map((m) => ({ value: m.id, label: m.name, sub: [m.code, m.lotNumber && `Lot ${m.lotNumber}`].filter(Boolean).join(" · "), keywords: [m.code, m.lotNumber ?? "", m.rollNumber ?? ""] }))]} value={value.materialId ?? ""} onChange={(v) => set("materialId", v)} placeholder="All materials" />
        </Field>
      )}
      {o.has("status") && meta.statusOptions && (
        <Field label="Status">
          <Select value={value.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">Any status</option>
            {meta.statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}

/** Chips for the filters in force, each removable. */
function ActiveFilters({ meta, value, onChange }: { meta: ReportMeta; value: ReportFilterValues; onChange: (v: ReportFilterValues) => void }) {
  const o = useFilterOptions(meta);
  const name = (list: { id: string; name: string }[] | undefined, id?: string) => list?.find((x) => x.id === id)?.name ?? "…";
  const chips: { key: (keyof ReportFilterValues)[]; label: string }[] = [];
  if (value.from || value.to) chips.push({ key: ["from", "to"], label: `${value.from ? formatDate(value.from) : "Start"} – ${value.to ? formatDate(value.to) : "today"}` });
  if (value.date) chips.push({ key: ["date"], label: formatDate(value.date) });
  if (value.clientId) chips.push({ key: ["clientId"], label: name(o.clients.data, value.clientId) });
  if (value.jobId) chips.push({ key: ["jobId"], label: o.jobs.data?.find((j) => j.id === value.jobId)?.jobNumber ?? "…" });
  if (value.designId) chips.push({ key: ["designId"], label: name(o.designs.data, value.designId) });
  if (value.productId) chips.push({ key: ["productId"], label: name(o.products.data, value.productId) });
  if (value.jobWorkTypeId) chips.push({ key: ["jobWorkTypeId"], label: name(o.types.data, value.jobWorkTypeId) });
  if (value.materialId) chips.push({ key: ["materialId"], label: name(o.materials.data, value.materialId) });
  if (value.status) chips.push({ key: ["status"], label: meta.statusOptions?.find((s) => s.value === value.status)?.label ?? value.status });
  if (!chips.length) return null;
  return (
    <>
      {chips.map((c) => (
        <span key={c.key.join()} className="inline-flex h-7 items-center gap-1 rounded-md bg-surface-2 pr-1 pl-2 text-xs text-fg-2">
          {c.label}
          <button
            type="button"
            aria-label={`Remove ${c.label}`}
            className="grid size-5 place-items-center rounded text-fg-muted hover:bg-surface-3 hover:text-fg"
            onClick={() => onChange(Object.fromEntries(Object.entries(value).filter(([k]) => !c.key.includes(k as keyof ReportFilterValues))))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </>
  );
}

// ───────── Table / cards ─────────

function Totals({ r, lead }: { r: ReportResult; lead?: boolean }) {
  const cols = r.columns;
  const hasAny = cols.some((c) => c.total && r.totals[c.key] !== undefined);
  if (!hasAny && !r.totalsByUnit.length) return null;
  const hide = (c: ReportColumn) => c.minor && "max-lg:hidden print:table-cell";
  return (
    <tfoot>
      <tr>
        {lead && <td className="print:hidden" />}
        {cols.map((c, i) => (
          <td key={c.key} className={cn(numeric(c.type) && "r", i > 0 && hide(c), i === 0 && "whitespace-nowrap")}>
            {i === 0
              ? `Total${r.total > r.rows.length ? ` (all ${r.total.toLocaleString("en-IN")})` : ""}`
              : c.total && r.totals[c.key] !== undefined
                ? r.totals[c.key] === null
                  ? <span className="text-xs font-normal text-fg-muted">by unit ↓</span>
                  : formatCell(c.type, r.totals[c.key])
                : null}
          </td>
        ))}
      </tr>
      {r.totalsByUnit.map((u) => (
        <tr key={u.unit}>
          {lead && <td className="print:hidden" />}
          {cols.map((c, i) => (
            <td key={c.key} className={cn(numeric(c.type) && "r", i > 0 && hide(c), "text-fg-2")}>
              {i === 0 ? u.unit : c.type === "qty" && u.values[c.key] !== undefined ? `${formatQty(u.values[c.key])} ${u.unit}` : null}
            </td>
          ))}
        </tr>
      ))}
    </tfoot>
  );
}

function ReportTable({ r }: { r: ReportResult }) {
  const photo = r.rows.some((row) => "photoId" in row);
  return (
    <TableWrap>
      <table className="ledger">
        <thead>
          <tr>
            {photo && <th className="w-12 print:hidden" aria-label="Photo" />}
            {r.columns.map((c) => (
              <th key={c.key} className={cn(numeric(c.type) && "r", c.minor && "max-lg:hidden print:table-cell")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row, i) => (
            <tr key={i}>
              {photo && (
                <td className="print:hidden">
                  <Thumb photoId={typeof row.photoId === "string" ? row.photoId : null} alt={String(row.designName ?? "Photo")} className="size-9" />
                </td>
              )}
              {r.columns.map((c) => (
                <td key={c.key} className={cn(numeric(c.type) && "r", c.type === "text" && "max-w-56 truncate", c.minor && "max-lg:hidden print:table-cell")}>
                  <Cell c={c} row={row} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <Totals r={r} lead={photo} />
      </table>
    </TableWrap>
  );
}

/** Phone view: one card per row — the first column as the title, the rest as label/value pairs. */
function ReportCards({ r }: { r: ReportResult }) {
  const [title, ...rest] = r.columns;
  const important = rest.filter((c) => !c.minor);
  return (
    <ul className="space-y-2">
      {r.rows.map((row, i) => (
        <li key={i} className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-start gap-3">
            {"photoId" in row && <Thumb photoId={typeof row.photoId === "string" ? row.photoId : null} alt={String(row.designName ?? "Photo")} className="size-12" />}
            <div className="min-w-0 flex-1 text-[13px]">
              <Cell c={title} row={row} />
            </div>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {important.map((c) => (
              <div key={c.key} className="min-w-0">
                <dt className="text-fg-muted">{c.header}</dt>
                <dd className={cn("truncate text-fg", numeric(c.type) && "num")}>
                  <Cell c={c} row={row} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
      {r.columns.some((c) => c.total) && (
        <li className="rounded-lg border border-border bg-surface-2 px-4 py-3">
          <div className="text-[13px] font-semibold">Total{r.total > r.rows.length ? ` (all ${r.total})` : ""}</div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {r.columns
              .filter((c) => c.total && !c.minor)
              .map((c) => (
                <div key={c.key}>
                  <dt className="text-fg-muted">{c.header}</dt>
                  <dd className="num font-medium">
                    {r.totals[c.key] === null
                      ? r.totalsByUnit.map((u) => `${formatQty(u.values[c.key] ?? 0)} ${u.unit}`).join(" · ")
                      : formatCell(c.type, r.totals[c.key])}
                  </dd>
                </div>
              ))}
          </dl>
        </li>
      )}
    </ul>
  );
}

const PRINT_CSS = `
@media print {
  .report-print .ledger { font-size: 10.5px; }
  .report-print .ledger th { height: 24px; padding: 0 5px; font-size: 9.5px; position: static; }
  .report-print .ledger td, .report-print .ledger tfoot td { height: auto; padding: 4px 5px; white-space: normal; max-width: none; overflow: visible; }
  .report-print .overflow-x-auto { overflow: visible !important; }
  .report-print tr { break-inside: avoid; }
  .report-print a { color: inherit; text-decoration: none; }
}`;

// ───────── The report ─────────

export function CatalogReport({ meta, filters, onFilters }: { meta: ReportMeta; filters: ReportFilterValues; onFilters: (f: ReportFilterValues) => void }) {
  const [skip, setSkip] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState<ReportFilterValues>(filters);
  const missing = meta.requires && !filters[meta.requires];
  const take = printing ? PRINT_TAKE : PAGE;
  const q = useReport(meta.id, filters, { skip: printing ? 0 : skip, take }, !missing);
  const r = q.data && q.data.id === meta.id ? q.data : undefined;

  useEffect(() => setSkip(0), [meta.id, filters]);
  useEffect(() => {
    if (!printing || !r || q.isFetching) return;
    const t = setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
    return () => clearTimeout(t);
  }, [printing, r, q.isFetching]);

  const filterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  const generated = new Date();

  return (
    <div className="report-print">
      <style>{PRINT_CSS}</style>
      {/* Print header */}
      <div className="mb-3 hidden print:block">
        <div className="text-xs text-fg-muted">AV Creation · Job Work Ledger</div>
        <h2 className="text-base font-semibold">{meta.title}</h2>
        <div className="text-xs text-fg-muted">
          {meta.description} Printed {formatDate(generated)} {timeOf(generated.toISOString())}.
        </div>
      </div>

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setDraft(filters);
            setDrawer(true);
          }}
        >
          <Filter /> Filters{filterCount ? ` (${filterCount})` : ""}
        </Button>
        {meta.filters.includes("range") && <DateRange from={filters.from ?? ""} to={filters.to ?? ""} onFrom={(v) => onFilters({ ...filters, from: v || undefined })} onTo={(v) => onFilters({ ...filters, to: v || undefined })} />}
        {meta.filters.includes("date") && <Input type="date" aria-label="Day" value={filters.date ?? todayISO()} onChange={(e) => onFilters({ ...filters, date: e.target.value || undefined })} className="w-full sm:w-40" />}
        <ActiveFilters meta={meta} value={filters} onChange={onFilters} />
        <div className="ml-auto flex gap-2">
          <Button asChild variant="secondary" size="sm" disabled={!!missing}>
            <a href={missing ? undefined : exportHref(meta.id, filters, "csv")}>
              <Download /> CSV
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm" disabled={!!missing}>
            <a href={missing ? undefined : exportHref(meta.id, filters, "xlsx")}>
              <FileSpreadsheet /> Excel
            </a>
          </Button>
          <Button variant="secondary" size="sm" disabled={!r} loading={printing} onClick={() => setPrinting(true)} title="Print or save as PDF">
            <Printer /> Print / PDF
          </Button>
        </div>
      </div>

      <Dialog
        open={drawer}
        onOpenChange={setDrawer}
        title="Filters"
        description={meta.title}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft({})}>
              Clear all
            </Button>
            <Button
              onClick={() => {
                onFilters(draft);
                setDrawer(false);
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <FilterFields meta={meta} value={draft} onChange={setDraft} />
      </Dialog>

      {missing ? (
        <Card>
          <EmptyState
            icon={Filter}
            title={meta.requires === "clientId" ? `Choose a ${L.client.toLowerCase()}` : `Choose a ${L.job.toLowerCase()}`}
            action={
              <Button
                onClick={() => {
                  setDraft(filters);
                  setDrawer(true);
                }}
              >
                Open filters
              </Button>
            }
          >
            This ledger is for one {meta.requires === "clientId" ? L.client.toLowerCase() : L.job.toLowerCase()} at a time.
          </EmptyState>
        </Card>
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : !r ? (
        <Card className="overflow-hidden">
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <div className={cn("space-y-4", q.isFetching && !printing && "opacity-70 transition-opacity")}>
          {r.summary.length > 0 && (
            <MetricStrip className={cn("grid-cols-2", r.summary.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3", r.summary.length > 4 && "xl:grid-cols-7")}>
              {r.summary.map((s) => (
                <Metric key={s.label} label={s.label} value={formatCell(s.type === "status" ? "text" : s.type, s.value)} tone={s.value ? (s.tone === "attention" ? "warning" : (s.tone ?? "fg")) : "fg"} sub={s.sub} />
              ))}
            </MetricStrip>
          )}
          {r.note && <p className="text-[13px] text-fg-muted">{r.note}</p>}
          {r.rows.length === 0 ? (
            <Card>
              <EmptyState icon={FileX} title="Nothing to show">
                No records match these filters.
              </EmptyState>
            </Card>
          ) : (
            <>
              <div className="md:hidden print:hidden">
                <ReportCards r={r} />
              </div>
              <Card className="hidden overflow-hidden md:block print:block print:border-0">
                <ReportTable r={r} />
              </Card>
            </>
          )}
          {r.total > r.take && !printing && (
            <div className="no-print flex items-center justify-between gap-3 text-[13px] text-fg-muted">
              <span className="num">
                {(r.skip + 1).toLocaleString("en-IN")}–{Math.min(r.skip + r.take, r.total).toLocaleString("en-IN")} of {r.total.toLocaleString("en-IN")}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE))}>
                  <ChevronLeft /> Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={skip + PAGE >= r.total} onClick={() => setSkip(skip + PAGE)}>
                  Next <ChevronRight />
                </Button>
              </div>
            </div>
          )}
          {printing && r.total > r.rows.length && <p className="text-xs text-fg-muted">First {r.rows.length} of {r.total} rows. Export to Excel for everything.</p>}
        </div>
      )}
    </div>
  );
}
