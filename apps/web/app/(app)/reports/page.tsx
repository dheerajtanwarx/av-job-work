"use client";

import { formatDate, formatINR, formatQty, type InvoiceListRow, type JobStatus } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { JobStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { LoadingBlock, PageHeader, Stat } from "@/components/ui/misc";
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
    <Button asChild variant="secondary" size="sm">
      <a href={`/api${path}${path.includes("?") ? "&" : "?"}format=csv`}><Download /> Download CSV</a>
    </Button>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="no-print mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

function ClientSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const clients = useClients(false);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-52" aria-label="Client">
      <option value="">All clients</option>
      {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  );
}

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
      <Toolbar>
        <ClientSelect value={clientId} onChange={setClientId} />
        <Select value={designId} onChange={(e) => setDesignId(e.target.value)} className="w-48" aria-label="Design">
          <option value="">All designs</option>
          {designs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" className="size-4 accent-indigo" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Only lines with pending pieces</label>
        <div className="ml-auto"><Csv path={path} /></div>
      </Toolbar>
      <p className="mb-3 text-sm text-muted">Where is my material right now? Every job that still has pieces outside, design by design.</p>
      <Card>
        {q.isPending ? <LoadingBlock /> : q.data!.rows.length === 0 ? <p className="p-6 text-center text-muted">No material is outside. Everything is back.</p> : (
          <TableWrap>
            <table className="ledger">
              <thead><tr><th>Client</th><th>Job</th><th>Design</th><th className="r">Sent</th><th className="r">Received</th><th className="r">Dmg/Rej/Lost</th><th className="r">Pending</th><th className="r">Days out</th><th className="r">Pending value</th></tr></thead>
              <tbody>
                {q.data!.rows.map((r, i) => (
                  <tr key={i}>
                    <td><Link href={`/clients/${r.clientId}`} className="font-medium hover:text-indigo">{r.clientName}</Link></td>
                    <td className="whitespace-nowrap"><Link href={`/jobs/${r.jobId}`} className="font-semibold text-indigo hover:underline">{r.jobNumber}</Link>{r.overdue && <span className="ml-1"><JobStatusBadge status={r.jobStatus} overdue /></span>}<div className="text-xs text-muted">{r.productName}</div></td>
                    <td>{r.designName}</td>
                    <td className="r num">{formatQty(r.sent)}</td>
                    <td className="r num">{formatQty(r.received)}</td>
                    <td className="r num">{r.exceptions || <span className="text-faint">—</span>}</td>
                    <td className="r num">{r.pending ? <b className="text-marigold-700">{formatQty(r.pending)}</b> : <span className="text-leaf">0</span>}</td>
                    <td className="r num text-muted">{r.daysOut}</td>
                    <td className="r num">{formatINR(r.pendingValuePaise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total</td><td className="r num">{formatQty(q.data!.totals.sent)}</td><td className="r num">{formatQty(q.data!.totals.received)}</td><td className="r num">{formatQty(q.data!.totals.exceptions)}</td><td className="r num text-marigold-700">{formatQty(q.data!.totals.pending)}</td><td /><td className="r num">{formatINR(q.data!.totals.pendingValuePaise)}</td></tr></tfoot>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

// ───────── Client summary ─────────
interface ClientRow { clientId: string; clientName: string; jobs: number; activeJobs: number; sent: number; received: number; exceptions: number; pending: number; completedValuePaise: number; unbilledPaise: number; billedPaise: number; paidPaise: number; outstandingPaise: number }

function ClientsReport() {
  const [all, setAll] = useState(false);
  const path = `/reports/client-summary${qs({ includeInactive: all || undefined })}`;
  const q = useQuery({ queryKey: ["report", path], queryFn: () => api.get<{ rows: ClientRow[]; totals: Omit<ClientRow, "clientId" | "clientName"> }>(path) });
  const t = q.data?.totals;
  return (
    <>
      <Toolbar>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-indigo" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include inactive clients</label>
        <div className="ml-auto"><Csv path={path} /></div>
      </Toolbar>
      <Card>
        {q.isPending ? <LoadingBlock /> : (
          <TableWrap>
            <table className="ledger">
              <thead><tr><th>Client</th><th className="r">Jobs</th><th className="r">Sent</th><th className="r">Received</th><th className="r">Pending</th><th className="r">Billed</th><th className="r">Paid</th><th className="r">Outstanding</th></tr></thead>
              <tbody>
                {q.data!.rows.map((r) => (
                  <tr key={r.clientId}>
                    <td><Link href={`/clients/${r.clientId}`} className="font-semibold hover:text-indigo">{r.clientName}</Link>{r.unbilledPaise > 0 && <div className="text-xs text-muted">{formatINR(r.unbilledPaise)} not billed</div>}</td>
                    <td className="r num">{r.jobs}{r.activeJobs > 0 && <div className="text-xs text-muted">{r.activeJobs} active</div>}</td>
                    <td className="r num">{formatQty(r.sent)}</td>
                    <td className="r num">{formatQty(r.received)}{r.exceptions > 0 && <div className="text-xs text-madder">+{r.exceptions} issues</div>}</td>
                    <td className="r num">{r.pending ? <b className="text-marigold-700">{formatQty(r.pending)}</b> : "0"}</td>
                    <td className="r num">{formatINR(r.billedPaise)}</td>
                    <td className="r num text-leaf">{formatINR(r.paidPaise)}</td>
                    <td className="r num">{r.outstandingPaise ? <b className="text-madder">{formatINR(r.outstandingPaise)}</b> : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {t && <tfoot><tr><td>Total</td><td className="r num">{t.jobs}</td><td className="r num">{formatQty(t.sent)}</td><td className="r num">{formatQty(t.received)}</td><td className="r num">{formatQty(t.pending)}</td><td className="r num">{formatINR(t.billedPaise)}</td><td className="r num">{formatINR(t.paidPaise)}</td><td className="r num">{formatINR(t.outstandingPaise)}</td></tr></tfoot>}
            </table>
          </TableWrap>
        )}
      </Card>
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
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
        <span className="text-muted">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
        <ClientSelect value={clientId} onChange={setClientId} />
        <div className="ml-auto"><Csv path={path} /></div>
      </Toolbar>
      {s && (
        <Card className="mb-4 grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
          <Stat label="Pieces completed" value={formatQty(s.completedPieces)} sub={`worth ${formatINR(s.completedValuePaise)}`} />
          <Stat label="Invoices" value={s.invoiceCount} sub={`${formatQty(s.billedPieces)} pieces${s.cancelledCount ? ` · ${s.cancelledCount} cancelled` : ""}`} />
          <Stat label="Total billed" value={formatINR(s.billedPaise)} tone="indigo" sub={`${formatINR(s.paidPaise)} received`} />
          <Stat label="Outstanding" value={formatINR(s.outstandingPaise)} tone={s.outstandingPaise ? "madder" : "muted"} />
        </Card>
      )}
      <Card>
        {q.isPending ? <LoadingBlock /> : q.data!.rows.length === 0 ? <p className="p-6 text-center text-muted">No invoices in this period.</p> : (
          <TableWrap>
            <table className="ledger">
              <thead><tr><th>Invoice</th><th>Date</th><th>Client</th><th className="r">Pieces</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Outstanding</th><th>Status</th></tr></thead>
              <tbody>
                {q.data!.rows.map((r) => (
                  <tr key={r.id} className={cn(r.status === "CANCELLED" && "opacity-55")}>
                    <td><Link href={`/invoices/${r.id}`} className="font-semibold text-indigo hover:underline">{r.invoiceNumber}</Link></td>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.client.name}</td>
                    <td className="r num">{formatQty(r.qty)}</td>
                    <td className="r num">{formatINR(r.totalPaise)}</td>
                    <td className="r num">{formatINR(r.paidPaise)}</td>
                    <td className="r num">{formatINR(r.outstandingPaise)}</td>
                    <td><PaymentStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
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
        <div className="ml-auto"><Csv path={path} /></div>
      </Toolbar>
      {t && (
        <Card className="mb-4 grid grid-cols-3 gap-5 p-5">
          <Stat label="Outstanding" value={formatINR(t.outstandingPaise)} tone={t.outstandingPaise ? "madder" : "leaf"} size="lg" />
          <Stat label="Unpaid invoices" value={t.unpaid} />
          <Stat label="Partially paid" value={t.partial} tone="marigold" />
        </Card>
      )}
      {q.isPending ? <LoadingBlock /> : q.data!.rows.length === 0 ? <Card><p className="p-6 text-center text-muted">Nothing outstanding. Every invoice is paid. 🎉</p></Card> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          <Card>
            <TableWrap>
              <table className="ledger">
                <thead><tr><th>Invoice</th><th>Client</th><th className="r">Days</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Outstanding</th><th>Status</th></tr></thead>
                <tbody>
                  {q.data!.rows.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/invoices/${r.id}`} className="font-semibold text-indigo hover:underline">{r.invoiceNumber}</Link><div className="text-xs text-muted">{formatDate(r.date)}</div></td>
                      <td>{r.client.name}</td>
                      <td className={cn("r num", r.ageDays > 30 && "font-semibold text-madder")}>{r.ageDays}</td>
                      <td className="r num">{formatINR(r.totalPaise)}</td>
                      <td className="r num text-leaf">{formatINR(r.paidPaise)}</td>
                      <td className="r num font-bold text-madder">{formatINR(r.outstandingPaise)}</td>
                      <td><PaymentStatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
          <Card className="self-start p-5">
            <div className="mb-3 text-sm font-semibold text-muted uppercase">By client</div>
            <ul className="space-y-2">
              {q.data!.byClient.map((c) => (
                <li key={c.clientId} className="flex justify-between gap-2">
                  <Link href={`/clients/${c.clientId}`} className="truncate hover:text-indigo">{c.clientName} <span className="text-xs text-muted">({c.invoices})</span></Link>
                  <span className="num font-semibold text-madder">{formatINR(c.outstandingPaise)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
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
      <div className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-card p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => router.replace(`${path}?tab=${t.id}`, { scroll: false })} className={cn("rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap", tab === t.id ? "bg-indigo text-white" : "text-muted hover:bg-paper-2 hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>
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
