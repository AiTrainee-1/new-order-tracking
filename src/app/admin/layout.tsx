import type { ReactNode } from "react";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";

const navItems: SidebarNavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "dashboard", tone: "sky" },
  { to: "/admin/orders", label: "Orders", icon: "orders", tone: "violet" },
  { to: "/admin/accessories", label: "Accessories", icon: "accessories", tone: "amber" },
  { to: "/admin/tracking-history", label: "Tracking History", icon: "history", tone: "sky" },
  { to: "/admin/reports", label: "Reports", icon: "reports", tone: "violet" },
  { to: "/admin/users", label: "Users", icon: "users", tone: "emerald" },
  { to: "/admin/assign", label: "Assign Work", icon: "assign", tone: "amber" },
  { to: "/admin/grouping", label: "Grouping", icon: "grouping", tone: "violet" },
  { to: "/admin/stage-roles", label: "Stage Roles", icon: "roles", tone: "rose" },
  { to: "/admin/account-management", label: "Account Management", icon: "lock", tone: "slate" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarShell portalLabel="Admin Portal" navItems={navItems} collapseKey="admin-sidebar-collapsed">
      {children}
    </SidebarShell>
  );
}
