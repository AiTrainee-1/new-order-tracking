import type { ReactNode } from "react";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";

const navItems: SidebarNavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: "📊", tone: "sky" },
  { to: "/admin/orders", label: "Orders", icon: "📦", tone: "violet" },
  { to: "/admin/users", label: "Users", icon: "👥", tone: "emerald" },
  { to: "/admin/assign", label: "Assign Work", icon: "📝", tone: "amber" },
  { to: "/admin/stage-roles", label: "Stage Roles", icon: "🎯", tone: "rose" },
  { to: "/admin/account-management", label: "Account Management", icon: "🔐", tone: "slate" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarShell portalLabel="Admin Portal" navItems={navItems} collapseKey="admin-sidebar-collapsed">
      {children}
    </SidebarShell>
  );
}
