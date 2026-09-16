"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StageProgress } from "@/lib/progress";
import { formatDisplayDate } from "@/lib/workflow";
import { bubbleGradient, bubbleGradientSelected } from "@/lib/theme";

const COLS = 5;
const NODE = 46; // px - bubbly circle size
const NODE_ROW = 92; // px - node + two-line label
const LINE_ROW = 20; // px - vertical connector between rows

/** Completed, moved-on-but-unfinished (orange), or still to do. */
type StageTone = "good" | "partial" | "current" | "idle";

function toneOf(stage: StageProgress, isCurrent: boolean): StageTone {
  if (stage.isCompleted) return "good";
  if (stage.isPartial) return "partial";
  return isCurrent ? "current" : "idle";
}

interface GameLevelPathProps {
  stages: StageProgress[];
  currentStageIndex: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Resolves an entry's author id to a display name for the tooltip. */
  userNameById?: (id: string) => string;
}

/**
 * A compact "game level" path - stages snake left-to-right, then right-to-left
 * on the next row, like a board game track. Nodes sit on a CSS grid with
 * dedicated connector tracks between them, so the connecting lines always span
 * the real gap between nodes. Colour carries the status: green = completed,
 * orange = forwarded without finishing (balance still owed), blue = in
 * progress, grey = not reached.
 */
