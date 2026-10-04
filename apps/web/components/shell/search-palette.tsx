"use client";

import { formatDate, formatINR, JOB_STATUS_LABEL, type SearchResults } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Briefcase, Package, Palette, ReceiptText, Search, Users } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

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

  const total = data ? data.clients.length + data.jobs.length + data.invoices.length + data.products.length + data.designs.length : 0;

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px]" />
        <D.Content className="fixed top-[8vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-pop)]">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search clients, jobs, invoices, products and designs</D.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-5 text-muted" />
              <Command.Input
                autoFocus
                value={q}
                onValueChange={setQ}
                placeholder="Search client, job no., invoice no., design, date…"
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-faint"
              />
              {isFetching && <span className="size-4 animate-spin rounded-full border-2 border-indigo border-r-transparent" />}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {!dq && <div className="px-3 py-6 text-center text-sm text-muted">Try “Sharma”, “JOB-001”, “INV-002”, “Floral” or a date like “04 Oct”.</div>}
              {dq && data && total === 0 && <div className="px-3 py-6 text-center text-sm text-muted">No matches for “{dq}”.</div>}
              {data && dq && (
                <>
                  <Group heading="Jobs">
                    {data.jobs.map((j) => (
                      <Row key={j.id} onSelect={() => go(`/jobs/${j.id}`)} icon={<Briefcase />} title={`${j.jobNumber} · ${j.clientName}`} sub={`${j.productName} · ${formatDate(j.jobDate)} · ${JOB_STATUS_LABEL[j.status]}`} />
                    ))}
                  </Group>
                  <Group heading="Clients">
                    {data.clients.map((c) => (
                      <Row key={c.id} onSelect={() => go(`/clients/${c.id}`)} icon={<Users />} title={c.name} sub={c.sub} />
                    ))}
                  </Group>
                  <Group heading="Invoices">
                    {data.invoices.map((i) => (
                      <Row key={i.id} onSelect={() => go(`/invoices/${i.id}`)} icon={<ReceiptText />} title={`${i.invoiceNumber} · ${i.clientName}`} sub={`${formatDate(i.date)} · ${formatINR(i.totalPaise)}`} />
                    ))}
                  </Group>
                  <Group heading="Designs">
                    {data.designs.map((d) => (
                      <Row key={d.id} onSelect={() => go(`/jobs?designId=${d.id}`)} icon={<Palette />} title={d.name} sub="Show jobs with this design" />
                    ))}
                  </Group>
                  <Group heading="Products">
                    {data.products.map((p) => (
                      <Row key={p.id} onSelect={() => go(`/jobs?productId=${p.id}`)} icon={<Package />} title={p.name} sub="Show jobs for this product" />
                    ))}
                  </Group>
                </>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode[] }) {
  if (!children.length) return null;
  return (
    <Command.Group heading={heading} className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:uppercase">
      {children}
    </Command.Group>
  );
}

function Row({ onSelect, icon, title, sub }: { onSelect: () => void; icon: ReactNode; title: string; sub?: string | null }) {
  return (
    <Command.Item onSelect={onSelect} value={title + (sub ?? "")} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-indigo-50 [&_svg]:size-4 [&_svg]:text-indigo">
      {icon}
      <div className="min-w-0">
        <div className="truncate font-medium">{title}</div>
        {sub && <div className="truncate text-sm text-muted">{sub}</div>}
      </div>
    </Command.Item>
  );
}
