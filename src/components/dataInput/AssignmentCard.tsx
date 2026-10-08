"use client";

import type { WorkItem } from "@/hooks/useMyWork";
import { orderImageUrl } from "@/lib/imageUrl";
import { daysRemaining, deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "@/lib/workflow";
import { cardStatusAccent, cardStatusBorder, cardStatusLabel, cardStatusShadow, cardStatusSoftBg, type CardStatusTone } from "@/lib/theme";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { NextStagesStrip } from "@/components/dashboard/NextStagesStrip";

/**
 * One assignment on the Data Input list - the floor-side twin of the Admin
 * order cards (same status tint, top accent bar, status pill, tile row and
 * delivery footer), built around the one stage this person owns on the order
 * and what to do about it. The whole card opens the entry screen.
 */
export function AssignmentCard({
  item,
  tone,
  nextAction,
  onOpen,
  index,
}: {
  item: WorkItem;
  tone: CardStatusTone;
  /** The one-line "what happens next" sentence under the progress. */
  nextAction: string;
  onOpen: () => void;
  index: number;
}) {
  const { assignment, orderProgress } = item;
  const order = assignment.order;
  const imageUrl = orderImageUrl(order?.imageId);
  const accent = cardStatusAccent[tone];
  const urgency = deliveryUrgency(order?.deliveryDate ?? null);
  const remaining = daysRemaining(order?.deliveryDate ?? null);
  const completedStages = orderProgress.completedStagesCount;

  const cta = !assignment.canEnterData
    ? { label: "View status", solid: false }
    : item.gateStatus === "active"
      ? { label: "Enter data", solid: true }
      : item.gateStatus === "completed"
        ? { label: "Late entry", solid: false }
        : { label: "View", solid: false };

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ ...cardStatusSoftBg[tone], animationDelay: `${Math.min(index, 8) * 50}ms`, animationFillMode: "backwards" }}
      className={`group relative flex w-full animate-fadeInUp flex-col gap-4 overflow-hidden rounded-2xl border p-5 text-left outline-none transition-all duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-brand/40 ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

      <div className="flex items-start gap-3.5">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white transition-transform duration-200 group-hover:scale-105"
          style={{ boxShadow: `inset 0 0 0 2px ${accent}33` }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={order?.style} className="h-full w-full object-cover" />
          ) : (
            <GarmentPlaceholder className="h-8 w-8 text-ink-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold tracking-tight text-ink-900">{order?.style}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-600">
            IO {order?.ioNo}
            {order?.color ? ` · ${order.color}` : ""}
            {order?.buyer ? ` · ${order.buyer.name}` : ""}
            {assignment.po ? ` · PO ${assignment.po.poNumber}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: accent }}>
          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
          {cardStatusLabel[tone]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="min-w-0 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Your stage</span>
            {assignment.section?.unitType && <span className="shrink-0 rounded-full bg-white px-1.5 py-px text-[9px] font-bold text-ink-600 ring-1 ring-ink-200">{assignment.section.unitType}</span>}
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink-900" title={assignment.section?.label}>
            {assignment.section?.label}
          </p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Order progress</p>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tabular-nums text-ink-900">{Math.round(orderProgress.overallProgressPct)}%</span>
            <span className="text-[11px] font-medium text-ink-500">
              {completedStages}/{orderProgress.stages.length} stages
            </span>
          </p>
        </div>
      </div>

      <div className="space-y-2.5 rounded-xl border border-white/80 bg-white/70 p-3">
        <ProgressBar value={orderProgress.overallProgressPct} size="sm" />
        <NextStagesStrip stages={orderProgress.stages} currentStageIndex={orderProgress.currentStageIndex} />
        <p className={`text-xs font-semibold leading-snug ${item.stageProgress?.isPartial ? "text-amber-700" : "text-ink-800"}`}>{nextAction}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/10 pt-3 text-xs">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {remaining === null ? (
            <span className="text-ink-500">No delivery date set</span>
          ) : (
            <>
              <span className="text-ink-600">Delivery {formatDisplayDate(order?.deliveryDate ?? null)}</span>
              <span className={`rounded-full border bg-white px-2.5 py-0.5 font-semibold ${urgencyColorClasses[urgency]}`}>{remaining >= 0 ? `${remaining}d left` : `${Math.abs(remaining)}d overdue`}</span>
            </>
          )}
        </span>
        <span
          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-200 group-hover:shadow-[0_10px_20px_-8px_rgba(21,94,239,0.6)] ${
            cta.solid ? "bg-brand-gradient text-white shadow-[0_8px_18px_-8px_rgba(21,94,239,0.55)]" : "border border-white/80 bg-white text-ink-700 group-hover:text-brand"
          }`}
        >
          {cta.label} <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </button>
  );
}
