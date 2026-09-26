"use client";

import Link from "next/link";
import type { OrderListRow } from "@/hooks/useOrdersList";
import { orderImageUrl } from "@/lib/imageUrl";
import { bucketOfOrder, ORDER_BUCKETS } from "@/lib/orderList";
import { daysRemaining, deliveryUrgency, formatDisplayDate, urgencyColorClasses } from "@/lib/workflow";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, orderUrgencyToCardTone } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";

/**
 * One order on the Orders page - the same skin as the dashboard's order card
 * (status-tinted, top accent bar, status pill, delivery footer), but a
 * management card rather than a progress one: PO count and quantity instead
 * of a stage strip, and the Track / Edit / Hide / Delete actions instead of
 * being one big link. The tint and pill share one colour language with every
 * other order card - hidden reads grey, overdue/approaching orange, the rest blue.
 */
export function ManageOrderCard({
  order,
  onToggleHidden,
  onDelete,
  hidePending,
  deletePending,
}: {
  order: OrderListRow;
  onToggleHidden: (order: OrderListRow) => void;
  onDelete: (order: OrderListRow) => void;
  hidePending?: boolean;
  deletePending?: boolean;
}) {
  const imageUrl = orderImageUrl(order.imageId);
  const urgency = deliveryUrgency(order.deliveryDate);
  const remaining = daysRemaining(order.deliveryDate);
  const bucket = bucketOfOrder(order);
  // An order with no delivery date isn't "on track" - it reads grey like a
  // hidden one, matching its grey segment in the overview above the list.
  const tone = bucket === "no_date" ? "notStarted" : orderUrgencyToCardTone(order.isHidden, urgency);
  const accent = cardStatusAccent[tone];
  const bucketLabel = ORDER_BUCKETS.find((b) => b.key === bucket)!.label;
  const poCount = order.purchaseOrders.length;

  return (
    <div
      style={cardStatusSoftBg[tone]}
      className={`relative flex animate-fadeInUp flex-col gap-4 overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-1 ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}
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
            {order.buyer ? ` · ${order.buyer.name}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: accent }}>
          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
          {bucketLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Purchase orders</p>
          <p className="text-lg font-bold tabular-nums text-ink-900">{poCount}</p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Quantity</p>
          <p className="text-lg font-bold tabular-nums text-ink-900">
            {order.totalQty.toLocaleString()} <span className="text-[11px] font-semibold text-ink-500">PCS</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-3 text-xs">
        <span className="text-ink-600">Delivery {formatDisplayDate(order.deliveryDate)}</span>
        <span className={`rounded-full border bg-white px-2.5 py-0.5 font-semibold ${urgencyColorClasses[urgency]}`}>
          {remaining !== null ? (remaining >= 0 ? `${remaining}d left` : `${Math.abs(remaining)}d overdue`) : "No date"}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Link href={`/admin/orders/${order.id}`} className="flex-1">
          <Button size="sm" className="w-full">
            Track →
          </Button>
        </Link>
        <Link href={`/admin/orders/${order.id}/edit`}>
          <Button
            variant="ghost"
            size="sm"
            className="text-indigo-700 transition-all duration-200 hover:bg-brand-gradient hover:text-white hover:shadow-[0_8px_18px_-8px_rgba(21,94,239,0.55)]"
          >
            Edit
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-700 transition-all duration-200 hover:bg-warn-gradient hover:text-white hover:shadow-[0_8px_18px_-8px_rgba(217,119,6,0.55)]"
          onClick={() => onToggleHidden(order)}
          isLoading={hidePending}
        >
          {order.isHidden ? "Unhide" : "Hide"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-status-bad transition-all duration-200 hover:bg-bad-gradient hover:text-white hover:shadow-[0_8px_18px_-8px_rgba(225,29,72,0.55)]"
          onClick={() => onDelete(order)}
          isLoading={deletePending}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
