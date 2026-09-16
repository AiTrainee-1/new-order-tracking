"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";
import type { IconTone } from "@/lib/theme";

const baseNavItems: SidebarNavItem[] = [
  { to: "/user/home", label: "Home", icon: "🏠", tone: "sky" },
  { to: "/user/data-input", label: "Data Input", icon: "✍️", tone: "violet" },
];

export default function UserLayout({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();

  // Granted from Stage Roles (app_users.canCreateOrders) - hidden entirely
  // for anyone who doesn't have it, not just disabled.
  const withCreateOrders = appUser?.canCreateOrders
    ? [...baseNavItems, { to: "/user/create-order", label: "Create Orders", icon: "🧾", tone: "emerald" as IconTone }]
    : baseNavItems;
  // Same idea, for job work (app_users.canJobWork).
  const navItems = appUser?.canJobWork
    ? [...withCreateOrders, { to: "/user/job-work", label: "Job Work", icon: "🏭", tone: "amber" as IconTone }]
    : withCreateOrders;

  return (
    <SidebarShell portalLabel="Floor Portal" navItems={navItems} collapseKey="user-sidebar-collapsed">
      {children}
    </SidebarShell>
  );
}
