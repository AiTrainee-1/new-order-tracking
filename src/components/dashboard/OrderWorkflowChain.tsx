"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OrderProgress, StageProgress } from "@/lib/progress";
import type { WorkItem } from "@/hooks/useMyWork";
import { orderImageUrl } from "@/lib/imageUrl";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "@/lib/workflow";
import { cardStatusAccent, orderStatusToCardTone } from "@/lib/theme";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";

type NodeTone = "completed" | "yourTurn" | "partial" | "idle";

function toneOf(stage: StageProgress, mine: WorkItem | undefined): NodeTone {
  if (stage.isCompleted) return "completed";
  if (mine && mine.gateStatus === "active" && !stage.isPartial) return "yourTurn";
  if (stage.isPartial) return "partial";
  return "idle";
}

const NODE_CLASSES: Record<NodeTone, string> = {
  completed:
    "border-emerald-300 bg-emerald-50 text-emerald-800 hover:-translate-y-1 hover:scale-[1.04] hover:border-emerald-400 hover:shadow-[0_10px_24px_-8px_rgba(5,150,105,0.35),0_0_0_4px_rgba(5,150,105,0.16)]",
  yourTurn:
    "border-amber-400 bg-amber-50 text-amber-900 animate-pulseSoft shadow-[0_0_0_3px_rgba(217,119,6,0.18)] hover:-translate-y-1 hover:scale-[1.04] hover:shadow-[0_10px_24px_-8px_rgba(217,119,6,0.4),0_0_0_5px_rgba(217,119,6,0.3)]",
  partial:
    "border-amber-300 bg-amber-50 text-amber-800 hover:-translate-y-1 hover:scale-[1.04] hover:border-amber-400 hover:shadow-[0_10px_24px_-8px_rgba(217,119,6,0.3),0_0_0_4px_rgba(217,119,6,0.14)]",
  idle: "border-ink-200 bg-white text-ink-500 hover:-translate-y-1 hover:scale-[1.04] hover:border-ink-300 hover:text-ink-700 hover:shadow-[0_10px_24px_-8px_rgba(100,116,139,0.3),0_0_0_4px_rgba(100,116,139,0.12)]",
};

function statusLineFor(stage: StageProgress, mine: WorkItem | undefined): string {
  if (stage.isCompleted) {
    const when = stage.completedOn ? formatDisplayDate(stage.completedOn) : null;
    return when ? `Completed · ${when}` : "Completed";
  }
  if (stage.isPartial) return "Moved on without finishing - a balance is still owed here";
  if (mine?.gateStatus === "active") return mine.assignment.canEnterData ? "Your turn - act now" : "In progress - monitor only";
  if (mine?.gateStatus === "locked") return "Waiting on an earlier stage";
  return "Not reached yet";
}

/**
 * One order rendered as a connected flow-chart of ONLY the stages this user
 * is assigned to in it - not the order's full plan - joined left-to-right in
 * their pipeline order, wrapping to further lines when there are many.
 * Colour + motion carry status - green w/ a hover glow for a finished stage,
 * an amber blink for whichever is actionable right now.
 */
