"use client";

import { brandGradient, SHADOW_BRAND, SHADOW_NEO_PRESSED } from "@/lib/theme";

export interface TabItem<T extends string> {
  key: T;
  label: string;
}

/** A single contained tab track - for switching between views of the *same*
 * thing (e.g. Data Entry / Details on one order), as opposed to FilterTabs'
 * loose chips for slicing a list. The pressed-in track plus a raised, brand-
 * gradient active pill is what reads as "tabs" rather than a toggle button. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabItem<T>[]; value: T; onChange: (next: T) => void }) {
  return (
    <div className={`inline-flex gap-1 rounded-2xl border border-white/60 bg-[#EEF2FA] p-1 ${SHADOW_NEO_PRESSED}`}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            style={active ? brandGradient : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${active ? `text-white ${SHADOW_BRAND}` : "text-ink-600 hover:text-ink-900"}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
