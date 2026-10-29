import {
  BadgePercent,
  CarFront,
  BarChart3,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  ScrollText,
  Settings,
  Store,
  Ticket,
  UserCog,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "~/features/auth/AuthProvider";

/** Minimum role per admin page. Mirrors the server-side checks; it does not replace them. */
export const ADMIN_NAV: { to: string; key: string; icon: LucideIcon; min: AppRole; end?: boolean }[] = [
  { to: "/admin", key: "overview", icon: LayoutDashboard, min: "staff", end: true },
  { to: "/admin/orders", key: "orders", icon: ClipboardList, min: "staff" },
  { to: "/admin/pickup", key: "pickup", icon: CarFront, min: "staff" },
  { to: "/admin/products", key: "products", icon: UtensilsCrossed, min: "manager" },
  { to: "/admin/categories", key: "categories", icon: FolderTree, min: "manager" },
  { to: "/admin/promotions", key: "promotions", icon: BadgePercent, min: "manager" },
  { to: "/admin/coupons", key: "coupons", icon: Ticket, min: "manager" },
  { to: "/admin/branches", key: "branches", icon: Store, min: "manager" },
  { to: "/admin/settings", key: "settings", icon: Settings, min: "manager" },
  { to: "/admin/customers", key: "customers", icon: Users, min: "manager" },
  { to: "/admin/reports", key: "reports", icon: BarChart3, min: "manager" },
  { to: "/admin/staff", key: "staff", icon: UserCog, min: "super_admin" },
  { to: "/admin/audit", key: "audit", icon: ScrollText, min: "manager" },
];

export function minRoleFor(pathname: string): AppRole {
  const match = [...ADMIN_NAV].sort((a, b) => b.to.length - a.to.length).find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return match?.min ?? "staff";
}
