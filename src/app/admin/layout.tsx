import type { ReactNode } from "react";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";

const navItems: SidebarNavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "dashboard", tone: "sky", section: "Overview" },
  { to: "/admin/orders", label: "Orders", icon: "orders", tone: "violet", section: "Overview" },
  { to: "/admin/accessories", label: "Accessories", icon: "accessories", tone: "amber", section: "Overview" },
  { to: "/admin/tracking-history", label: "Tracking History", icon: "history", tone: "cyan", section: "Insights" },
  { to: "/admin/reports", label: "Reports", icon: "reports", tone: "fuchsia", section: "Insights" },
  { to: "/admin/users", label: "Users", icon: "users", tone: "emerald", section: "Manage" },
  { to: "/admin/assign", label: "Assign Work", icon: "assign", tone: "orange", section: "Manage" },
  { to: "/admin/grouping", label: "Grouping", icon: "grouping", tone: "indigo", section: "Manage" },
  { to: "/admin/stage-roles", label: "Stage Roles", icon: "roles", tone: "rose", section: "Manage" },
  { to: "/admin/account-management", label: "Account Management", icon: "lock", tone: "slate", section: "Manage" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarShell portalLabel="Admin Portal" navItems={navItems} collapseKey="admin-sidebar-collapsed">
      {children}
    </SidebarShell>
  );
}
