import type { StageProgress } from "@/lib/progress";

/** A compact, line-separated preview of the current + upcoming stages for an
 * order, so a user scanning their work list immediately sees what's next in the
 * workflow. The first segment (▶) is where the order sits now; the rest are the
 * stages that follow, joined by connector lines. */
export function NextStagesStrip({ stages, currentStageIndex, max = 3 }: { stages: StageProgress[]; currentStageIndex: number; max?: number }) {
  const start = Math.max(currentStageIndex, 0);
  const upcoming = stages.slice(start, start + max);
  if (upcoming.length === 0) return null;
  const remaining = stages.length - (start + upcoming.length);

  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Next</span>
      {upcoming.map((s, i) => (
        <div key={s.stage.id} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-3 shrink-0 bg-ink-200" aria-hidden />}
          <span
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
              // Orange means one thing everywhere: moved on, not finished.
              s.isPartial
                ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300"
                : i === 0
                  ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200"
                  : "bg-ink-50 text-ink-500 ring-1 ring-inset ring-ink-200/60"
            }`}
          >
            {i === 0 ? "▶ " : ""}
            {s.stage.label}
            {s.isPartial ? " •" : ""}
          </span>
        </div>
      ))}
      {remaining > 0 && <span className="shrink-0 whitespace-nowrap pl-0.5 text-[11px] text-ink-400">+{remaining} more</span>}
    </div>
  );
}
