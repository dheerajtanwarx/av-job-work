"use client";

import { L, type JobWorkType } from "@av/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { JobWorkTypeDialog } from "@/components/forms/master-dialogs";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, MobileList, TableWrap } from "@/components/ui/card";
import { CardListSkeleton, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useJobWorkTypes } from "@/lib/queries";
import { cn } from "@/lib/utils";

function ActiveSwitch({ t }: { t: JobWorkType }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (isActive: boolean) => api.put(`/job-work-types/${t.id}`, { isActive }),
    onSuccess: (_d, isActive) => {
      qc.invalidateQueries({ queryKey: ["job-work-types"] });
      toast.success(`${t.name} ${isActive ? "activated" : "deactivated"}`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      role="switch"
      aria-checked={t.isActive}
      aria-label={`${t.name} active`}
      disabled={m.isPending}
      onClick={(e) => {
        e.stopPropagation();
        m.mutate(!t.isActive);
      }}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 pointer-coarse:h-6 pointer-coarse:w-11", t.isActive ? "bg-accent-solid" : "bg-border-strong")}
    >
      <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform pointer-coarse:size-5", t.isActive ? "translate-x-4.5 pointer-coarse:translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

export default function JobWorkTypesPage() {
  const q = useJobWorkTypes(false);
  const [editing, setEditing] = useState<JobWorkType | null>(null);
  const [open, setOpen] = useState(false);
  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const edit = (t: JobWorkType) => {
    setEditing(t);
    setOpen(true);
  };
  return (
    <>
      <PageHeader
        title={L.jobWorkTypes}
        subtitle="Kinds of work done by job workers – Embroidery, Printing, Stitching…"
        actions={
          <Button onClick={openNew}>
            <Plus /> Add type
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <>
            <div className="max-sm:hidden">
              <LoadingBlock />
            </div>
            <CardListSkeleton className="sm:hidden" rows={3} />
          </>
        ) : q.isError ? (
          <div className="p-4">
            <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
          </div>
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={`No ${L.jobWorkTypes.toLowerCase()} yet`}
            action={
              <Button onClick={openNew}>
                <Plus /> Add type
              </Button>
            }
          >
            Add Embroidery, Printing, Stitching or any other work you send out.
          </EmptyState>
        ) : (
          <>
            <TableWrap className="max-sm:hidden">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th className="r">Challans</th>
                    <th>Status</th>
                    <th className="r">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((t) => (
                    <tr key={t.id} tabIndex={0} className={cn("row-link focus-visible:outline-offset-[-2px]", !t.isActive && "text-fg-muted")} onClick={() => edit(t)} onKeyDown={(e) => e.key === "Enter" && edit(t)}>
                      <td>
                        <div className="font-medium">{t.name}</div>
                        {t.description && <div className="text-xs text-fg-muted">{t.description}</div>}
                      </td>
                      <td className="num text-fg-muted">{t.code ?? "—"}</td>
                      <td className="r">
                        {t.jobCount ? (
                          <Link href="/jobs" onClick={(e) => e.stopPropagation()} className="text-fg-2 hover:text-accent">
                            {t.jobCount}
                          </Link>
                        ) : (
                          <span className="text-fg-faint">0</span>
                        )}
                      </td>
                      <td>{t.isActive ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="neutral">Inactive</StatusBadge>}</td>
                      <td className="r">
                        <ActiveSwitch t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <MobileList className="sm:hidden">
              {q.data.map((t) => (
                <li key={t.id} className={cn("flex min-h-14 items-center gap-3 px-4 py-3", !t.isActive && "text-fg-muted")}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => edit(t)}>
                    <div className="truncate text-[13px] font-medium">{t.name}</div>
                    <div className="truncate text-xs text-fg-muted">{[t.code, `${t.jobCount ?? 0} challans`, t.isActive ? "Active" : "Inactive"].filter(Boolean).join(" · ")}</div>
                  </button>
                  <ActiveSwitch t={t} />
                </li>
              ))}
            </MobileList>
          </>
        )}
      </Card>
      <JobWorkTypeDialog open={open} onOpenChange={setOpen} type={editing} />
    </>
  );
}
