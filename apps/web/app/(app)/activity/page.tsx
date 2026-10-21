"use client";

import { ACTIVITY_FOLDERS, type ActivityFolderKey, type ActivityFolders, type UserRow } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Briefcase, ChevronLeft, Folder, History, PackageCheck, Palette, ReceiptText, RefreshCw, ShieldCheck, Truck, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ActivityList } from "@/components/activity/activity-list";
import { formatDateTime } from "@/components/billing/notification-status";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { DateRange, SearchInput, Toolbar } from "@/components/ui/toolbar";
import { api, qs } from "@/lib/api";
import { useRole } from "@/lib/returns";
import { cn } from "@/lib/utils";

const FOLDER_ICON: Record<ActivityFolderKey, LucideIcon> = {
  workers: Users,
  challans: Briefcase,
  issues: Truck,
  returns: PackageCheck,
  payments: ReceiptText,
  stock: Boxes,
  masters: Palette,
  team: ShieldCheck,
};

const KEYS = ["view", "folder", "worker", "kind", "userId", "from", "to", "q"] as const;
type Key = (typeof KEYS)[number];

export default function ActivityPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Activity />
    </Suspense>
  );
}

/** Activity monitor: everything anyone did, filed in folders by record type or by job worker. Owner only. */
function Activity() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const { isOwner, known } = useRole();
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<Key, string>;
  const [q, setQ] = useState(f.q);
  const [find, setFind] = useState("");
  const setParams = (patch: Partial<Record<Key, string>>) => router.replace(`${path}${qs({ ...f, ...patch })}`, { scroll: false });
  useEffect(() => {
    const t = setTimeout(() => q !== f.q && setParams({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const folders = useQuery({
    queryKey: ["activity-folders", f.from, f.to],
    queryFn: () => api.get<ActivityFolders>(`/activity/folders${qs({ from: f.from, to: f.to })}`),
    enabled: isOwner,
  });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users"), enabled: isOwner });

  if (known && !isOwner) {
    return (
      <EmptyState icon={History} title="Owner only">
        Only the owner can see the activity monitor.
      </EmptyState>
    );
  }

  const view = f.view === "workers" ? "workers" : "types";
  const type = ACTIVITY_FOLDERS.find((x) => x.key === f.folder);
  const worker = f.worker ? folders.data?.workers.find((w) => w.clientId === f.worker) : undefined;
  const open = f.folder === "all" || !!type || !!f.worker;
  const title = f.folder === "all" ? "All activity" : type ? type.label : f.worker ? (worker?.name ?? "Job worker") : null;
  const back = () => {
    setQ("");
    setParams({ folder: "", worker: "", q: "", kind: "" });
  };

  const filters = (
    <Toolbar>
      {open && <SearchInput value={q} onChange={setQ} placeholder="Search details…" label="Search activity" />}
      {open && (
        <Segmented
          label="Show"
          value={f.kind === "edits" ? "edits" : "all"}
          onChange={(v) => setParams({ kind: v === "edits" ? "edits" : "" })}
          options={[
            { value: "all", label: "Everything" },
            { value: "edits", label: "Edits & voids" },
          ]}
        />
      )}
      {open && (
        <Select aria-label="Done by" value={f.userId} onChange={(e) => setParams({ userId: e.target.value })} className="w-40">
          <option value="">Anyone</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      )}
      <DateRange from={f.from} to={f.to} onFrom={(v) => setParams({ from: v })} onTo={(v) => setParams({ to: v })} />
      {(f.from || f.to || f.userId || f.kind || f.q) && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            setParams({ from: "", to: "", userId: "", kind: "", q: "" });
          }}
        >
          <X /> Clear
        </Button>
      )}
      <Button variant="ghost" size="icon" title="Refresh" aria-label="Refresh" className="ml-auto" onClick={() => folders.refetch()}>
        <RefreshCw className={cn(folders.isFetching && "animate-spin")} />
      </Button>
    </Toolbar>
  );

  if (open) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow={
            <button onClick={back} className="inline-flex items-center gap-0.5 hover:text-fg">
              <ChevronLeft className="size-3.5" /> Activity
            </button>
          }
          title={title}
          subtitle={worker?.code ? `Job worker ${worker.code} · every challan, issue, return and payment` : "Newest first. Nothing here can be edited or deleted."}
          actions={
            f.worker ? (
              <Link href={`/clients/${f.worker}`} className="text-[13px] font-medium text-accent hover:underline">
                Open job worker
              </Link>
            ) : undefined
          }
        />
        {filters}
        <ActivityList
          showWorker={!f.worker}
          filter={{
            folder: type?.key,
            clientId: f.worker || undefined,
            userId: f.userId || undefined,
            kind: f.kind === "edits" ? "edits" : undefined,
            from: f.from || undefined,
            to: f.to || undefined,
            q: f.q || undefined,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Activity" subtitle="Everything anyone did, filed in folders. Nothing here can be edited or deleted." />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Folders"
          value={view}
          onChange={(v) => setParams({ view: v === "workers" ? "workers" : "" })}
          options={[
            { value: "types", label: "By type" },
            { value: "workers", label: "By job worker" },
          ]}
        />
        {view === "workers" && <SearchInput value={find} onChange={setFind} placeholder="Find a job worker…" label="Find a job worker" />}
      </div>
      {filters}
      {folders.isPending ? (
        <LoadingBlock rows={4} />
      ) : folders.isError ? (
        <ErrorBlock error={folders.error} onRetry={() => folders.refetch()} />
      ) : view === "types" ? (
        <FolderGrid>
          <FolderCard href={`${path}${qs({ folder: "all", from: f.from, to: f.to })}`} icon={History} label="All activity" count={folders.data.total} />
          {folders.data.types.map((t) => (
            <FolderCard key={t.key} href={`${path}${qs({ folder: t.key, from: f.from, to: f.to })}`} icon={FOLDER_ICON[t.key]} label={t.label} count={t.count} lastAt={t.lastAt} />
          ))}
        </FolderGrid>
      ) : (
        <WorkerFolders data={folders.data} search={find} link={(id) => `${path}${qs({ view: "workers", worker: id, from: f.from, to: f.to })}`} />
      )}
    </div>
  );
}

function WorkerFolders({ data, search, link }: { data: ActivityFolders; search: string; link: (clientId: string) => string }) {
  const needle = search.trim().toLowerCase();
  const shown = data.workers.filter((w) => !needle || w.name.toLowerCase().includes(needle) || w.code?.toLowerCase().includes(needle));
  if (!shown.length) {
    return (
      <EmptyState icon={Folder} title={needle ? "No job worker matches" : "No job worker activity yet"}>
        {needle ? "Try another name or code." : "Adding a job worker or a challan starts their folder."}
      </EmptyState>
    );
  }
  return (
    <FolderGrid>
      {shown.map((w) => (
        <FolderCard key={w.clientId} href={link(w.clientId)} icon={Folder} label={w.name} sub={w.code} count={w.count} lastAt={w.lastAt} />
      ))}
    </FolderGrid>
  );
}

function FolderGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

function FolderCard({ href, icon: Icon, label, sub, count, lastAt }: { href: string; icon: LucideIcon; label: string; sub?: string | null; count: number; lastAt?: string | null }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-fg group-hover:text-accent">{label}</span>
          <span className="num shrink-0 text-[13px] font-semibold text-fg-2">{count.toLocaleString("en-IN")}</span>
        </span>
        {sub && <span className="block truncate text-xs text-fg-muted">{sub}</span>}
        <span className="mt-0.5 block truncate text-xs text-fg-faint">{lastAt ? `Last: ${formatDateTime(lastAt)}` : "Nothing yet"}</span>
      </span>
    </Link>
  );
}