export function GameLevelPath({ stages, currentStageIndex, selectedIndex, onSelect, userNameById }: GameLevelPathProps) {
  const rows = Math.ceil(stages.length / COLS);

  const positions = useMemo(
    () =>
      stages.map((_, i) => {
        const row = Math.floor(i / COLS);
        const colInRow = i % COLS;
        const reversed = row % 2 === 1;
        const visualCol = reversed ? COLS - 1 - colInRow : colInRow;
        return { row, visualCol };
      }),
    [stages],
  );

  const connectors = useMemo(() => {
    const list: { column: number; row: number; vertical: boolean; tone: StageTone }[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const a = positions[i];
      const b = positions[i + 1];
      // The line takes the colour of the stage it leaves - an orange line means
      // goods moved on from a stage that isn't finished yet.
      const tone: StageTone = stages[i].isCompleted ? "good" : stages[i].isPartial ? "partial" : "idle";
      if (a.row === b.row) {
        list.push({ column: 2 * Math.min(a.visualCol, b.visualCol) + 2, row: 2 * a.row + 1, vertical: false, tone });
      } else {
        list.push({ column: 2 * a.visualCol + 1, row: 2 * a.row + 2, vertical: true, tone });
      }
    }
    return list;
  }, [stages, positions]);

  const connectorTone: Record<StageTone, string> = {
    good: "bg-good-gradient",
    partial: "bg-warn-gradient",
    current: "bg-brand-gradient",
    idle: "bg-ink-200",
  };

  const columnTemplate = Array.from({ length: COLS }, (_, i) => (i < COLS - 1 ? `${NODE}px 1fr` : `${NODE}px`)).join(" ");
  const rowTemplate = Array.from({ length: rows }, (_, i) => (i < rows - 1 ? `${NODE_ROW}px ${LINE_ROW}px` : `${NODE_ROW}px`)).join(" ");

  const hasPartial = stages.some((s) => s.isPartial);

  return (
    <div className="space-y-3">
      <div
        className="rounded-[1.75rem] border border-white/70 p-4 shadow-[inset_0_2px_10px_-4px_rgba(30,41,90,0.12)] sm:p-5"
        style={{
          backgroundImage:
            "radial-gradient(at 10% 15%, rgba(99,102,241,0.10) 0px, transparent 45%), radial-gradient(at 90% 85%, rgba(45,212,191,0.10) 0px, transparent 45%), linear-gradient(180deg, #F6F8FE 0%, #EEF2FB 100%)",
        }}
      >
        {/* Desktop / tablet: snake grid */}
        <div className="hidden md:grid" style={{ gridTemplateColumns: columnTemplate, gridTemplateRows: rowTemplate }}>
          {connectors.map((c, i) => (
            <div
              key={`c-${i}`}
              style={{ gridColumn: c.column, gridRow: c.row }}
              className={`self-center justify-self-center rounded-full ${connectorTone[c.tone]} ${c.vertical ? "h-full w-1.5" : "h-1.5 w-full"}`}
            />
          ))}
          {stages.map((stage, index) => {
            const { row, visualCol } = positions[index];
            return (
              <div key={stage.stage.id} style={{ gridColumn: 2 * visualCol + 1, gridRow: 2 * row + 1 }} className="relative z-10 flex justify-self-center">
                <LevelNode
                  stage={stage}
                  index={index}
                  tone={toneOf(stage, index === currentStageIndex)}
                  isSelected={index === selectedIndex}
                  onClick={() => onSelect(index)}
                  userNameById={userNameById}
                />
              </div>
            );
          })}
        </div>

        {/* Mobile: compact vertical timeline */}
        <div className="space-y-0 md:hidden">
          {stages.map((stage, index) => {
            const tone = toneOf(stage, index === currentStageIndex);
            return (
              <div key={stage.stage.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <LevelNode stage={stage} index={index} tone={tone} isSelected={index === selectedIndex} onClick={() => onSelect(index)} userNameById={userNameById} compact />
                  {index < stages.length - 1 && (
                    <div className={`h-6 w-1 rounded-full ${connectorTone[stage.isCompleted ? "good" : stage.isPartial ? "partial" : "idle"]}`} />
                  )}
                </div>
                <div className="flex-1 pb-5 pt-1.5">
                  <p className={`text-xs font-semibold ${index === selectedIndex ? "text-brand" : "text-ink-800"}`}>{stage.stage.label}</p>
                  <p className="text-[11px] text-ink-500">{statusLine(stage, tone, userNameById)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-500">
        <LegendDot className="bg-good-gradient" label="Completed" />
        <LegendDot className="bg-warn-gradient" label="Moved on - not completed" />
        <LegendDot className="bg-brand-gradient" label="In progress" />
        <LegendDot className="bg-white ring-1 ring-inset ring-ink-300" label="Not reached" />
      </div>

      {hasPartial && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Orange stages were forwarded before they were finished - a balance is still owed there. They stay flagged until someone completes them.
        </p>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

/** One-line status, including who finished it and when. */
function statusLine(stage: StageProgress, tone: StageTone, userNameById?: (id: string) => string): string {
  if (tone === "good") {
    const who = stage.completedBy ? userNameById?.(stage.completedBy) : null;
    const when = stage.completedOn ? formatDisplayDate(stage.completedOn) : null;
    if (who && when) return `Completed by ${who} · ${when}`;
    if (when) return `Completed ${when}`;
    return "Completed";
  }
  if (tone === "partial") {
    const who = stage.lastActorId ? userNameById?.(stage.lastActorId) : null;
    const when = stage.lastEntryDate ? formatDisplayDate(stage.lastEntryDate) : null;
    return `Moved on, not completed${who ? ` · ${who}` : ""}${when ? ` · ${when}` : ""}`;
  }
  if (tone === "current") return "In progress";
  return "Pending";
}

function LevelNode({
  stage,
  index,
  tone,
  isSelected,
  onClick,
  userNameById,
  compact = false,
}: {
  stage: StageProgress;
  index: number;
  tone: StageTone;
  isSelected: boolean;
  onClick: () => void;
  userNameById?: (id: string) => string;
  compact?: boolean;
}) {
  const textClasses: Record<StageTone, string> = {
    good: "text-white",
    partial: "text-white",
    current: "text-white",
    idle: "text-ink-500",
  };

  const nodeRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  // Portalled to document.body and positioned in fixed (viewport) coordinates
  // instead of a CSS-absolute popover inside the card. The card this pipeline
  // sits in is a frosted glass panel with backdrop-blur, and *any* ancestor
  // with a backdrop-filter/transform/filter establishes its own stacking
  // context (and containing block) - no z-index inside it can ever out-rank
  // the fixed sidebar sitting outside it. Escaping to body sidesteps that
  // entirely rather than trying to out-number it.
  function showTooltip() {
    if (compact || !nodeRef.current) return;
    const rect = nodeRef.current.getBoundingClientRect();
    setAnchor({ top: rect.top - 10, left: rect.left + rect.width / 2 });
  }
  function hideTooltip() {
    setAnchor(null);
  }

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  return (
    <button type="button" onClick={onClick} onMouseEnter={showTooltip} onMouseLeave={hideTooltip} className="group relative flex flex-col items-center gap-1.5">
      <span
        ref={nodeRef}
        className={`relative flex ${compact ? "h-9 w-9" : ""} shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:scale-110 ${textClasses[tone]} ${
          tone === "current" ? "animate-pulseSoft" : ""
        } ${isSelected ? "scale-110" : ""}`}
        style={{
          ...(compact ? undefined : { height: NODE, width: NODE }),
          backgroundImage: isSelected ? bubbleGradientSelected[tone] : bubbleGradient[tone],
          boxShadow: isSelected
            ? "0 0 0 4px rgba(21,94,239,0.4), 8px 10px 22px -6px rgba(30,41,90,0.55), inset -3px -4px 8px -2px rgba(0,0,0,0.3), inset 3px 4px 8px -2px rgba(255,255,255,0.4)"
            : "6px 8px 14px -6px rgba(30,41,90,0.35), inset -3px -4px 8px -2px rgba(0,0,0,0.18), inset 3px 4px 8px -2px rgba(255,255,255,0.55)",
        }}
      >
        {/* Glossy highlight - the thing that reads "bubble" instead of "flat dot". */}
        <span aria-hidden className="pointer-events-none absolute left-[18%] top-[14%] h-[35%] w-[35%] rounded-full bg-white/70 blur-[2px]" />
        <span className="relative">
          {tone === "good" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            index + 1
          )}
        </span>
        {/* Half-filled marker: goods went on, but this stage isn't closed. */}
        {tone === "partial" && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-amber-600 text-[9px] font-bold text-white shadow-[2px_2px_5px_-1px_rgba(30,41,90,0.4)]">
            !
          </span>
        )}
        {tone === "current" && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-white bg-amber-400 shadow-[2px_2px_5px_-1px_rgba(30,41,90,0.4)]" />}
      </span>
      {!compact && (
        <span className={`w-[5.5rem] text-center text-[10.5px] font-semibold leading-tight ${isSelected ? "text-brand" : "text-ink-700"}`}>{stage.stage.label}</span>
      )}

      {anchor && createPortal(<StageTooltip stage={stage} tone={tone} userNameById={userNameById} anchor={anchor} />, document.body)}
    </button>
  );
}

function StageTooltip({ stage, tone, userNameById, anchor }: { stage: StageProgress; tone: StageTone; userNameById?: (id: string) => string; anchor: { top: number; left: number } }) {
  const unit = stage.stage.unitType;

  return (
    <div
      style={{ top: anchor.top, left: anchor.left }}
      className="pointer-events-none fixed z-[999] w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-ink-200 bg-white p-3 text-left shadow-[0_24px_50px_-14px_rgba(30,41,90,0.55),0_4px_14px_-4px_rgba(30,41,90,0.35)] ring-1 ring-black/[0.04]"
    >
      <p className="text-xs font-semibold text-ink-900">{stage.stage.label}</p>
      <p className={`mt-0.5 text-[11px] font-medium ${tone === "good" ? "text-green-700" : tone === "partial" ? "text-amber-700" : "text-ink-500"}`}>
        {statusLine(stage, tone, userNameById)}
      </p>

      <div className="mt-2 space-y-1 text-[11px] text-ink-600">
        <Row label={`Allotted (${unit})`} value={stage.qtyAllotted.toLocaleString()} />
        <Row label="Forwarded" value={stage.qtyForwarded.toLocaleString()} strong />
        {stage.qtyPending > 0 && <Row label="Still owed" value={stage.qtyPending.toLocaleString()} className="text-amber-700" />}
        {stage.qtyShortage > 0 && <Row label="Shortage" value={stage.qtyShortage.toLocaleString()} className="text-status-shortage" />}
        {stage.qtyRejected > 0 && <Row label="Rejected" value={stage.qtyRejected.toLocaleString()} className="text-status-rejected" />}
        <Row label="Records" value={String(stage.entries.length)} />
        <Row label="Last update" value={formatDisplayDate(stage.lastEntryDate)} />
      </div>

      {stage.unitBreakdown.length > 0 && (
        <div className="mt-2 border-t border-ink-100 pt-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Split across</p>
          {stage.unitBreakdown.slice(0, 3).map((u) => (
            <p key={u.unitName} className="mt-0.5 flex justify-between text-[11px] text-ink-600">
              <span className="truncate pr-2">{u.unitName}</span>
              <span className="font-medium text-ink-800">{u.qtyForwarded.toLocaleString()}</span>
            </p>
          ))}
          {stage.unitBreakdown.length > 3 && <p className="mt-0.5 text-[10px] text-ink-400">+{stage.unitBreakdown.length - 3} more</p>}
        </div>
      )}

      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-ink-200 bg-white" />
    </div>
  );
}

function Row({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span>{label}</span>
      <span className={strong ? "font-semibold text-ink-900" : "font-medium"}>{value}</span>
    </div>
  );
}
