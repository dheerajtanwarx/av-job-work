import {
  formatDate,
  formatINR,
  formatQty,
  PAYMENT_METHOD_LABEL,
  todayISO,
  type JobStatus,
  type ReportColumn,
  type ReportMeta,
  type ReportResult,
  type ReportRow,
  type SubBillRow,
  type UnpaidLine,
} from "@av/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ChevronDown, ChevronUp, FileSpreadsheet, FileText, FileX, Filter, PackageCheck, ReceiptText, Wallet, X } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AuthedImage, Badge, Button, Card, DateField, EmptyState, ErrorBlock, ListSkeleton, PickerField, Stat, StatGrid, Text, ToggleRow, type Tone } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { downloadAndShare } from "@/lib/files";
import { openHref } from "@/lib/links";
import { useClients, useDesigns, useJobWorkTypes, useMaterials, useProducts } from "@/lib/queries";
import { radius, space, useTheme } from "@/theme";
import { JobStatusBadge } from "./status";

const PAGE = 100;

/** Filters shared by every report; each report uses the ones its REPORTS entry lists. */
export interface ReportFilterValues {
  from?: string;
  to?: string;
  date?: string;
  clientId?: string;
  designId?: string;
  productId?: string;
  jobWorkTypeId?: string;
  materialId?: string;
  jobId?: string;
  status?: string;
  /** Pending material only. */
  onlyPending?: string;
  /** Worker summary only. */
  includeInactive?: string;
}

export const FILTER_KEYS: (keyof ReportFilterValues)[] = ["from", "to", "date", "clientId", "designId", "productId", "jobWorkTypeId", "materialId", "jobId", "status", "onlyPending", "includeInactive"];

// ───────── Cells ─────────

function statusTone(label: string): Tone {
  const s = label.toLowerCase();
  if (s.includes("overdue") || s.includes("30+")) return "danger";
  if (s.includes("aging") || s.includes("due today") || s.includes("partially")) return "warning";
  if (s.includes("ok") || s.includes("completed") || s.includes("paid") || s.includes("not due")) return "success";
  if (s.includes("progress")) return "accent";
  return "neutral";
}

