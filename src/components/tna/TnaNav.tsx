"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The two TNA pages as a tab switch: the monitoring View, and the Assignment editor. */
export function TnaNav() {
  const pathname = usePathname() ?? "";
  const onAssign = pathname.toLowerCase().startsWith("/admin/tna/assign");
  const tabs = [
    { href: "/admin/TNA", label: "TNA View", hint: "Monitor", active: !onAssign },
    { href: "/admin/TNA/assign", label: "TNA Assignment", hint: "Plan", active: onAssign },
  ];
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-2xl border border-white/60 bg-[#EEF2FA] p-1 shadow-[inset_0_2px_4px_rgba(15,23,42,0.05)]">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            t.active ? "bg-brand-gradient text-white shadow-[0_12px_30px_-8px_rgba(21,94,239,0.55)]" : "text-ink-600 hover:text-ink-900"
          }`}
        >
          {t.label}
          <span className={`hidden rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide sm:inline ${t.active ? "bg-white/20 text-white" : "bg-white text-ink-400"}`}>{t.hint}</span>
        </Link>
      ))}
    </div>
  );
}
