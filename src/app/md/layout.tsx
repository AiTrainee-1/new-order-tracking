import type { ReactNode } from "react";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";

const navItems: SidebarNavItem[] = [
  { to: "/md/dashboard", label: "Dashboard", icon: "dashboard", tone: "sky", section: "Overview" },
  { to: "/md/orders", label: "Orders", icon: "orders", tone: "violet", section: "Overview" },
  { to: "/md/accessories", label: "Accessories", icon: "accessories", tone: "amber", section: "Overview" },
  { to: "/md/TNA", label: "TNA", icon: "tna", tone: "teal", section: "Overview", badge: "tna" },
  { to: "/md/users", label: "Users", icon: "users", tone: "emerald", section: "Team" },
];

/** MD is a read-only login (see proxy.ts's role gating) - unlike Admin,
 *  nothing under here writes anything. */
export default function MdLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarShell portalLabel="MD Portal" navItems={navItems} collapseKey="md-sidebar-collapsed" fullBleedPaths={["/md/TNA"]}>
      {children}
    </SidebarShell>
  );
}