/** A report value as text, the same way the web formats it. */
export function cellText(type: ReportColumn["type"], v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
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
      return `${formatDate(String(v))} ${new Date(String(v)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
    default:
      return String(v);
  }
}

function Cell({ c, row, strong }: { c: ReportColumn; row: ReportRow; strong?: boolean }) {
  const v = row[c.key];
  if (c.type === "status" && v) return <Badge tone={statusTone(String(v))} label={String(v)} />;
  const href = c.link ? row.links?.[c.link] : undefined;
  return (
    <Text variant={strong ? "bodyStrong" : "label"} num={c.type !== "text"} tone={href ? "accent" : v === null || v === undefined || v === "" ? "faint" : "default"} numberOfLines={strong ? 2 : 1}>
      {cellText(c.type, v)}
    </Text>
  );
}

// ───────── Filters ─────────

/** Collapsible filter panel: only the filters this report understands, plus a chip count when closed. */
export function ReportFilters({ meta, value, onChange }: { meta: ReportMeta; value: ReportFilterValues; onChange: (v: ReportFilterValues) => void }) {
  const { c } = useTheme();
  const has = (k: string) => meta.filters.includes(k as never);
  const [open, setOpen] = useState(!!meta.requires);
  const clients = useClients(false);
  const designs = useDesigns(false);
  const products = useProducts(false);
  const types = useJobWorkTypes(false);
  const materials = useMaterials({});
  const jobs = useQuery({ queryKey: ["jobs", "picker"], queryFn: () => api.get<{ id: string; jobNumber: string; client: { name: string } }[]>("/jobs"), enabled: has("jobId") });
  const set = (k: keyof ReportFilterValues, v: string | null | undefined) => onChange({ ...value, [k]: v || undefined });
  const count = FILTER_KEYS.filter((k) => value[k]).length;
  const extras = meta.id === "pending-material" || meta.id === "client-summary";
  if (!meta.filters.length && !extras) return null;

  return (
    <View style={{ borderRadius: radius.card, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
      <Pressable onPress={() => setOpen(!open)} android_ripple={{ color: c.surface2 }} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md + 2 }}>
        <Filter size={18} color={c.fg2} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          Filters{count ? ` (${count})` : ""}
        </Text>
        {count ? (
          <Pressable onPress={() => onChange({})} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear filters" style={{ flexDirection: "row", alignItems: "center", gap: 2, marginRight: space.sm }}>
            <X size={14} color={c.accent} />
            <Text variant="label" tone="accent">
              Clear
            </Text>
          </Pressable>
        ) : null}
        {open ? <ChevronUp size={18} color={c.fgMuted} /> : <ChevronDown size={18} color={c.fgMuted} />}
      </Pressable>
      {open ? (
        <View style={{ gap: space.md, padding: space.md + 2, paddingTop: 0 }}>
          {has("range") ? (
            <View style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <DateField label="From" value={value.from ?? null} onChange={(v) => set("from", v)} clearable placeholder="Start" maximumDate={new Date()} />
              </View>
              <View style={{ flex: 1 }}>
                <DateField label="To" value={value.to ?? null} onChange={(v) => set("to", v)} clearable placeholder="Today" maximumDate={new Date()} />
              </View>
            </View>
          ) : null}
          {has("date") ? <DateField label="Day" value={value.date ?? todayISO()} onChange={(v) => set("date", v)} maximumDate={new Date()} /> : null}
          {has("clientId") ? (
            <PickerField
              label={meta.requires === "clientId" ? "Job worker *" : "Job worker"}
              value={value.clientId ?? null}
              options={(clients.data ?? []).map((w) => ({ value: w.id, label: w.name, sub: w.workerCode ?? undefined, keywords: [w.phone ?? ""] }))}
              onChange={(v) => set("clientId", v)}
              placeholder="All job workers"
              clearable={meta.requires !== "clientId"}
              loading={clients.isPending}
            />
          ) : null}
          {has("jobId") ? (
            <PickerField label="Challan *" value={value.jobId ?? null} options={(jobs.data ?? []).map((j) => ({ value: j.id, label: j.jobNumber, sub: j.client.name, keywords: [j.client.name] }))} onChange={(v) => set("jobId", v)} placeholder="Choose a challan" loading={jobs.isPending} />
          ) : null}
          {has("designId") ? <PickerField label="Design" value={value.designId ?? null} options={(designs.data ?? []).map((d) => ({ value: d.id, label: d.name, sub: d.code ?? undefined }))} onChange={(v) => set("designId", v)} placeholder="All designs" clearable loading={designs.isPending} /> : null}
          {has("productId") ? <PickerField label="Product" value={value.productId ?? null} options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name, sub: p.unit }))} onChange={(v) => set("productId", v)} placeholder="All products" clearable loading={products.isPending} /> : null}
          {has("jobWorkTypeId") ? <PickerField label="Job work type" value={value.jobWorkTypeId ?? null} options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set("jobWorkTypeId", v)} placeholder="All types" clearable loading={types.isPending} /> : null}
          {has("materialId") ? (
            <PickerField
              label="Material"
              value={value.materialId ?? null}
              options={(materials.data ?? []).map((m) => ({ value: m.id, label: m.name, sub: [m.code, m.lotNumber && `Lot ${m.lotNumber}`].filter(Boolean).join(" · "), keywords: [m.code, m.lotNumber ?? "", m.rollNumber ?? ""] }))}
              onChange={(v) => set("materialId", v)}
              placeholder="All materials"
              clearable
              loading={materials.isPending}
            />
          ) : null}
          {has("status") && meta.statusOptions ? <PickerField label="Status" value={value.status ?? null} options={meta.statusOptions} onChange={(v) => set("status", v)} placeholder="Any status" clearable /> : null}
          {meta.id === "pending-material" ? <ToggleRow label="Only lines with pending pieces" value={value.onlyPending === "true"} onChange={(v) => set("onlyPending", v ? "true" : undefined)} /> : null}
          {meta.id === "client-summary" ? <ToggleRow label="Include inactive workers" value={value.includeInactive === "true"} onChange={(v) => set("includeInactive", v ? "true" : undefined)} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Excel / CSV of the whole filtered report, handed to the share sheet (WhatsApp, Drive, email…). */
export function ExportButtons({ path, name, disabled }: { path: string; name: string; disabled?: boolean }) {
  const [busy, setBusy] = useState<"xlsx" | "csv" | null>(null);
  const run = async (format: "xlsx" | "csv") => {
    setBusy(format);
    const sep = path.includes("?") ? "&" : "?";
    await downloadAndShare(`${path}${sep}format=${format}`, `${name}-${todayISO()}.${format}`);
    setBusy(null);
  };
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <Button title="Excel" icon={FileSpreadsheet} variant="secondary" loading={busy === "xlsx"} disabled={disabled || !!busy} onPress={() => run("xlsx")} style={{ flex: 1 }} />
      <Button title="CSV" icon={FileText} variant="secondary" loading={busy === "csv"} disabled={disabled || !!busy} onPress={() => run("csv")} style={{ flex: 1 }} />
    </View>
  );
}

const reportPath = (id: string, f: Omit<ReportFilterValues, "onlyPending" | "includeInactive">) => `/reports/${id}${qs({ ...f })}`;

// ───────── Catalogue reports (generic shape) ─────────

export function CatalogReport({ meta, filters }: { meta: ReportMeta; filters: ReportFilterValues }) {
  const missing = meta.requires && !filters[meta.requires];
  const q = useInfiniteQuery({
    queryKey: ["report", meta.id, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<ReportResult>(`/reports/${meta.id}${qs({ ...filters, skip: pageParam, take: PAGE })}`),
    getNextPageParam: (last) => (last.skip + last.rows.length < last.total ? last.skip + last.rows.length : undefined),
    enabled: !missing,
  });

  if (missing)
    return <EmptyState icon={Filter} title={meta.requires === "clientId" ? "Choose a job worker" : "Choose a challan"} body={`This ledger is for one ${meta.requires === "clientId" ? "job worker" : "challan"} at a time. Pick one in Filters above.`} />;
  if (q.isPending) return <ListSkeleton rows={5} />;
  if (q.error && !q.data) return <ErrorBlock error={q.error} onRetry={q.refetch} />;
  const first = q.data!.pages[0];
  const rows = q.data!.pages.flatMap((p) => p.rows);
  const [title, ...rest] = first.columns;
  const important = rest.filter((c) => !c.minor);
  const totalCols = first.columns.filter((c) => c.total && !c.minor);

  return (
    <View style={{ gap: space.md, opacity: q.isRefetching ? 0.7 : 1 }}>
      {first.summary.length ? (
        <StatGrid>
          {first.summary.map((s) => (
            <Stat key={s.label} label={s.label} value={cellText(s.type === "status" ? "text" : s.type, s.value)} sub={s.sub} tone={s.value ? (s.tone === "attention" ? "warning" : (s.tone ?? "default")) : "default"} />
          ))}
        </StatGrid>
      ) : null}
      {first.note ? <Text tone="muted">{first.note}</Text> : null}
      {rows.length === 0 ? (
        <EmptyState icon={FileX} title="Nothing to show" body="No records match these filters." />
      ) : (
        <>
          {rows.map((row, i) => {
            const href = title.link ? row.links?.[title.link] : undefined;
            const photoId = typeof row.photoId === "string" ? row.photoId : null;
            return (
              <Card key={i} padded={false} onPress={href ? () => openHref(href) : undefined}>
                <View style={{ padding: space.md + 2, gap: space.sm }}>
                  <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                    {"photoId" in row ? <AuthedImage path={photoId ? `/photos/${photoId}/thumb` : null} size={48} /> : null}
                    <View style={{ flex: 1 }}>
                      <Cell c={title} row={row} strong />
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.sm }}>
                    {important.map((c) => (
                      <View key={c.key} style={{ width: "50%", paddingRight: space.sm, gap: 1 }}>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {c.header}
                        </Text>
                        <Cell c={c} row={row} />
                      </View>
                    ))}
                  </View>
                </View>
              </Card>
            );
          })}
          {q.hasNextPage ? (
            <Button title={`Show more (${rows.length} of ${first.total.toLocaleString("en-IN")})`} variant="secondary" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} />
          ) : null}
          {totalCols.length ? (
            <TotalsCard title={`Total${first.total > rows.length ? ` (all ${first.total.toLocaleString("en-IN")})` : ""}`}>
              {totalCols.map((c) => (
                <Pair
                  key={c.key}
                  label={c.header}
                  value={first.totals[c.key] === null ? first.totalsByUnit.map((u) => `${formatQty(u.values[c.key] ?? 0)} ${u.unit}`).join(" · ") : cellText(c.type, first.totals[c.key])}
                />
              ))}
            </TotalsCard>
          ) : null}
        </>
      )}
    </View>
  );
}

function TotalsCard({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ borderRadius: radius.card, backgroundColor: c.surface2, padding: space.md + 2, gap: space.sm }}>
      <Text variant="bodyStrong">{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.sm }}>{children}</View>
    </View>
  );
}

function Pair({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" | "muted" }) {
  return (
    <View style={{ width: "50%", paddingRight: space.sm, gap: 1 }}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="label" num tone={tone ?? "default"} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ───────── The four original reports (their own JSON shapes) ─────────

function useLegacy<T>(path: string) {
  return useQuery({ queryKey: ["report", path], queryFn: () => api.get<T>(path), placeholderData: (p) => p });
}

function Loading<T>({ q, children }: { q: { isPending: boolean; error: unknown; data?: T; refetch: () => unknown }; children: (d: T) => ReactNode }) {
  if (q.isPending) return <ListSkeleton rows={5} />;
  if (q.error && !q.data) return <ErrorBlock error={q.error} onRetry={q.refetch} />;
  return <>{children(q.data!)}</>;
}

interface PendingRow {
  jobId: string;
  jobNumber: string;
  jobStatus: JobStatus;
  jobDate: string;
  expectedReturnDate: string | null;
  overdue: boolean;
  daysOut: number;
  clientId: string;
  clientName: string;
  productName: string;
  designName: string;
  sent: number;
  received: number;
  exceptions: number;
  pending: number;
  pendingValuePaise: number;
}

export function PendingReport({ filters }: { filters: ReportFilterValues }) {
  const q = useLegacy<{ rows: PendingRow[]; totals: { sent: number; received: number; exceptions: number; pending: number; pendingValuePaise: number } }>(
    `/reports/pending-material${qs({ clientId: filters.clientId, designId: filters.designId, onlyPending: filters.onlyPending })}`,
  );
  return (
    <Loading q={q}>
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing is outside" body="Everything is back." />
        ) : (
          <View style={{ gap: space.sm }}>
            <StatGrid>
              <Stat label="Pending" value={formatQty(d.totals.pending)} tone={d.totals.pending ? "warning" : "default"} sub={`of ${formatQty(d.totals.sent)} sent`} />
              <Stat label="Pending value" value={formatINR(d.totals.pendingValuePaise)} sub="at challan rates" />
            </StatGrid>
            {d.rows.map((r, i) => (
              <Card key={i} padded={false} onPress={() => router.push(`/jobs/${r.jobId}`)}>
                <View style={{ padding: space.md + 2, gap: space.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {r.jobNumber} · {r.clientName}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {r.productName} · {r.designName}
                      </Text>
                    </View>
                    {r.overdue ? <Badge tone="danger" label="Overdue" /> : null}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.sm }}>
                    <Pair label="Sent" value={formatQty(r.sent)} />
                    <Pair label="Received" value={formatQty(r.received)} />
                    <Pair label="Pending" value={formatQty(r.pending)} tone={r.pending ? "warning" : "muted"} />
                    <Pair label="Damaged / rejected / lost" value={r.exceptions ? formatQty(r.exceptions) : "—"} tone={r.exceptions ? "danger" : "muted"} />
                    <Pair label="Days out" value={String(r.daysOut)} tone={r.overdue ? "danger" : "muted"} />
                    <Pair label="Pending value" value={formatINR(r.pendingValuePaise)} />
                  </View>
                </View>
              </Card>
            ))}
            <TotalsCard title="Total">
              <Pair label="Sent" value={formatQty(d.totals.sent)} />
              <Pair label="Received" value={formatQty(d.totals.received)} />
              <Pair label="Damaged / rejected / lost" value={formatQty(d.totals.exceptions)} />
              <Pair label="Pending" value={formatQty(d.totals.pending)} tone={d.totals.pending ? "warning" : undefined} />
            </TotalsCard>
          </View>
        )
      }
    </Loading>
  );
}

interface ClientRow {
  clientId: string;
  clientName: string;
  jobs: number;
  activeJobs: number;
  sent: number;
  received: number;
  exceptions: number;
  pending: number;
  completedValuePaise: number;
  paidPaise: number;
  toPayPaise: number;
}

export function ClientsReport({ filters }: { filters: ReportFilterValues }) {
  const q = useLegacy<{ rows: ClientRow[]; totals: Omit<ClientRow, "clientId" | "clientName"> }>(`/reports/client-summary${qs({ includeInactive: filters.includeInactive })}`);
  return (
    <Loading q={q}>
      {(d) => (
        <View style={{ gap: space.sm }}>
          <StatGrid>
            <Stat label="To pay" value={formatINR(d.totals.toPayPaise)} tone={d.totals.toPayPaise ? "danger" : "default"} />
            <Stat label="Paid" value={formatINR(d.totals.paidPaise)} sub={`of ${formatINR(d.totals.completedValuePaise)} work`} />
          </StatGrid>
          {d.rows.map((r) => (
            <Card key={r.clientId} padded={false} onPress={() => router.push(`/clients/${r.clientId}`)}>
              <View style={{ padding: space.md + 2, gap: space.sm }}>
                <View>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {r.clientName}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {r.jobs} challan{r.jobs === 1 ? "" : "s"}
                    {r.activeJobs ? ` · ${r.activeJobs} active` : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.sm }}>
                  <Pair label="Sent" value={formatQty(r.sent)} />
                  <Pair label="Received" value={`${formatQty(r.received)}${r.exceptions ? ` (+${formatQty(r.exceptions)} issues)` : ""}`} />
                  <Pair label="Pending" value={formatQty(r.pending)} tone={r.pending ? "warning" : "muted"} />
                  <Pair label="Work completed" value={formatINR(r.completedValuePaise)} />
                  <Pair label="Paid" value={formatINR(r.paidPaise)} />
                  <Pair label="To pay" value={r.toPayPaise ? formatINR(r.toPayPaise) : "—"} tone={r.toPayPaise ? "danger" : "muted"} />
                </View>
              </View>
            </Card>
          ))}
          <TotalsCard title="Total">
            <Pair label="Challans" value={String(d.totals.jobs)} />
            <Pair label="Pending" value={formatQty(d.totals.pending)} />
            <Pair label="Work completed" value={formatINR(d.totals.completedValuePaise)} />
            <Pair label="To pay" value={formatINR(d.totals.toPayPaise)} />
          </TotalsCard>
        </View>
      )}
    </Loading>
  );
}

export function PaymentsReport({ filters }: { filters: ReportFilterValues }) {
  const q = useLegacy<{ rows: SubBillRow[]; summary: { completedPieces: number; completedValuePaise: number; subBillCount: number; voidedCount: number; paidPieces: number; paidPaise: number } }>(
    `/reports/payments${qs({ from: filters.from, to: filters.to, clientId: filters.clientId })}`,
  );
  return (
    <Loading q={q}>
      {(d) => (
        <View style={{ gap: space.sm }}>
          <StatGrid>
            <Stat label="Total paid" value={formatINR(d.summary.paidPaise)} sub={`${formatQty(d.summary.subBillCount)} vouchers${d.summary.voidedCount ? ` · ${d.summary.voidedCount} voided` : ""}`} />
            <Stat label="Returned OK" value={formatQty(d.summary.completedPieces)} sub={`worth ${formatINR(d.summary.completedValuePaise)}`} />
          </StatGrid>
          {d.rows.length === 0 ? (
            <EmptyState icon={ReceiptText} title="No payments in this period" />
          ) : (
            d.rows.map((r) => (
              <Card key={r.id} padded={false} onPress={() => router.push(`/bills/sub/${r.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md + 2, opacity: r.voidedAt ? 0.6 : 1 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {r.billNumber} · {r.client.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {formatDate(r.date)} · {r.job.jobNumber} · {PAYMENT_METHOD_LABEL[r.method]}
                      {r.qty ? ` · ${formatQty(r.qty)} pcs` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text variant="bodyStrong" num style={r.voidedAt ? { textDecorationLine: "line-through" } : undefined}>
                      {formatINR(r.amountPaise)}
                    </Text>
                    {r.voidedAt ? <Badge tone="neutral" label="Voided" /> : null}
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      )}
    </Loading>
  );
}

