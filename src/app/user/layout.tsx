"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";

const baseNavItems: SidebarNavItem[] = [
  { to: "/user/home", label: "Home", icon: "home", tone: "sky" },
  { to: "/user/data-input", label: "Data Input", icon: "input", tone: "violet" },
];

export default function UserLayout({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();

  // Granted from Stage Roles (app_users.canCreateOrders) - hidden entirely
  // for anyone who doesn't have it, not just disabled.
  const withCreateOrders: SidebarNavItem[] = appUser?.canCreateOrders
    ? [...baseNavItems, { to: "/user/create-order", label: "Create Orders", icon: "createOrder", tone: "emerald" as const }]
    : baseNavItems;
  // Same idea, for job work (app_users.canJobWork).
  const navItems: SidebarNavItem[] = appUser?.canJobWork
    ? [...withCreateOrders, { to: "/user/job-work", label: "Job Work", icon: "factory", tone: "amber" as const }]
    : withCreateOrders;

  return (
    <SidebarShell portalLabel="Floor Portal" navItems={navItems} collapseKey="user-sidebar-collapsed">
      {children}
    </SidebarShell>
  );
}
