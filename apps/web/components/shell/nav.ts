import {
  BarChart3,
  Boxes,
  Briefcase,
  Images,
  Layers,
  LayoutDashboard,
  ListChecks,
  Package,
  PackageCheck,
  Palette,
  ReceiptText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
}

export const mainNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
  { href: "/jobs", label: "Challans", icon: Briefcase },
  { href: "/returns/new", label: "Record Return", icon: PackageCheck, match: (p) => p === "/returns/new" },
  { href: "/returns", label: "Returns", icon: ListChecks, match: (p) => p === "/returns" || (p.startsWith("/returns/") && p !== "/returns/new") },
  { href: "/gallery", label: "Design Gallery", icon: Images },
  { href: "/bills", label: "Payments", icon: ReceiptText },
  { href: "/clients", label: "Job Workers", icon: Users },
  { href: "/materials", label: "Materials & Stock", icon: Boxes },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export const setupNav: NavItem[] = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/designs", label: "Designs", icon: Palette },
  { href: "/job-work-types", label: "Job Work Types", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/");
}
