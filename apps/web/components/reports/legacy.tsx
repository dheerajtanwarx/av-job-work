"use client";

/** The four original reports, unchanged in shape (their JSON is used by tests and other screens). */
import { formatDate, formatINR, formatQty, L, PAYMENT_METHOD_LABEL, type JobStatus, type SubBillRow, type UnpaidLine } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, PackageCheck, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BillStatusBadge, JobStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, TableWrap } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, Metric, MetricStrip } from "@/components/ui/misc";
import { DateRange, Toolbar } from "@/components/ui/toolbar";
import { api, qs } from "@/lib/api";
import { useClients, useDesigns } from "@/lib/queries";
import { cn } from "@/lib/utils";

function Csv({ path }: { path: string }) {
  const sep = path.includes("?") ? "&" : "?";
  return (
    <div className="ml-auto flex gap-2">
      <Button asChild variant="secondary" size="sm">
        <a href={`/api${path}${sep}format=csv`}>
          <Download /> CSV
        </a>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <a href={`/api${path}${sep}format=xlsx`}>
          <FileSpreadsheet /> Excel
        </a>
      </Button>
    </div>
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
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-full sm:w-48" aria-label={L.client}>
      <option value="">All {L.clients.toLowerCase()}</option>
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

export function PendingReport() {
  const [clientId, setClientId] = useState("");
  const [designId, setDesignId] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const designs = useDesigns(false);
  const path = `/reports/pending-material${qs({ clientId, designId, onlyPending: onlyPending || undefined })}`;
  const q = useQuery({ queryKey: ["report", path], queryFn: () => api.get<{ rows: PendingRow[]; totals: { sent: number; received: number; exceptions: number; pending: number; pendingValuePaise: number } }>(path) });
  return (
    <>
      <p className="mb-4 text-[13px] text-fg-muted">Every challan that still has material outside, design by design.</p>
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
                  <th>{L.client}</th>
                  <th>{L.job}</th>
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
interface ClientRow { clientId: string; clientName: string; jobs: number; activeJobs: number; sent: number; received: number; exceptions: number; pending: number; completedValuePaise: number; paidPaise: number; toPayPaise: number }

export function ClientsReport() {
  const [all, setAll] = useState(false);
  const path = `/reports/client-summary${qs({ includeInactive: all || undefined })}`;
  const q = useQuery({ queryKey: ["report", path], queryFn: () => api.get<{ rows: ClientRow[]; totals: Omit<ClientRow, "clientId" | "clientName"> }>(path) });
  return (
    <>
      <Toolbar>
        <Check checked={all} onChange={setAll}>
          Include inactive workers
        </Check>
        <Csv path={path} />
      </Toolbar>
      <ReportBody q={q} empty={() => false}>
        {(d) => (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr>
                  <th>{L.client}</th>
                  <th className="r">{L.jobs}</th>
                  <th className="r">Sent</th>
                  <th className="r">Received</th>
                  <th className="r">Pending</th>
                  <th className="r">Work done</th>
                  <th className="r">Paid</th>
                  <th className="r">To pay</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.clientId}>
                    <td className="max-w-56">
                      <Link href={`/clients/${r.clientId}`} className="block truncate font-medium hover:text-accent">
                        {r.clientName}
                      </Link>
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
                    <td className="r">{formatINR(r.completedValuePaise)}</td>
                    <td className="r">{formatINR(r.paidPaise)}</td>
                    <td className="r">{r.toPayPaise ? <span className="font-medium text-danger">{formatINR(r.toPayPaise)}</span> : dash}</td>
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
                  <td className="r">{formatINR(d.totals.completedValuePaise)}</td>
                  <td className="r">{formatINR(d.totals.paidPaise)}</td>
                  <td className="r">{formatINR(d.totals.toPayPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}
      </ReportBody>
    </>
  );
}

// ───────── Payments ─────────
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function PaymentsReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState("");
  const [clientId, setClientId] = useState("");
  const path = `/reports/payments${qs({ from, to, clientId })}`;
  const q = useQuery({
    queryKey: ["report", path],
    queryFn: () => api.get<{ rows: SubBillRow[]; summary: { completedPieces: number; completedValuePaise: number; subBillCount: number; voidedCount: number; paidPieces: number; paidPaise: number } }>(path),
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
        <MetricStrip className="mb-4 grid-cols-3">
          <Metric label="Pieces returned OK" value={formatQty(s.completedPieces)} sub={`Worth ${formatINR(s.completedValuePaise)}`} />
          <Metric label={L.subBills} value={formatQty(s.subBillCount)} sub={`${formatQty(s.paidPieces)} pieces${s.voidedCount ? ` · ${s.voidedCount} voided` : ""}`} />
          <Metric label="Total paid" value={formatINR(s.paidPaise)} />
        </MetricStrip>
      )}
      <ReportBody q={q} empty={(d) => d.rows.length === 0 && <EmptyState icon={ReceiptText} title="No payments in this period" />}>
        {(d) => (
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr>
                  <th>{L.subBill}</th>
                  <th>Date</th>
                  <th>Job worker</th>
                  <th>{L.job}</th>
                  <th className="r">Pieces</th>
                  <th className="r">Amount</th>
                  <th>Paid by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id} className={cn(r.voidedAt && "text-fg-muted")}>
                    <td>
                      <Link href={`/bills/sub/${r.id}`} className="font-medium hover:text-accent">
                        {r.billNumber}
                      </Link>
                    </td>
                    <td className="num whitespace-nowrap text-fg-2">{formatDate(r.date)}</td>
                    <td className="max-w-48 truncate">{r.client.name}</td>
                    <td className="whitespace-nowrap">
                      <Link href={`/jobs/${r.job.id}`} className="hover:text-accent">
                        {r.job.jobNumber}
                      </Link>
                    </td>
                    <td className="r">{formatQty(r.qty)}</td>
                    <td className={cn("r font-medium", r.voidedAt && "line-through decoration-fg-faint")}>{formatINR(r.amountPaise)}</td>
                    <td className="whitespace-nowrap text-fg-2">{PAYMENT_METHOD_LABEL[r.method]}</td>
                    <td className="whitespace-nowrap">
                      <BillStatusBadge state={r.voidedAt ? "voided" : "paid"} />
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

// ───────── To pay ─────────
export function ToPayReport() {
  const [clientId, setClientId] = useState("");
  const path = `/reports/to-pay${qs({ clientId })}`;
  const q = useQuery({
    queryKey: ["report", path],
    queryFn: () =>
      api.get<{ rows: UnpaidLine[]; byClient: { clientId: string; clientName: string; jobs: number; qty: number; valuePaise: number }[]; totals: { jobs: number; qty: number; valuePaise: number } }>(path),
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
          <Metric label="To pay" value={formatINR(t.valuePaise)} tone={t.valuePaise ? "danger" : "fg"} />
          <Metric label="Pieces" value={formatQty(t.qty)} sub="Returned OK, not paid" />
          <Metric label="Jobs" value={formatQty(t.jobs)} />
        </MetricStrip>
      )}
      <ReportBody q={q} empty={(d) => d.rows.length === 0 && <EmptyState icon={Wallet} title="Nothing to pay">Every returned piece is paid for.</EmptyState>}>
        {(d) => (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
            <TableWrap>
              <table className="ledger">
                <thead>
                  <tr>
                    <th>{L.job}</th>
                    <th>Job worker</th>
                    <th>Design</th>
                    <th className="r">OK back</th>
                    <th className="r">Paid</th>
                    <th className="r">To pay</th>
                    <th className="r">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.jobItemId}>
                      <td className="whitespace-nowrap">
                        <Link href={`/jobs/${r.jobId}`} className="font-medium hover:text-accent">
                          {r.jobNumber}
                        </Link>
                        <div className="mt-0.5">
                          <JobStatusBadge status={r.jobStatus} />
                        </div>
                      </td>
                      <td className="max-w-48 truncate">{r.clientName}</td>
                      <td>
                        {r.designName}
                        <div className="text-xs text-fg-muted">
                          {r.productName} · {formatINR(r.ratePaise)}
                        </div>
                      </td>
                      <td className="r">{formatQty(r.ok)}</td>
                      <td className="r">{r.billedQty ? formatQty(r.billedQty) : dash}</td>
                      <td className="r font-medium">{formatQty(r.unbilledQty)}</td>
                      <td className="r font-medium text-danger">{formatINR(r.unbilledValuePaise)}</td>
                      <td className="r">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/bills/new?jobId=${r.jobId}`}>Pay</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="border-t border-border lg:border-t-0 lg:border-l">
              <div className="flex h-[34px] items-center border-b border-border px-4 text-xs font-medium text-fg-muted">By job worker</div>
              <ul className="py-1">
                {d.byClient.map((c) => (
                  <li key={c.clientId}>
                    <Link href={`/bills/new?clientId=${c.clientId}`} className="flex items-baseline justify-between gap-3 px-4 py-1.5 text-[13px] transition-colors duration-100 hover:bg-surface-2">
                      <span className="min-w-0 truncate">
                        {c.clientName} <span className="num text-xs text-fg-faint">{formatQty(c.qty)} pcs</span>
                      </span>
                      <span className="num font-medium">{formatINR(c.valuePaise)}</span>
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

