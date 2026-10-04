"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, PackageCheck, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isActive, mainNav, setupNav, type NavItem } from "./nav";
import { SearchPalette } from "./search-palette";

function NavLinks({ items, path, onNavigate }: { items: NavItem[]; path: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item, path);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-[0.95rem] font-medium transition-colors",
                active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/6 hover:text-white",
              )}
            >
              <item.icon className={cn("size-[1.15rem]", active ? "text-marigold" : "text-white/55 group-hover:text-white/80")} strokeWidth={2} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Sidebar({ path, onNavigate, onLogout, userName }: { path: string; onNavigate?: () => void; onLogout: () => void; userName?: string }) {
  return (
    <div className="flex h-full flex-col bg-indigo-600 text-white">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <span className="grid size-9 place-items-center rounded-xl bg-marigold font-display text-lg font-bold text-ink">J</span>
        <span className="leading-tight">
          <span className="block font-display text-[1.05rem] font-semibold">Job Work Ledger</span>
          <span className="block text-xs text-white/55">Sent · Received · Paid</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3">
        <NavLinks items={mainNav} path={path} onNavigate={onNavigate} />
        <div className="mt-6 mb-2 px-3 text-[0.7rem] font-semibold tracking-[0.14em] text-white/40 uppercase">Setup</div>
        <NavLinks items={setupNav} path={path} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-white/10 p-3">
        <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 hover:bg-white/6 hover:text-white">
          <LogOut className="size-4" />
          <span className="flex-1 truncate text-left">Log out{userName ? ` (${userName})` : ""}</span>
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ user: { name: string; email: string } }>("/auth/me"), staleTime: Infinity, retry: false });

  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (me.isError) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [me.isError, router]);

  async function logout() {
    await api.post("/auth/logout");
    qc.clear();
    router.replace("/login");
  }

  if (me.isPending || me.isError) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <span className="size-6 animate-spin rounded-full border-2 border-indigo border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar path={path} onLogout={logout} userName={me.data?.user.name} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-[rise_0.2s_ease] shadow-[var(--shadow-pop)]">
            <button className="absolute top-5 right-3 z-10 rounded-md p-1 text-white/70" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar path={path} onNavigate={() => setDrawer(false)} onLogout={logout} userName={me.data?.user.name} />
          </div>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button className="-ml-1 rounded-lg p-2 text-ink lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <button
            onClick={() => setSearch(true)}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-left text-faint transition-colors hover:border-indigo/40 sm:max-w-md"
          >
            <Search className="size-4 shrink-0 text-muted" />
            <span className="flex-1 truncate">Search jobs, clients, invoices…</span>
            <span className="hidden sm:inline">
              <Kbd>⌘K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="secondary" className="hidden sm:inline-flex">
              <Link href="/returns/new">
                <PackageCheck /> Record Return
              </Link>
            </Button>
            <Button asChild>
              <Link href="/jobs/new">
                <Plus /> <span className="hidden sm:inline">New Job</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">{children}</main>

      {/* Mobile bottom bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="grid grid-cols-5">
          {[mainNav[0], mainNav[1], mainNav[2], mainNav[3], mainNav[5]].map((item) => {
            const active = isActive(item, path);
            const isReturn = item.href === "/returns/new";
            return (
              <li key={item.href}>
                <Link href={item.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[0.68rem] font-semibold", active ? "text-indigo" : "text-muted")}>
                  <span className={cn("grid place-items-center rounded-full", isReturn ? "-mt-5 size-11 bg-marigold text-ink shadow-[var(--shadow-pop)]" : "size-6")}>
                    <item.icon className="size-5" />
                  </span>
                  {isReturn ? "Return" : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <SearchPalette open={search} onOpenChange={setSearch} />
    </div>
  );
}