export function ToPayReport({ filters }: { filters: ReportFilterValues }) {
  const { c } = useTheme();
  const q = useLegacy<{ rows: UnpaidLine[]; byClient: { clientId: string; clientName: string; jobs: number; qty: number; valuePaise: number }[]; totals: { jobs: number; qty: number; valuePaise: number } }>(
    `/reports/to-pay${qs({ clientId: filters.clientId })}`,
  );
  return (
    <Loading q={q}>
      {(d) => (
        <View style={{ gap: space.sm }}>
          <StatGrid>
            <Stat label="To pay" value={formatINR(d.totals.valuePaise)} tone={d.totals.valuePaise ? "danger" : "default"} />
            <Stat label="Pieces" value={formatQty(d.totals.qty)} sub={`returned OK, not paid · ${d.totals.jobs} challans`} />
          </StatGrid>
          {d.rows.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing to pay" body="Every returned piece is paid for." />
          ) : (
            <>
              {d.byClient.length > 1 ? (
                <Card padded={false}>
                  {d.byClient.map((w, i) => (
                    <Pressable key={w.clientId} onPress={() => router.push(`/bills/new?clientId=${w.clientId}`)} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                      <Text style={{ flex: 1 }} numberOfLines={1}>
                        {w.clientName}{" "}
                        <Text variant="caption" tone="muted">
                          {formatQty(w.qty)} pcs
                        </Text>
                      </Text>
                      <Text variant="bodyStrong" num>
                        {formatINR(w.valuePaise)}
                      </Text>
                    </Pressable>
                  ))}
                </Card>
              ) : null}
              {d.rows.map((r) => (
                <Card key={r.jobItemId} padded={false} onPress={() => router.push(`/jobs/${r.jobId}`)}>
                  <View style={{ padding: space.md + 2, gap: space.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {r.jobNumber} · {r.clientName}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {r.designName} · {r.productName} · {formatINR(r.ratePaise)}
                        </Text>
                      </View>
                      <JobStatusBadge status={r.jobStatus} />
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.sm }}>
                      <Pair label="Received OK" value={formatQty(r.ok)} />
                      <Pair label="Paid pieces" value={r.billedQty ? formatQty(r.billedQty) : "—"} tone={r.billedQty ? undefined : "muted"} />
                      <Pair label="To pay pieces" value={formatQty(r.unbilledQty)} />
                      <Pair label="To pay" value={formatINR(r.unbilledValuePaise)} tone="danger" />
                    </View>
                    <Button title="Pay" variant="secondary" onPress={() => router.push(`/bills/new?jobId=${r.jobId}`)} />
                  </View>
                </Card>
              ))}
            </>
          )}
        </View>
      )}
    </Loading>
  );
}

