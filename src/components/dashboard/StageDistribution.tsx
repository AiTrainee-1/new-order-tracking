"use client";

import type { StageCount } from "@/lib/dashboard";
import { AccentCard, SectionTitle } from "@/components/ui/SectionCard";
import { CardHeader } from "@/components/ui/Card";

/** How many stages to draw - the tail is a handful of one-order stages that
 *  the search box (which also matches the current stage) reaches just as well. */
const MAX_ROWS = 8;

/**
 * "Where are my orders right now?" - in-progress orders grouped by the stage
 * they're currently at, biggest pile-up first, with the delayed ones called
 * out so a stage with late orders stuck at it stands out. Each row is a
 * filter: click one and the list below narrows to the orders at that stage.
 */
export function StageDistribution({ counts, activeStage, onSelect }: { counts: StageCount[]; activeStage: string | null; onSelect: (label: string) => void }) {
  const shown = counts.slice(0, MAX_ROWS);
  // A filtered-to stage that fell outside the top rows must stay visible, or
  // there'd be nothing on screen to click to clear it.
  if (activeStage && !shown.some((s) => s.label === activeStage)) {
    const active = counts.find((s) => s.label === activeStage);
    if (active) shown.push(active);
  }
  const max = Math.max(...shown.map((s) => s.count), 1);
  const hidden = counts.length - shown.length;

  return (
    <AccentCard tone="violet">
      <CardHeader
        title={<SectionTitle icon="📍" tone="violet">Where orders are right now</SectionTitle>}
        subtitle="In-progress orders by the stage they're at - click one to filter the list."
      />
      {/* @container: two columns only once THIS card is wide enough for a label,
          a usable bar and a count in each - viewport breakpoints ignore the sidebar
          eating 256px, which left the bars squeezed to nothing at laptop widths. */}
      <div className="@container px-4 py-4 sm:px-6">
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">No orders are in progress right now.</p>
        ) : (
          <div className="grid gap-x-6 gap-y-1 @min-[820px]:grid-cols-2">
            {shown.map((s) => {
              const active = activeStage === s.label;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onSelect(s.label)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                    active ? "bg-white shadow-[0_0_0_2px_#7C3AED,0_10px_22px_-14px_#7C3AED]" : "hover:bg-white/70"
                  }`}
                >
                  <span className="w-32 shrink-0 truncate text-sm font-semibold text-ink-800 sm:w-40">{s.label}</span>
                  <span className="relative h-2.5 min-w-12 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.max((s.count / max) * 100, 6)}%`,
                        backgroundImage: s.delayed > 0 ? "linear-gradient(90deg, #F59E0B, #E11D48)" : "linear-gradient(90deg, #38BDF8, #155EEF)",
                      }}
                    />
                  </span>
                  <span className="flex w-24 shrink-0 items-center justify-end gap-2 text-sm font-bold tabular-nums text-ink-900">
                    {s.count}
                    {s.delayed > 0 && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{s.delayed} late</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {hidden > 0 && <p className="mt-2 px-3 text-[11px] text-ink-400">+ {hidden} more stage{hidden === 1 ? "" : "s"} with fewer orders - search a stage name to find them.</p>}
      </div>
    </AccentCard>
  );
}
