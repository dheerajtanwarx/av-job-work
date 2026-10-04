"use client";

import { formatDate, formatINR, JOB_STATUS_LABEL, type SearchResults } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Briefcase, Package, Palette, ReceiptText, Search, Users } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Kbd } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(dq)}`),
    enabled: dq.length > 0,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  const total = data ? data.clients.length + data.jobs.length + data.bills.length + data.products.length + data.designs.length : 0;

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-[overlay-in_120ms_ease-out] dark:bg-black/55" />
        <D.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-xl bg-surface shadow-overlay data-[state=open]:animate-[pop-in_120ms_ease-out] focus:outline-none">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search clients, jobs, bills, products and designs</D.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-fg-muted" />
              <Command.Input
                autoFocus
                value={q}
                onValueChange={setQ}
                placeholder="Search jobs, clients, bills, designs…"
                className="h-12 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint"
              />
              {isFetching && <span className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-fg-faint border-r-transparent" aria-hidden />}
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
              {!dq && <div className="px-3 py-8 text-center text-[13px] text-fg-muted">Client name, job or bill number, design, or a date like “04 Oct”</div>}
              {dq && data && total === 0 && <div className="px-3 py-8 text-center text-[13px] text-fg-muted">No results for “{dq}”</div>}
              {data && dq && (
                <>
                  <Group heading="Jobs">
                    {data.jobs.map((j) => (
                      <Row key={j.id} onSelect={() => go(`/jobs/${j.id}`)} icon={<Briefcase />} title={j.clientName} meta={j.jobNumber} sub={`${j.productName} · ${formatDate(j.jobDate)} · ${JOB_STATUS_LABEL[j.status]}`} />
                    ))}
                  </Group>
                  <Group heading="Clients">
                    {data.clients.map((c) => (
                      <Row key={c.id} onSelect={() => go(`/clients/${c.id}`)} icon={<Users />} title={c.name} sub={c.sub} />
                    ))}
                  </Group>
                  <Group heading="Bills">
                    {data.bills.map((b) => (
                      <Row key={b.id} onSelect={() => go(`/bills/${b.kind}/${b.id}`)} icon={<ReceiptText />} title={`${b.billNumber} · ${b.clientName}`} meta={formatINR(b.amountPaise)} sub={`${b.kind === "main" ? "Main bill" : "Sub bill"} · ${formatDate(b.date)}`} />
                    ))}
                  </Group>
                  <Group heading="Designs">
                    {data.designs.map((d) => (
                      <Row key={d.id} onSelect={() => go(`/jobs?designId=${d.id}`)} icon={<Palette />} title={d.name} sub="Jobs with this design" />
                    ))}
                  </Group>
                  <Group heading="Products">
                    {data.products.map((p) => (
                      <Row key={p.id} onSelect={() => go(`/jobs?productId=${p.id}`)} icon={<Package />} title={p.name} sub="Jobs for this product" />
                    ))}
                  </Group>
                </>
              )}
            </Command.List>
            <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-fg-muted sm:flex">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> Open</span>
              <span className="flex items-center gap-1"><Kbd>esc</Kbd> Close</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode[] }) {
  if (!children.length) return null;
  return (
    <Command.Group heading={heading} className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-faint">
      {children}
    </Command.Group>
  );
}

function Row({ onSelect, icon, title, sub, meta }: { onSelect: () => void; icon: ReactNode; title: string; sub?: string | null; meta?: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      value={title + (meta ?? "") + (sub ?? "")}
      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 data-[selected=true]:bg-surface-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-muted"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-fg">{title}</div>
        {sub && <div className="truncate text-xs text-fg-muted">{sub}</div>}
      </div>
      {meta && <span className={cn("shrink-0 text-xs text-fg-muted", meta.startsWith("₹") && "num")}>{meta}</span>}
    </Command.Item>
  );
}
