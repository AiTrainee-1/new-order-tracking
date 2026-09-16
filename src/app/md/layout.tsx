import type { ReactNode } from "react";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";

const navItems: SidebarNavItem[] = [
  { to: "/md/dashboard", label: "Dashboard", icon: "📊", tone: "sky" },
  { to: "/md/users", label: "Users", icon: "👥", tone: "emerald" },
];

/** MD is a read-only login (see proxy.ts's role gating) - unlike Admin,
 *  nothing under here writes anything. */
export default function MdLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarShell portalLabel="MD Portal" navItems={navItems} collapseKey="md-sidebar-collapsed">
      {children}
    </SidebarShell>
  );
}
