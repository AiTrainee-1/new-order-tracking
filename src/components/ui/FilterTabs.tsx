"use client";

import { brandGradient, SHADOW_BRAND } from "@/lib/theme";

export interface FilterTab<T extends string> {
  key: T;
  label: string;
  count?: number;
}

/** Segmented sub-tabs used to slice a list by status (Started / Not Started /
 * Completed, Your Turn / Waiting / Completed, …). */
export function FilterTabs<T extends string>({ tabs, value, onChange }: { tabs: FilterTab<T>[]; value: T; onChange: (next: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            style={active ? brandGradient : undefined}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
              active
                ? `text-white ${SHADOW_BRAND}`
                : "border border-white/80 bg-white/70 text-ink-600 shadow-[0_8px_20px_-14px_rgba(30,41,90,0.45)] backdrop-blur-md hover:bg-white hover:text-ink-900"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600"}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