export function OrderWorkflowChain({
  order,
  orderProgress,
  myItems,
  onOpenAssignment,
}: {
  order: OrderProgress["order"];
  orderProgress: OrderProgress;
  myItems: WorkItem[];
  onOpenAssignment: (assignmentId: string) => void;
}) {
  const myBySection = new Map(myItems.map((item) => [item.assignment.sectionId, item]));
  // orderProgress.stages is already in pipeline (seq) order, so filtering
  // down to the user's own stages keeps them correctly ordered too.
  const myStages = orderProgress.stages.filter((stage) => myBySection.has(stage.stage.id));
  const completedMine = myStages.filter((stage) => stage.isCompleted).length;
  const nextMine = myStages.find((stage) => !stage.isCompleted);
  const imageUrl = orderImageUrl(order.imageId);
  const urgency = order.deliveryDate ? deliveryUrgency(order.deliveryDate) : null;
  // Gray/blue/orange/green - the same order-status colour used on every
  // other order card in the app, so this one is identifiable at a glance too.
  const tone = orderStatusToCardTone(orderProgress.status);

  return (
    <div className="group relative animate-fadeInUp overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),0_4px_12px_-2px_rgba(21,94,239,0.04)] backdrop-blur-[6px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_56px_-16px_rgba(21,94,239,0.24),0_10px_24px_-8px_rgba(15,23,42,0.12)] sm:p-5">
      {/* Top accent brightens on hover; its colour carries the order's own status. */}
      <span className="absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity duration-300 group-hover:opacity-100" style={{ backgroundColor: cardStatusAccent[tone] }} />
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" style={{ backgroundColor: `${cardStatusAccent[tone]}1A` }} />

      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50 ring-1 ring-inset ring-ink-200 transition-transform duration-300 group-hover:scale-105">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
            ) : (
              <GarmentPlaceholder className="h-5 w-5 text-ink-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-900">{order.style}</p>
            <p className="truncate text-xs text-ink-500">
              IO {order.ioNo} {order.color ? `· ${order.color}` : ""} · Delivery {formatDisplayDate(order.deliveryDate)}
              {urgency && urgency !== "none" && <span className={`ml-1.5 rounded-full border bg-white px-1.5 py-0.5 text-[10px] font-semibold ${urgencyColorClasses[urgency]}`}>{urgency}</span>}
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-48">
          <ProgressBar value={orderProgress.overallProgressPct} showLabel size="sm" />
        </div>
      </div>

      <p className="relative mb-3 mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {completedMine}/{myStages.length} of your stages completed{nextMine ? ` · next up "${nextMine.stage.label}"` : " · all done"}
      </p>

      <div className="relative flex flex-wrap items-start gap-y-5">
        {myStages.map((stage, index) => {
          const mine = myBySection.get(stage.stage.id);
          const tone = toneOf(stage, mine);

          return (
            <Fragment key={stage.stage.id}>
              {index > 0 && (
                <span className={`mx-1 mt-4 shrink-0 self-center text-sm transition-colors duration-300 ${myStages[index - 1].isCompleted ? "text-emerald-400" : "text-ink-300"}`} aria-hidden>
                  →
                </span>
              )}
              <StageNode stage={stage} mine={mine} tone={tone} onOpen={() => mine && onOpenAssignment(mine.assignment.id)} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function StageNode({ stage, mine, tone, onOpen }: { stage: StageProgress; mine: WorkItem | undefined; tone: NodeTone; onOpen: () => void }) {
  const nodeRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  // Portalled to document.body, positioned in viewport (fixed) coordinates -
  // this card can sit inside ancestors with backdrop-blur/transform, any of
  // which would clip or out-rank a CSS-absolute popover, so escaping to body
  // sidesteps that instead of fighting it with z-index.
  function showTooltip() {
    if (!nodeRef.current) return;
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
    <div className="flex flex-col items-center gap-1">
      <button
        ref={nodeRef}
        type="button"
        onClick={onOpen}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-200 ease-out ${NODE_CLASSES[tone]}`}
      >
        {tone === "completed" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {stage.stage.label}
      </button>
      {mine && !mine.assignment.canEnterData && <span className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Monitor</span>}

      {anchor && createPortal(<StageTooltip stage={stage} mine={mine} tone={tone} anchor={anchor} />, document.body)}
    </div>
  );
}

function StageTooltip({ stage, mine, tone, anchor }: { stage: StageProgress; mine: WorkItem | undefined; tone: NodeTone; anchor: { top: number; left: number } }) {
  const toneText: Record<NodeTone, string> = {
    completed: "text-emerald-700",
    yourTurn: "text-amber-700",
    partial: "text-amber-700",
    idle: "text-ink-500",
  };

  return (
    <div
      style={{ top: anchor.top, left: anchor.left }}
      className="pointer-events-none fixed z-[999] w-60 -translate-x-1/2 -translate-y-full animate-fadeInUp rounded-xl border border-ink-200 bg-white p-3 text-left shadow-[0_24px_50px_-14px_rgba(30,41,90,0.55),0_4px_14px_-4px_rgba(30,41,90,0.35)] ring-1 ring-black/[0.04]"
    >
      <p className="text-xs font-semibold text-ink-900">{stage.stage.label}</p>
      <p className={`mt-0.5 text-[11px] font-medium ${toneText[tone]}`}>{statusLineFor(stage, mine)}</p>

      <div className="mt-2 space-y-1 text-[11px] text-ink-600">
        <TooltipRow label={`Allotted (${stage.stage.unitType})`} value={stage.qtyAllotted.toLocaleString()} />
        <TooltipRow label="Forwarded" value={stage.qtyForwarded.toLocaleString()} strong />
        {stage.qtyPending > 0 && <TooltipRow label="Still owed" value={stage.qtyPending.toLocaleString()} className="text-amber-700" />}
        {stage.qtyShortage > 0 && <TooltipRow label="Shortage" value={stage.qtyShortage.toLocaleString()} className="text-status-shortage" />}
        {stage.qtyRejected > 0 && <TooltipRow label="Rejected" value={stage.qtyRejected.toLocaleString()} className="text-status-rejected" />}
        <TooltipRow label="Last update" value={formatDisplayDate(stage.lastEntryDate)} />
      </div>

      {mine && <p className="mt-2 border-t border-ink-100 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand">Tap to open</p>}

      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-ink-200 bg-white" />
    </div>
  );
}

function TooltipRow({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span>{label}</span>
      <span className={strong ? "font-semibold text-ink-900" : "font-medium"}>{value}</span>
    </div>
  );
}
