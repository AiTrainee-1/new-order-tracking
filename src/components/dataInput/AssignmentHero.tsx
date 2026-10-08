"use client";

import type { ReactNode } from "react";
import type { WorkItem } from "@/hooks/useMyWork";
import { orderImageUrl } from "@/lib/imageUrl";
import { daysRemaining, deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "@/lib/workflow";
import { cardStatusAccent, type CardStatusTone } from "@/lib/theme";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * The banner above an open assignment: which order, which stage, how far the
 * order has got and when it's due. It's the Admin PageHero's skin (soft card,
 * corner glows) with the status colour on a top bar, so the person entering
 * data always knows what they're entering it against.
 */
export function AssignmentHero({ item, tone, badge }: { item: WorkItem; tone: CardStatusTone; badge: ReactNode }) {
  const { assignment, orderProgress } = item;
  const order = assignment.order!;
  const imageUrl = orderImageUrl(order.imageId);
  const accent = cardStatusAccent[tone];
  const currentStage = orderProgress.stages[orderProgress.currentStageIndex]?.stage;
  const urgency = deliveryUrgency(order.deliveryDate);
  const remaining = daysRemaining(order.deliveryDate);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/70 px-5 py-5 shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),0_4px_12px_-2px_rgba(21,94,239,0.04)] sm:px-6">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
      <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: `${accent}22` }} />

      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white" style={{ boxShadow: `inset 0 0 0 2px ${accent}33` }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
          ) : (
            <GarmentPlaceholder className="h-9 w-9 text-ink-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Data entry</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-ink-900">{order.style}</h1>
          <p className="truncate text-sm text-ink-600">
            IO {order.ioNo}
            {order.color ? ` · ${order.color}` : ""}
            {order.buyer ? ` · ${order.buyer.name}` : ""}
            {assignment.po ? ` · PO ${assignment.po.poNumber}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{badge}</div>
      </div>

      <div className="relative mt-4 grid gap-2.5 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Your stage</span>
            {assignment.section?.unitType && <span className="shrink-0 rounded-full bg-white px-1.5 py-px text-[9px] font-bold text-ink-600 ring-1 ring-ink-200">{assignment.section.unitType}</span>}
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink-900" title={assignment.section?.label}>
            {assignment.section?.label}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Order is at</p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink-900">{currentStage?.label ?? "-"}</p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Delivery</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {remaining === null ? (
              <span className="text-sm font-bold text-ink-500">Not set</span>
            ) : (
              <>
                <span className="text-sm font-bold text-ink-900">{formatDisplayDate(order.deliveryDate)}</span>
                <span className={`rounded-full border bg-white px-2 py-px text-[10px] font-semibold ${urgencyColorClasses[urgency]}`}>{remaining >= 0 ? `${remaining}d left` : `${Math.abs(remaining)}d overdue`}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ProgressBar value={orderProgress.overallProgressPct} size="sm" />
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-600">
          {orderProgress.completedStagesCount}/{orderProgress.stages.length} stages
        </span>
      </div>
    </div>
  );
}
