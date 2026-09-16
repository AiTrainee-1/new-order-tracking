"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/ui/BrandMark";
import { NavLink } from "@/components/ui/NavLink";
import { brandGradient, iconGradient, sidebarBackground, spatialBackground, SHADOW_BRAND, type IconTone } from "@/lib/theme";

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: string;
  tone: IconTone;
}

/**
 * Shared sidebar shell for the three authenticated layouts (Admin/MD/User).
 * The old app hand-duplicated this near-verbatim across AdminLayout.tsx,
 * MdLayout.tsx and UserLayout.tsx (MD's own comment called itself "a
 * near-verbatim copy of AdminLayout, deliberately") - consolidated here
 * during the port since a fix to one would otherwise need to be repeated
 * three times. Each layout still gets its own portal label, nav items, and
 * localStorage collapse key.
 */
export function SidebarShell({
  portalLabel,
  navItems,
  collapseKey,
  children,
}: {
  portalLabel: string;
  navItems: SidebarNavItem[];
  collapseKey: string;
  children: ReactNode;
}) {
  const { appUser, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(collapseKey) === "1";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(collapseKey, next ? "1" : "0");
      } catch {
        // Storage unavailable (private mode, etc.) - the toggle still works
        // for this visit, it just won't be remembered next time.
      }
      return next;
    });
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen font-app" style={spatialBackground}>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-ink-950/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <button
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/80 text-ink-800 shadow-[0_8px_20px_-10px_rgba(30,41,90,0.5)] backdrop-blur-xl md:hidden"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      <aside
        style={sidebarBackground}
        className={`fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-white/70 shadow-[10px_0_36px_-18px_rgba(30,41,90,0.35)] backdrop-blur-2xl transition-all duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${collapsed ? "md:w-20" : "md:w-64"}`}
      >
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-16 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-white text-ink-500 shadow-[0_4px_10px_-2px_rgba(30,41,90,0.35)] transition-colors hover:text-brand md:flex"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path
              d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="h-1 shrink-0" style={brandGradient} />
        <div
          className={`flex shrink-0 items-center gap-2.5 border-b border-white/70 px-5 py-5 ${collapsed ? "md:justify-center md:px-3" : ""}`}
        >
          <span className="flex items-center justify-center rounded-xl border border-white/80 bg-white px-2 py-1.5 shadow-[0_8px_20px_-12px_rgba(30,41,90,0.5)]">
            <BrandMark size={26} />
          </span>
          <div className={collapsed ? "md:hidden" : ""}>
            <p className="text-sm font-bold tracking-tight text-ink-900">UK TEXTILES</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{portalLabel}</p>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              href={item.to}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={(isActive) =>
                `flex items-center gap-2.5 rounded-xl py-2 pl-2 pr-3 text-sm font-semibold transition-all ${
                  collapsed ? "md:justify-center md:px-0" : ""
                } ${
                  isActive
                    ? `text-white ${SHADOW_BRAND}`
                    : "text-ink-600 hover:bg-white/70 hover:text-ink-900"
                }`
              }
              style={(isActive) => (isActive ? brandGradient : undefined)}
            >
              {(isActive) => (
                <>
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm shadow-sm"
                    style={isActive ? { backgroundColor: "rgba(255,255,255,0.22)" } : iconGradient[item.tone]}
                  >
                    {item.icon}
                  </span>
                  <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/70 px-4 py-4">
          <div
            className={`flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 shadow-[0_8px_20px_-14px_rgba(30,41,90,0.4)] ${collapsed ? "md:justify-center md:px-0" : ""}`}
            title={collapsed ? `${appUser?.name} · @${appUser?.username}` : undefined}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md"
              style={brandGradient}
            >
              {appUser?.name?.charAt(0).toUpperCase()}
            </span>
            <div className={`min-w-0 ${collapsed ? "md:hidden" : ""}`}>
              <p className="truncate text-sm font-semibold text-ink-900">{appUser?.name}</p>
              <p className="truncate font-mono text-xs text-ink-500">@{appUser?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs font-semibold text-ink-600 transition-colors hover:bg-white hover:text-ink-900"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={collapsed ? "md:hidden" : ""}>Logout</span>
          </button>
        </div>
      </aside>

      <main
        className={`min-h-screen overflow-y-auto p-4 pt-16 transition-all duration-200 md:p-8 md:pt-8 ${collapsed ? "md:ml-20" : "md:ml-64"}`}
      >
        {children}
      </main>
    </div>
  );
}
