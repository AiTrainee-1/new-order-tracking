"use client";

export type FilterTabTone = "good" | "warn" | "bad" | "info" | "neutral";

export interface FilterTab<T extends string> {
  key: T;
  label: string;
  count?: number;
  /** A small coloured dot before the label - the status the tab stands for. */
  tone?: FilterTabTone;
}

const DOT: Record<FilterTabTone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  info: "bg-sky-500",
  neutral: "bg-slate-400",
};

/**
 * A segmented control for slicing a list by status (Started / Not Started /
 * Completed, Your Turn / Waiting / Completed, ...): one frosted track holding
 * the options, the selected one lifted out of it as a white pill with its count
 * tinted brand-blue. Scrolls sideways on a narrow screen rather than wrapping
 * into a ragged stack.
 */
export function FilterTabs<T extends string>({ tabs, value, onChange }: { tabs: FilterTab<T>[]; value: T; onChange: (next: T) => void }) {
  return (
    <div className="max-w-full overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="tablist" className="inline-flex min-w-max items-center gap-1 rounded-2xl border border-white/80 bg-ink-100/60 p-1 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur">
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-semibold outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 ${
                active ? "bg-white text-brand shadow-[0_4px_14px_-4px_rgba(21,94,239,0.4),0_1px_2px_rgba(15,23,42,0.08)]" : "text-ink-600 hover:bg-white/60 hover:text-ink-900"
              }`}
            >
              {tab.tone && <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tab.tone]} ${active ? "ring-2 ring-white" : ""}`} aria-hidden />}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums ${active ? "bg-brand/10 text-brand" : "bg-white/80 text-ink-500"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
