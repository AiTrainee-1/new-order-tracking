"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrderBundle } from "@/hooks/useOrders";
import { orderImageUrl } from "@/lib/imageUrl";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "@/lib/workflow";
import { orderTrackingBasePath } from "@/lib/routing";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, orderStatusToCardTone } from "@/lib/theme";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";

const statusLabel: Record<string, string> = {
  not_started: "Not started",
  on_track: "On track",
  due_soon: "Due soon",
  delayed: "Delayed",
  completed: "Completed",
};

export function OrderCard({ bundle, linkTo }: { bundle: OrderBundle; linkTo?: (basePath: "/admin" | "/md", orderId: string) => string }) {
  const { order, progress } = bundle;
  const imageUrl = orderImageUrl(order.imageId);
  const urgency = deliveryUrgency(order.deliveryDate);
  const currentStage = progress.stages[progress.currentStageIndex]?.stage.label ?? "-";
  // Gray/blue/orange/green, always meaning not started / on track / needs
  // attention / done - so "Delayed" never shows up under a blue bar again.
  const tone = orderStatusToCardTone(progress.status);
  const basePath = orderTrackingBasePath(usePathname());

  return (
    <Link
      href={linkTo ? linkTo(basePath, order.id) : `${basePath}/orders/${order.id}`}
      style={cardStatusSoftBg[tone]}
      className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border ${cardStatusBorder[tone]} p-4 transition-transform duration-150 hover:-translate-y-0.5 ${cardStatusShadow[tone]}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cardStatusAccent[tone] }} />

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-2 ring-inset" style={{ boxShadow: `inset 0 0 0 2px ${cardStatusAccent[tone]}33` }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
          ) : (
            <GarmentPlaceholder className="h-7 w-7 text-ink-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{order.style}</p>
          <p className="truncate text-xs text-ink-600">
            IO {order.ioNo} · {order.color}{order.buyer ? ` · ${order.buyer.name}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: cardStatusAccent[tone] }}>
          {statusLabel[progress.status]}
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-600">
          <span>Progress</span>
          <span className="font-semibold text-ink-700">
            {progress.completedStagesCount}/{progress.stages.length} stages
          </span>
        </div>
        <ProgressBar value={progress.overallProgressPct} showLabel />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-600">Current stage</span>
        <span className="max-w-[60%] truncate font-semibold text-ink-900">{currentStage}</span>
      </div>

      {/* Stages that moved on without finishing still owe a balance. They're
          easy to lose track of precisely because the line carried on, so the
          count is surfaced on the card rather than only inside the order. */}
      {progress.partialStagesCount > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
          {progress.partialStagesCount} stage{progress.partialStagesCount === 1 ? "" : "s"} not complete - balance still owed
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-2.5 text-xs">
        <span className="text-ink-600">Delivery {formatDisplayDate(order.deliveryDate)}</span>
        <span className={`rounded-full border bg-white px-2 py-0.5 font-semibold ${urgencyColorClasses[urgency]}`}>
          {progress.daysRemaining !== null ? (progress.daysRemaining >= 0 ? `${progress.daysRemaining}d left` : `${Math.abs(progress.daysRemaining)}d overdue`) : "No date"}
        </span>
      </div>
    </Link>
  );
}
