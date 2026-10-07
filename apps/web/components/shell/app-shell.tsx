"use client";

import { USER_ROLE_LABEL, type SessionUser } from "@av/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isActive, mainNav, setupNav, type NavItem } from "./nav";
import { SearchPalette } from "./search-palette";

function Mark({ className }: { className?: string }) {
  return <span className={cn("grid size-5 place-items-center rounded bg-accent-solid text-[11px] leading-none font-semibold text-on-accent", className)}>J</span>;
}

function NavLinks({ items, path, onNavigate }: { items: NavItem[]; path: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-px">
      {items.map((item) => {
        const active = isActive(item, path);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-[30px] items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-100 pointer-coarse:h-10",
                active ? "bg-surface text-fg shadow-[0_0_0_1px_var(--border),var(--shadow-xs-value)]" : "text-fg-2 hover:bg-surface-3/70 hover:text-fg",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-muted group-hover:text-fg-2")} strokeWidth={1.75} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Sidebar({
  path,
  onNavigate,
  onLogout,
  onSearch,
  user,
}: {
  path: string;
  onNavigate?: () => void;
  onLogout: () => void;
  onSearch: () => void;
  user?: SessionUser;
}) {
  const initials = user?.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      <Link href="/" onClick={onNavigate} className="mx-3 mt-3 flex h-8 items-center gap-2 rounded-md px-1.5 text-[13px] font-semibold text-fg">
        <Mark />
        AV JOB WORK     
        </Link>
      <div className="mx-3 mt-3 flex gap-1.5">
        <button
          onClick={onSearch}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2 text-left text-[13px] text-fg-faint shadow-xs transition-colors hover:border-border-strong hover:text-fg-muted pointer-coarse:h-10"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
        <Link
          href="/jobs/new"
          onClick={onNavigate}
          aria-label="New job"
          title="New job"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-solid text-on-accent shadow-xs transition-colors hover:bg-accent-solid-hover pointer-coarse:size-10"
        >
          <Plus className="size-4" />
        </Link>
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto px-3" aria-label="Main">
        <NavLinks items={mainNav} path={path} onNavigate={onNavigate} />
        <div className="mt-5 mb-1 px-2 text-[11px] font-medium text-fg-faint">Setup</div>
        <NavLinks items={setupNav} path={path} onNavigate={onNavigate} />
      </nav>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold text-fg-2">{initials || "?"}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-fg">{user?.name}</div>
          <div className="truncate text-[11px] text-fg-muted" title={user?.email}>
            {user ? USER_ROLE_LABEL[user.role] : ""}
            {user?.email && <span className="text-fg-faint"> · {user.email}</span>}
          </div>
        </div>
        <button onClick={onLogout} aria-label="Log out" title="Log out" className="grid size-7 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg">
          <LogOut className="size-3.5" />
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
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ user: SessionUser }>("/auth/me"), staleTime: 60_000, retry: false });

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
      <div className="grid min-h-dvh place-items-center" aria-busy aria-label="Loading">
        <span className="size-4 animate-spin rounded-full border-[1.5px] border-fg-faint border-r-transparent" />
      </div>
    );
  }

  const user = me.data?.user;
  const current = [...mainNav, ...setupNav].find((i) => isActive(i, path));

  return (
    <div className="min-h-dvh lg:pl-[232px]">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[232px] lg:block">
        <Sidebar path={path} onLogout={logout} onSearch={() => setSearch(true)} user={user} />
      </aside>

      {/* Mobile drawer */}
      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[overlay-in_150ms_ease-out] lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] shadow-overlay data-[state=open]:animate-[drawer-in_180ms_cubic-bezier(0.2,0.8,0.2,1)] focus:outline-none lg:hidden">
            <D.Title className="sr-only">Menu</D.Title>
            <D.Description className="sr-only">Navigation</D.Description>
            <Sidebar
              path={path}
              onNavigate={() => setDrawer(false)}
              onLogout={logout}
              onSearch={() => {
                setDrawer(false);
                setSearch(true);
              }}
              user={user}
            />
          </D.Content>
        </D.Portal>
      </D.Root>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-20 flex h-12 items-center gap-1 border-b border-border bg-bg/90 px-2 backdrop-blur-md lg:hidden">
        <button className="grid size-10 place-items-center rounded-md text-fg-2 hover:bg-surface-2" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu className="size-[18px]" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{current?.label ?? "AV JOB WORK"}</span>
        <button className="grid size-10 place-items-center rounded-md text-fg-2 hover:bg-surface-2" onClick={() => setSearch(true)} aria-label="Search">
          <Search className="size-[18px]" />
        </button>
        <Link href="/jobs/new" aria-label="New job" className="grid size-10 place-items-center rounded-md text-accent hover:bg-surface-2">
          <Plus className="size-5" />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-24 sm:px-6 sm:pt-8 lg:px-10 lg:pb-16 min-[1800px]:max-w-[1400px]">{children}</main>

      {/* Mobile bottom bar */}
      <nav aria-label="Quick" className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="grid h-14 grid-cols-5">
          {[mainNav[0], mainNav[1], mainNav[2], mainNav[3], mainNav[5]].map((item) => {
            const active = isActive(item, path);
            const isReturn = item.href === "/returns/new";
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-fg" : "text-fg-muted")}
                >
                  <item.icon className={cn("size-[18px]", isReturn && !active && "text-accent")} strokeWidth={active ? 2 : 1.75} />
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