/** The report's own body, by kind. */
export function ReportBody({ meta, filters }: { meta: ReportMeta; filters: ReportFilterValues }) {
  if (meta.id === "pending-material") return <PendingReport filters={filters} />;
  if (meta.id === "client-summary") return <ClientsReport filters={filters} />;
  if (meta.id === "payments") return <PaymentsReport filters={filters} />;
  if (meta.id === "to-pay") return <ToPayReport filters={filters} />;
  return <CatalogReport meta={meta} filters={filters} />;
}

/** Export path for the report with these filters (legacy reports take only their own params). */
export function exportPath(meta: ReportMeta, f: ReportFilterValues) {
  if (meta.id === "pending-material") return `/reports/pending-material${qs({ clientId: f.clientId, designId: f.designId, onlyPending: f.onlyPending })}`;
  if (meta.id === "client-summary") return `/reports/client-summary${qs({ includeInactive: f.includeInactive })}`;
  if (meta.id === "payments") return `/reports/payments${qs({ from: f.from, to: f.to, clientId: f.clientId })}`;
  if (meta.id === "to-pay") return `/reports/to-pay${qs({ clientId: f.clientId })}`;
  const { onlyPending: _a, includeInactive: _b, ...rest } = f;
  return reportPath(meta.id, rest);
}
