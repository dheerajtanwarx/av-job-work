"use client";

import { formatDate, formatINR, formatQty, type InvoiceListRow, type JobStatus } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Download, PackageCheck, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PaymentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip, PageHeader } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { DateRange, Toolbar } from "@/components/ui/toolbar";
import { api, qs } from "@/lib/api";
import { useClients, useDesigns } from "@/lib/queries";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "pending", label: "Pending material" },
  { id: "clients", label: "Client summary" },
  { id: "billing", label: "Billing" },
  { id: "outstanding", label: "Outstanding" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Csv({ path }: { path: string }) {
  return (
    <Button asChild variant="secondary" size="sm" className="ml-auto">
      <a href={`/api${path}${path.includes("?") ? "&" : "?"}format=csv`}>
        <Download /> Export CSV
      </a>
    </Button>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] text-fg-2 select-none">
      <input type="checkbox" className="size-3.5 accent-[var(--accent-solid)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function ClientSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const clients = useClients(false);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-full sm:w-48" aria-label="Client">
      <option value="">All clients</option>
      {clients.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

/** Loading / error wrapper shared by every report table. */
function ReportBody<T>({ q, empty, children }: { q: { isPending: boolean; isError: boolean; error: unknown; data?: T; refetch: () => unknown }; empty: (d: T) => React.ReactNode | false; children: (d: T) => React.ReactNode }) {
  if (q.isPending)
    return (
      <Card className="overflow-hidden">
        <LoadingBlock rows={6} />
      </Card>
    );
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const e = empty(q.data);
  if (e) return <Card>{e}</Card>;
  return <Card className="overflow-hidden">{children(q.data)}</Card>;
}

const dash = <span className="text-fg-faint">—</span>;

// ───────── Pending material ─────────
interface PendingRow { jobId: string; jobNumber: string; jobStatus: JobStatus; jobDate: string; expectedReturnDate: string | null; overdue: boolean; daysOut: number; clientId: string; clientName: string; productName: string; designName: string; sent: number; received: number; exceptions: number; pending: number; pendingValuePaise: number }

function PendingReport() {
  const [clientId, setClientId] = useState("");
  const [designId, setDesignId] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const designs = useDesigns(false);
  const path = `/reports/pending-material${qs({ clientId, designId, onlyPending: onlyPending || undefined })}`;
  const q = useQuery({ queryKey: ["report", path], queryFn: () => api.get<{ rows: PendingRow[]; totals: { sent: number; received: number; exceptions: number; pending: number; pendingValuePaise: number } }>(path) });
  return (
    <>
      <p className="mb-4 text-[13px] text-fg-muted">Every job that still has pieces outside, design by design.</p>
      <Toolbar>
        <ClientSelect value={clientId} onChange={setClientId} />
        <Select value={designId} onChange={(e) => setDesignId(e.target.value)} className="w-full sm:w-48" aria-label="Design">
          <option value="">All designs</option>
          {designs.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Check checked={onlyPending} onChange={setOnlyPending}>
          Only lines with pending pieces
        </Check>
        <Csv path={path} />
      </Toolbar>
      <ReportBody q={q} empty={(d) => d.rows.length === 0 && <EmptyState icon={PackageCheck} title="Nothing is outside">Everything is back.</EmptyState>}>
        {(d) => (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Job</th>
                  <th>Design</th>
                  <th className="r">Sent</th>
                  <th className="r">Received</th>
                  <th className="r" title="Damaged / Rejected / Lost">Issues</th>
                  <th className="r">Pending</th>
                  <th className="r">Days out</th>
                  <th className="r">Pending value</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="max-w-48 truncate">
                      <Link href={`/clients/${r.clientId}`} className="hover:text-accent">
                        {r.clientName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/jobs/${r.jobId}`} className="font-medium hover:text-accent">
                        {r.jobNumber}
                      </Link>
                      {r.overdue && <span className="ml-2 text-xs font-medium text-danger">Overdue</span>}
                      <div className="text-xs text-fg-muted">{r.productName}</div>
                    </td>
                    <td className="text-fg-2">{r.designName}</td>
                    <td className="r">{formatQty(r.sent)}</td>
                    <td className="r">{formatQty(r.received)}</td>
                    <td className="r">{r.exceptions ? <span className="text-danger">{r.exceptions}</span> : dash}</td>
                    <td className="r">{r.pending ? <span className="font-medium text-warning">{formatQty(r.pending)}</span> : <span className="text-fg-muted">0</span>}</td>
                    <td className={cn("r", r.overdue ? "text-danger" : "text-fg-muted")}>{r.daysOut}</td>
                    <td className="r">{formatINR(r.pendingValuePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="r">{formatQty(d.totals.sent)}</td>
                  <td className="r">{formatQty(d.totals.received)}</td>
                  <td className="r">{formatQty(d.totals.exceptions)}</td>
                  <td className={cn("r", d.totals.pending > 0 && "text-warning")}>{formatQty(d.totals.pending)}</td>
                  <td />
                  <td className="r">{formatINR(d.totals.pendingValuePaise)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}
      </ReportBody>
    </>
  );
}

// ───────── Client summary ─────────
interface ClientRow { clientId: string; clientName: string; jobs: number; activeJobs: number; sent: number; received: number; exceptions: number; pending: number; completedValuePaise: number; unbilledPaise: number; billedPaise: number; paidPaise: number; outstandingPaise: number }

function ClientsReport() {
  const [all, setAll] = useState(false);
  const path = `/reports/client-summary${qs({ includeInactive: all || undefined })}`;
  const q = useQuery({ queryKey: ["report", path], queryFn: () => api.get<{ rows: ClientRow[]; totals: Omit<ClientRow, "clientId" | "clientName"> }>(path) });
  return (
    <>
      <Toolbar>
        <Check checked={all} onChange={setAll}>
          Include inactive clients
        </Check>
        <Csv path={path} />
      </Toolbar>
      <ReportBody q={q} empty={() => false}>
        {(d) => (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="r">Jobs</th>
                  <th className="r">Sent</th>
                  <th className="r">Received</th>
                  <th className="r">Pending</th>
                  <th className="r">Billed</th>
                  <th className="r">Paid</th>
                  <th className="r">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.clientId}>
                    <td className="max-w-56">
                      <Link href={`/clients/${r.clientId}`} className="block truncate font-medium hover:text-accent">
                        {r.clientName}
                      </Link>
                      {r.unbilledPaise > 0 && <div className="num text-xs text-fg-muted">{formatINR(r.unbilledPaise)} not billed</div>}
                    </td>
                    <td className="r">
                      {r.jobs}
                      {r.activeJobs > 0 && <div className="text-xs text-fg-muted">{r.activeJobs} active</div>}
                    </td>
                    <td className="r">{formatQty(r.sent)}</td>
                    <td className="r">
                      {formatQty(r.received)}
                      {r.exceptions > 0 && <div className="text-xs text-danger">+{r.exceptions} issues</div>}
                    </td>
                    <td className="r">{r.pending ? <span className="font-medium text-warning">{formatQty(r.pending)}</span> : <span className="text-fg-muted">0</span>}</td>
                    <td className="r">{formatINR(r.billedPaise)}</td>
                    <td className="r">{formatINR(r.paidPaise)}</td>
                    <td className="r">{r.outstandingPaise ? <span className="font-medium text-danger">{formatINR(r.outstandingPaise)}</span> : dash}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="r">{d.totals.jobs}</td>
                  <td className="r">{formatQty(d.totals.sent)}</td>
                  <td className="r">{formatQty(d.totals.received)}</td>
                  <td className="r">{formatQty(d.totals.pending)}</td>
                  <td className="r">{formatINR(d.totals.billedPaise)}</td>
                  <td className="r">{formatINR(d.totals.paidPaise)}</td>
                  <td className="r">{formatINR(d.totals.outstandingPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}
      </ReportBody>
    </>
  );
}

// ───────── Billing ─────────
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function BillingReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState("");
  const [clientId, setClientId] = useState("");
  const path = `/reports/billing${qs({ from, to, clientId })}`;
  const q = useQuery({
    queryKey: ["report", path],
    queryFn: () => api.get<{ rows: InvoiceListRow[]; summary: { completedPieces: number; completedValuePaise: number; invoiceCount: number; cancelledCount: number; billedPieces: number; billedPaise: number; paidPaise: number; outstandingPaise: number } }>(path),
  });
  const s = q.data?.summary;
  return (
    <>
      <Toolbar>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <ClientSelect value={clientId} onChange={setClientId} />
        <Csv path={path} />
      </Toolbar>
      {s && (
        <MetricStrip className="mb-4 grid-cols-2 lg:grid-cols-4">
          <Metric label="Pieces completed" value={formatQty(s.completedPieces)} sub={`Worth ${formatINR(s.completedValuePaise)}`} />
          <Metric label="Invoices" value={formatQty(s.invoiceCount)} sub={`${formatQty(s.billedPieces)} pieces${s.cancelledCount ? ` · ${s.cancelledCount} cancelled` : ""}`} />
          <Metric label="Total billed" value={formatINR(s.billedPaise)} sub={`${formatINR(s.paidPaise)} received`} />
          <Metric label="Outstanding" value={formatINR(s.outstandingPaise)} tone={s.outstandingPaise ? "danger" : "fg"} />
        </MetricStrip>
      )}
      <ReportBody q={q} empty={(d) => d.rows.length === 0 && <EmptyState icon={ReceiptText} title="No invoices in this period" />}>
        {(d) => (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th className="r">Pieces</th>
                  <th className="r">Total</th>
                  <th className="r">Paid</th>
                  <th className="r">Outstanding</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id} className={cn(r.status === "CANCELLED" && "text-fg-muted")}>
                    <td>
                      <Link href={`/invoices/${r.id}`} className="font-medium hover:text-accent">
                        {r.invoiceNumber}
                      </Link>
                    </td>
                    <td className="num whitespace-nowrap text-fg-2">{formatDate(r.date)}</td>
                    <td className="max-w-48 truncate">{r.client.name}</td>
                    <td className="r">{formatQty(r.qty)}</td>
                    <td className="r font-medium">{formatINR(r.totalPaise)}</td>
                    <td className="r">{formatINR(r.paidPaise)}</td>
                    <td className="r">{r.outstandingPaise ? formatINR(r.outstandingPaise) : dash}</td>
                    <td className="whitespace-nowrap">
                      <PaymentStatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </ReportBody>
    </>
  );
}

// ───────── Outstanding ─────────
function OutstandingReport() {
  const [clientId, setClientId] = useState("");
  const path = `/reports/outstanding${qs({ clientId })}`;
  const q = useQuery({
    queryKey: ["report", path],
    queryFn: () => api.get<{ rows: (InvoiceListRow & { ageDays: number })[]; byClient: { clientId: string; clientName: string; invoices: number; outstandingPaise: number }[]; totals: { invoices: number; unpaid: number; partial: number; outstandingPaise: number; totalPaise: number; paidPaise: number } }>(path),
  });
  const t = q.data?.totals;
  return (
    <>
      <Toolbar>
        <ClientSelect value={clientId} onChange={setClientId} />
        <Csv path={path} />
      </Toolbar>
      {t && (
        <MetricStrip className="mb-4 grid-cols-3">
          <Metric label="Outstanding" value={formatINR(t.outstandingPaise)} tone={t.outstandingPaise ? "danger" : "fg"} />
          <Metric label="Unpaid invoices" value={formatQty(t.unpaid)} />
          <Metric label="Partially paid" value={formatQty(t.partial)} />
        </MetricStrip>
      )}
      <ReportBody q={q} empty={(d) => d.rows.length === 0 && <EmptyState icon={Wallet} title="Nothing outstanding">Every invoice is paid.</EmptyState>}>
        {(d) => (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
            <TableWrap>
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th className="r">Days</th>
                    <th className="r">Total</th>
                    <th className="r">Paid</th>
                    <th className="r">Outstanding</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        <Link href={`/invoices/${r.id}`} className="font-medium hover:text-accent">
                          {r.invoiceNumber}
                        </Link>
                        <div className="num text-xs text-fg-muted">{formatDate(r.date)}</div>
                      </td>
                      <td className="max-w-48 truncate">{r.client.name}</td>
                      <td className={cn("r", r.ageDays > 30 ? "font-medium text-danger" : "text-fg-muted")}>{r.ageDays}</td>
                      <td className="r">{formatINR(r.totalPaise)}</td>
                      <td className="r">{r.paidPaise ? formatINR(r.paidPaise) : dash}</td>
                      <td className="r font-medium text-danger">{formatINR(r.outstandingPaise)}</td>
                      <td className="whitespace-nowrap">
                        <PaymentStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="border-t border-border lg:border-t-0 lg:border-l">
              <div className="flex h-[34px] items-center border-b border-border px-4 text-xs font-medium text-fg-muted">By client</div>
              <ul className="py-1">
                {d.byClient.map((c) => (
                  <li key={c.clientId}>
                    <Link href={`/clients/${c.clientId}`} className="flex items-baseline justify-between gap-3 px-4 py-1.5 text-[13px] transition-colors duration-100 hover:bg-surface-2">
                      <span className="min-w-0 truncate">
                        {c.clientName} <span className="num text-xs text-fg-faint">{c.invoices}</span>
                      </span>
                      <span className="num font-medium">{formatINR(c.outstandingPaise)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </ReportBody>
    </>
  );
}

function Reports() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "pending") as Tab;
  return (
    <>
      <PageHeader title="Reports" subtitle="Where your material is, and where your money is." />
      <Tabs className="mb-5" value={tab} onChange={(id) => router.replace(`${path}?tab=${id}`, { scroll: false })} items={TABS.map((t) => ({ value: t.id, label: t.label }))} />
      {tab === "pending" && <PendingReport />}
      {tab === "clients" && <ClientsReport />}
      {tab === "billing" && <BillingReport />}
      {tab === "outstanding" && <OutstandingReport />}
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
