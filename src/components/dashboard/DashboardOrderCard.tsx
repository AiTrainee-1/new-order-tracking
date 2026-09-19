"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrderBundle } from "@/hooks/useOrders";
import { ORDER_STATUS_LABEL } from "@/lib/progress";
import { orderImageUrl } from "@/lib/imageUrl";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "@/lib/workflow";
import { orderTrackingBasePath } from "@/lib/routing";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, orderStatusToCardTone } from "@/lib/theme";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";

/**
 * One order on the fleet dashboard. Same four-colour status language as every
 * other order card in the app (theme.ts's cardStatus*), but the progress bar
 * is replaced by a strip with one segment per stage in this order's own plan -
 * so you can see WHICH stages are done, which one is in progress and which
 * moved on with a balance still owed, not just a single percentage.
 * Links into the order the same way OrderCard does, so /admin and /md both work.
 */
export function DashboardOrderCard({ bundle }: { bundle: OrderBundle }) {
  const { order, progress } = bundle;
  const basePath = orderTrackingBasePath(usePathname());
  const imageUrl = orderImageUrl(order.imageId);
  const urgency = deliveryUrgency(order.deliveryDate);
  const tone = orderStatusToCardTone(progress.status);
  const accent = cardStatusAccent[tone];
  const currentStage = progress.stages[progress.currentStageIndex]?.stage.label ?? "-";
  const isCompleted = progress.status === "completed";

  return (
    <Link
      href={`${basePath}/orders/${order.id}`}
      style={cardStatusSoftBg[tone]}
      className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-1 ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

      <div className="flex items-start gap-3.5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white" style={{ boxShadow: `inset 0 0 0 2px ${accent}33` }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
          ) : (
            <GarmentPlaceholder className="h-8 w-8 text-ink-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold tracking-tight text-ink-900">{order.style}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-600">
            IO {order.ioNo}
            {order.color ? ` · ${order.color}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: accent }}>
          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
          {ORDER_STATUS_LABEL[progress.status]}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-ink-700">
            {progress.completedStagesCount}/{progress.stages.length} stages
          </span>
          <span className="text-lg font-extrabold tabular-nums" style={{ color: accent }}>
            {progress.overallProgressPct}%
          </span>
        </div>
        <div className="flex h-3 items-center gap-[3px]" role="img" aria-label={`${progress.completedStagesCount} of ${progress.stages.length} stages complete`}>
          {progress.stages.map((s, i) => {
            const isCurrent = !isCompleted && !s.isCompleted && i === progress.currentStageIndex;
            const color = s.isCompleted ? "bg-emerald-500" : s.isPartial ? "bg-amber-400" : isCurrent ? "bg-blue-600" : "bg-black/10";
            return <span key={s.stage.id} title={s.stage.label} className={`flex-1 rounded-full transition-all ${color} ${isCurrent ? "h-3" : "h-2"}`} />;
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-xs">
        <span className="shrink-0 text-ink-500">{isCompleted ? "Finished at" : "Now at"}</span>
        <span className="min-w-0 flex-1 truncate text-right font-bold text-ink-900">{currentStage}</span>
      </div>

      {/* Stages that moved on without finishing still owe a balance. They're
          easy to lose track of precisely because the line carried on, so the
          count is surfaced on the card rather than only inside the order. */}
      {progress.partialStagesCount > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
          {progress.partialStagesCount} stage{progress.partialStagesCount === 1 ? "" : "s"} not complete - balance still owed
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/10 pt-3 text-xs">
        <span className="text-ink-600">Delivery {formatDisplayDate(order.deliveryDate)}</span>
        <span className={`rounded-full border bg-white px-2.5 py-0.5 font-semibold ${urgencyColorClasses[urgency]}`}>
          {progress.daysRemaining !== null ? (progress.daysRemaining >= 0 ? `${progress.daysRemaining}d left` : `${Math.abs(progress.daysRemaining)}d overdue`) : "No date"}
        </span>
      </div>
    </Link>
  );
}
