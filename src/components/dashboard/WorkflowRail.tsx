import type { StageProgress } from "@/lib/progress";
import { formatDisplayDate } from "@/lib/workflow";

/**
 * The 18 stages as a vertical rail, for the side-by-side tracking layout.
 *
 * GameLevelPath lays the same stages out as a horizontal snake, which reads
 * well on its own but forces the selected stage's detail to open BELOW it - so
 * on a long order you lose sight of where you are the moment you scroll into
 * the numbers. A vertical rail sits beside the detail instead: the list stays
 * on screen while the panel next to it changes, which is what makes clicking
 * through eighteen sections bearable.
 *
 * It is a presentation of StageProgress only. Every status here is read from
 * the same fields GameLevelPath reads - nothing is derived differently.
 */

type StageTone = "good" | "partial" | "current" | "idle";

function toneOf(stage: StageProgress, isCurrent: boolean): StageTone {
  if (stage.isCompleted) return "good";
  if (stage.isPartial) return "partial";
  return isCurrent ? "current" : "idle";
}

const NODE_SKIN: Record<StageTone, string> = {
  good: "bg-status-good text-white ring-status-good/25",
  partial: "bg-amber-500 text-white ring-amber-500/25",
  current: "bg-brand text-white ring-brand/25",
  idle: "bg-white text-ink-400 ring-ink-200",
};

const CONNECTOR_SKIN: Record<StageTone, string> = {
  good: "bg-status-good",
  partial: "bg-amber-500",
  current: "bg-brand/40",
  idle: "bg-ink-200",
};

/** One line of context under the label - the same facts the horizontal path
 * put in a hover tooltip, made permanent because there is room for them here. */
function statusLine(stage: StageProgress, nameOf?: (id: string) => string): string {
  if (stage.isCompleted) {
    const who = stage.completedBy && nameOf ? nameOf(stage.completedBy) : null;
    const when = formatDisplayDate(stage.completedOn);
    return who ? `Completed by ${who} · ${when}` : `Completed · ${when}`;
  }
  if (stage.isPartial) return `Moved on unfinished · ${formatDisplayDate(stage.lastEntryDate)}`;
  if (stage.entries.length) return `In progress · ${formatDisplayDate(stage.lastEntryDate)}`;
  return "Not started";
}

interface WorkflowRailProps {
  stages: StageProgress[];
  currentStageIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Resolves an entry author's id to a display name. */
  userNameById?: (id: string) => string;
}

export function WorkflowRail({ stages, currentStageIndex, selectedIndex, onSelect, userNameById }: WorkflowRailProps) {
  return (
    <div>
      <ol className="relative">
        {stages.map((stage, i) => {
          const tone = toneOf(stage, i === currentStageIndex);
          const isSelected = i === selectedIndex;
          const isLast = i === stages.length - 1;

          return (
            <li key={stage.stage.id} className="relative">
              {/* The connector runs from this node down to the next one, and
                  takes THIS stage's tone so the rail reads as a filled track up
                  to wherever the order has actually got to. */}
              {!isLast && <span aria-hidden className={`absolute left-[1.4375rem] top-9 h-[calc(100%-1.5rem)] w-0.5 rounded-full ${CONNECTOR_SKIN[tone]}`} />}

              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isSelected ? "step" : undefined}
                className={`relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition ${isSelected ? "bg-brand/10 ring-1 ring-brand/30" : "hover:bg-white/70"}`}
              >
                <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 transition ${NODE_SKIN[tone]} ${isSelected ? "scale-110 shadow-sm" : ""}`}>
                  {stage.isCompleted ? "✓" : i + 1}
                </span>

                <span className="min-w-0 flex-1 pt-0.5">
                  <span className={`block truncate text-sm font-semibold ${isSelected ? "text-brand" : "text-ink-900"}`}>{stage.stage.label}</span>
                  <span className={`block truncate text-[11px] ${tone === "partial" ? "text-amber-700" : "text-ink-500"}`}>{statusLine(stage, userNameById)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-ink-100 pt-3 text-[11px] text-ink-500">
        <LegendDot className="bg-status-good" label="Completed" />
        <LegendDot className="bg-amber-500" label="Moved on - not completed" />
        <LegendDot className="bg-brand" label="In progress" />
        <LegendDot className="bg-ink-200" label="Not reached" />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} aria-hidden />
      {label}
    </span>
  );
}
