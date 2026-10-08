"use client";

import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/ui/BrandMark";
import { NavLink } from "@/components/ui/NavLink";
import { brandGradient, sidebarBackground, spatialBackdrop, SHADOW_BRAND, type IconTone } from "@/lib/theme";
import { NAV_ICONS, type NavIconName } from "./NavIcons";

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: NavIconName;
  tone: IconTone;
}

/** What each tone tints an icon tile with while its row is hovered. */
const TONE: Record<IconTone, { fg: string; bg: string }> = {
  sky: { fg: "#1D6FE0", bg: "rgba(56,189,248,0.22)" },
  amber: { fg: "#C26A06", bg: "rgba(251,191,36,0.26)" },
  emerald: { fg: "#047857", bg: "rgba(52,211,153,0.24)" },
  violet: { fg: "#6D28D9", bg: "rgba(167,139,250,0.26)" },
  rose: { fg: "#BE123C", bg: "rgba(251,113,133,0.22)" },
  slate: { fg: "#334155", bg: "rgba(148,163,184,0.28)" },
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/*
 * One grid for the whole rail, so nothing drifts between expanded (w-64) and
 * collapsed (w-20):
 *   rail padding 12px  +  row padding 12px  +  32px tile  ->  tile centre at x = 40px
 * which is exactly half of the 80px collapsed width. The logo, every nav
 * tile, the avatar and the logout icon all sit on that same centre line.
 */
const ROW =
  "group relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand/40";
const ROW_IDLE = "text-ink-600 hover:bg-white/80 hover:text-ink-900 hover:shadow-[0_8px_18px_-10px_rgba(30,41,90,0.45)]";
const TILE = "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-all duration-200";
const TILE_IDLE =
  "bg-white/70 text-ink-500 shadow-sm ring-1 ring-white/80 group-hover:scale-110 group-hover:bg-[var(--tone-bg)] group-hover:text-[var(--tone-fg)]";
const TILE_ACTIVE = "bg-white/20 text-white ring-1 ring-white/25";

function toneVars(tone: IconTone): CSSProperties {
  return { "--tone-fg": TONE[tone].fg, "--tone-bg": TONE[tone].bg } as CSSProperties;
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
  // The collapsed rail has no labels, so hovering/focusing a row shows its
  // name in a tooltip. It's drawn by the <aside> (not by the row) because the
  // nav scrolls, and a scroll container would clip a tooltip poking out of it.
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null);

  function toggleCollapsed() {
    setTip(null);
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

  function tipHandlers(label: string) {
    const show = (e: SyntheticEvent<HTMLElement>) => {
      if (!collapsed) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, y: r.top + r.height / 2 });
    };
    return { onMouseEnter: show, onFocus: show, onMouseLeave: () => setTip(null), onBlur: () => setTip(null) };
  }

  const initial = appUser?.name?.charAt(0).toUpperCase();
  const userLabel = appUser ? `${appUser.name} · @${appUser.username}` : "";
  const LogoutIcon = NAV_ICONS.logout;
  const ChevronRight = NAV_ICONS.chevronRight;
  const Collapse = collapsed ? NAV_ICONS.chevronRight : NAV_ICONS.chevronLeft;

  return (
    <div className="relative isolate min-h-screen font-app">
      {/* The page backdrop as ONE fixed layer. As a `background-attachment: fixed`
          background on this wrapper, the browser repainted all five gradients on
          every scroll frame - on a long page full of cards that is what made
          scrolling (and eventually the tab) fall over. A fixed element is
          composited once and simply stays put. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={spatialBackdrop} />

      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-ink-950/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <button
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
        className={`fixed top-3 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/80 text-ink-800 shadow-[0_8px_20px_-10px_rgba(30,41,90,0.5)] backdrop-blur-xl transition-all duration-200 md:hidden ${
          // Open: tucks into the drawer's top-right corner instead of covering the logo.
          mobileOpen ? "left-[13.25rem]" : "left-3"
        }`}
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      <aside
        style={sidebarBackground}
        className={`fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-white/70 shadow-[10px_0_36px_-18px_rgba(30,41,90,0.35)] transition-all duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${collapsed ? "md:w-20" : "md:w-64"}`}
      >
        {/* Sits on the divider under the header, half in and half out of the rail. */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="group/toggle absolute -right-3 top-[69px] z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-white text-ink-500 shadow-[0_4px_10px_-2px_rgba(30,41,90,0.35)] transition-all duration-200 hover:scale-110 hover:text-brand hover:shadow-[0_6px_14px_-2px_rgba(21,94,239,0.45)] md:flex"
        >
          <Collapse className="h-3.5 w-3.5 transition-transform duration-200 group-hover/toggle:scale-110" />
        </button>

        <div className="h-1 shrink-0" style={brandGradient} />
        <div className="flex shrink-0 items-center gap-3 border-b border-white/70 px-3 py-4">
          <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white shadow-[0_8px_20px_-12px_rgba(30,41,90,0.5)]">
            <BrandMark size={24} />
          </span>
          <div className={cx("min-w-0", collapsed && "md:hidden")}>
            <p className="truncate text-sm font-extrabold tracking-tight text-ink-900">UK TEXTILES</p>
            <span className="mt-0.5 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
              {portalLabel}
            </span>
          </div>
        </div>

        <nav
          onScroll={() => setTip(null)}
          className="flex-1 space-y-1 overflow-y-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <p className={cx("px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400", collapsed && "md:hidden")}>Menu</p>
          <div className={cx("mx-auto mb-2 hidden h-px w-8 bg-ink-200", collapsed && "md:block")} />

          {navItems.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            return (
              <NavLink
                key={item.to}
                href={item.to}
                ariaLabel={item.label}
                onClick={() => setMobileOpen(false)}
                {...tipHandlers(item.label)}
                className={(isActive) => cx(ROW, isActive ? `text-white ${SHADOW_BRAND}` : ROW_IDLE)}
                style={(isActive) => (isActive ? brandGradient : toneVars(item.tone))}
              >
                {(isActive) => (
                  <>
                    <span className={cx(TILE, isActive ? TILE_ACTIVE : TILE_IDLE)}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className={cx("min-w-0 flex-1 truncate", collapsed && "md:hidden")}>{item.label}</span>
                    {/* Out of the flex flow (absolute) so an invisible chevron never steals room from a long label. */}
                    {isActive ? (
                      <span aria-hidden className={cx("absolute right-3.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/90", collapsed && "md:hidden")} />
                    ) : (
                      <ChevronRight
                        className={cx(
                          "absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-50",
                          collapsed && "md:hidden",
                        )}
                      />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-white/70 px-3 py-3">
          <div
            {...tipHandlers(userLabel)}
            className="flex h-14 items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-[11px] shadow-[0_8px_20px_-14px_rgba(30,41,90,0.4)]"
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md" style={brandGradient}>
              {initial}
              <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
            </span>
            <div className={cx("min-w-0 flex-1", collapsed && "md:hidden")}>
              <p className="truncate text-[13px] font-semibold leading-tight text-ink-900">{appUser?.name}</p>
              <p className="truncate font-mono text-[11px] leading-tight text-ink-500">@{appUser?.username}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout"
            {...tipHandlers("Logout")}
            style={toneVars("rose")}
            className={cx(ROW, ROW_IDLE)}
          >
            <span className={cx(TILE, TILE_IDLE)}>
              <LogoutIcon className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
            <span className={cx("min-w-0 flex-1 truncate text-left", collapsed && "md:hidden")}>Logout</span>
          </button>
        </div>

        {collapsed && tip && (
          <span
            role="tooltip"
            style={{ top: tip.y }}
            className="pointer-events-none absolute left-[calc(100%+12px)] z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_10px_24px_-8px_rgba(15,23,42,0.6)] md:block"
          >
            <span aria-hidden className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[2px] bg-ink-900" />
            {tip.label}
          </span>
        )}
      </aside>

      <main
        className={`min-h-screen overflow-y-auto p-4 pt-16 transition-all duration-200 md:p-8 md:pt-8 ${collapsed ? "md:ml-20" : "md:ml-64"}`}
      >
        {children}
      </main>
    </div>
  );
}
