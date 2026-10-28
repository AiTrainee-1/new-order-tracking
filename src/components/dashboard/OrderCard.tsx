"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrderBundle } from "@/hooks/useOrders";
import { ORDER_STATUS_LABEL } from "@/lib/progress";
import { orderImageUrl } from "@/lib/imageUrl";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "@/lib/workflow";
import { orderTrackingBasePath } from "@/lib/routing";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, orderStatusToCardTone } from "@/lib/theme";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { OrderProductionStrip } from "@/components/orders/OrderProductionStrip";
import type { OrderSummary } from "@/lib/orderSummary";

/** "compact": a single progress bar - the Output landing page's card.
 *  "stages": the fleet dashboard's roomier card, where the progress bar is
 *  replaced by a strip with one segment per stage in this order's own plan -
 *  so you can see WHICH stages are done, which one is in progress and which
 *  moved on with a balance still owed, not just a single percentage. */
export type OrderCardVariant = "compact" | "stages";

const VARIANT_CLASSES: Record<OrderCardVariant, { card: string; header: string; thumb: string; placeholder: string; style: string; meta: string; status: string; partial: string; footer: string; urgency: string }> = {
  compact: {
    card: "gap-3 p-4 transition-transform duration-150 hover:-translate-y-0.5",
    header: "items-center gap-3",
    thumb: "h-12 w-12 rounded-xl ring-2 ring-inset",
    placeholder: "h-7 w-7",
    style: "text-sm font-bold",
    meta: "text-xs",
    status: "",
    partial: "rounded-md px-2 py-1",
    footer: "pt-2.5",
    urgency: "px-2",
  },
  stages: {
    card: "gap-4 p-5 transition-all duration-200 hover:-translate-y-1",
    header: "items-start gap-3.5",
    thumb: "h-14 w-14 rounded-2xl",
    placeholder: "h-8 w-8",
    style: "text-[15px] font-extrabold tracking-tight",
    meta: "mt-0.5 text-xs font-medium",
    status: "flex items-center gap-1.5",
    partial: "rounded-lg px-2.5 py-1.5",
    footer: "gap-2 pt-3",
    urgency: "px-2.5",
  },
};

/**
 * One order as a card - same four-colour status language as every other
 * order card in the app (theme.ts's cardStatus*): gray/blue/orange/green,
 * always meaning not started / on track / needs attention / done, so
 * "Delayed" never shows up under a blue bar. Links into the order under
 * whichever of /admin or /md it's shown in (see orderTrackingBasePath).
 */
export function OrderCard({
  bundle,
  summary,
  linkTo,
  ctaLabel,
  variant = "compact",
}: {
  bundle: OrderBundle;
  summary?: OrderSummary;
  /** Where the card goes - the order's tracking page by default. */
  linkTo?: (basePath: "/admin" | "/md", orderId: string) => string;
  /** A call-to-action button along the bottom of the card. */
  ctaLabel?: string;
  variant?: OrderCardVariant;
}) {
  const { order, progress } = bundle;
  const basePath = orderTrackingBasePath(usePathname());
  const imageUrl = orderImageUrl(order.imageId, 128);
  const urgency = deliveryUrgency(order.deliveryDate);
  const tone = orderStatusToCardTone(progress.status);
  const accent = cardStatusAccent[tone];
  const currentStage = progress.stages[progress.currentStageIndex]?.stage.label ?? "-";
  const isCompleted = progress.status === "completed";
  const v = VARIANT_CLASSES[variant];

  return (
    <Link
      href={linkTo ? linkTo(basePath, order.id) : `${basePath}/orders/${order.id}`}
      style={cardStatusSoftBg[tone]}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border ${v.card} ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

      <div className={`flex ${v.header}`}>
        <div className={`flex shrink-0 items-center justify-center overflow-hidden bg-white ${v.thumb}`} style={{ boxShadow: `inset 0 0 0 2px ${accent}33` }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={order.style} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <GarmentPlaceholder className={`${v.placeholder} text-ink-500`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-ink-900 ${v.style}`}>{order.style}</p>
          <p className={`truncate text-ink-600 ${v.meta}`}>
            IO {order.ioNo}
            {order.color ? ` · ${order.color}` : ""}
            {order.buyer ? ` · ${order.buyer.name}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-white ${v.status}`} style={{ backgroundColor: accent }}>
          {variant === "stages" && <span className="h-1.5 w-1.5 rounded-full bg-white/90" />}
          {ORDER_STATUS_LABEL[progress.status]}
        </span>
      </div>

      {variant === "stages" ? (
        <>
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
        </>
      ) : (
        <>
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
        </>
      )}

      {/* Stages that moved on without finishing still owe a balance. They're
          easy to lose track of precisely because the line carried on, so the
          count is surfaced on the card rather than only inside the order. */}
      {progress.partialStagesCount > 0 && (
        <p className={`border border-amber-300 bg-amber-50 text-[11px] font-medium text-amber-800 ${v.partial}`}>
          {progress.partialStagesCount} stage{progress.partialStagesCount === 1 ? "" : "s"} not complete - balance still owed
        </p>
      )}

      <OrderProductionStrip summary={summary} />

      <div className={`mt-auto flex items-center justify-between border-t border-black/10 text-xs ${v.footer}`}>
        <span className="text-ink-600">Delivery {formatDisplayDate(order.deliveryDate)}</span>
        <span className={`rounded-full border bg-white py-0.5 font-semibold ${v.urgency} ${urgencyColorClasses[urgency]}`}>
          {progress.daysRemaining !== null ? (progress.daysRemaining >= 0 ? `${progress.daysRemaining}d left` : `${Math.abs(progress.daysRemaining)}d overdue`) : "No date"}
        </span>
      </div>
      {ctaLabel && <span className="rounded-lg bg-brand-gradient px-3 py-2 text-center text-xs font-bold text-white shadow-[0_8px_18px_-8px_rgba(21,94,239,0.6)] transition-transform group-hover:-translate-y-px">{ctaLabel}</span>}
    </Link>
  );
}
