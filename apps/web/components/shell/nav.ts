import { BarChart3, Briefcase, LayoutDashboard, Package, PackageCheck, Palette, ReceiptText, Settings, Users, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
}

export const mainNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/returns/new", label: "Record return", icon: PackageCheck, match: (p) => p.startsWith("/returns") },
  { href: "/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export const setupNav: NavItem[] = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/designs", label: "Designs", icon: Palette },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/");
}
