"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOrdersList } from "@/hooks/useOrdersList";
import { useDeleteOrder, useSetOrderHidden } from "@/hooks/useOrderMutations";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { orderImageUrl } from "@/lib/imageUrl";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { Input } from "@/components/ui/FormControls";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { deliveryUrgency, formatDisplayDate, urgencyColorClasses, type DeliveryUrgency } from "@/lib/workflow";
import { cardStatusAccent, orderUrgencyToCardTone } from "@/lib/theme";
import type { Order } from "@/lib/types";

const URGENCY_LABEL: Record<DeliveryUrgency, string> = {
  overdue: "Overdue",
  urgent: "Urgent",
  soon: "Due soon",
  safe: "On track",
  none: "No date",
};

/** Orders list - track/edit/hide/delete each one. Editing (Purchase Orders,
 *  sizes, even the stage plan) goes through /admin/orders/[orderId]/edit -
 *  see OrderEditPanel and useUpdateOrder for how existing PO/stage rows are
 *  preserved in place rather than deleted and recreated. */
export default function OrdersPage() {
  const { data: orders, isLoading } = useOrdersList({ includeHidden: true });
  const setHidden = useSetOrderHidden();
  const deleteOrder = useDeleteOrder();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !orders) return orders;
    return orders.filter(
      (o) => o.ioNo.toLowerCase().includes(q) || o.style.toLowerCase().includes(q) || (o.color?.toLowerCase().includes(q) ?? false),
    );
  }, [orders, search]);

  async function toggleHidden(order: Order) {
    try {
      await setHidden.mutateAsync({ orderId: order.id, hidden: !order.isHidden });
      toast.success(order.isHidden ? "Order unhidden." : "Order hidden - it won't show anywhere else in the app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order.");
    }
  }

  async function handleDelete(order: Order) {
    const ok = await confirm({
      title: `Delete "${order.style}"?`,
      message: "This permanently deletes the order and everything under it - POs, size breakdowns, assignments, all recorded production, material requirements, and history. It can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteOrder.mutateAsync(order.id);
      toast.success(`Deleted "${order.style}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete order.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Orders</h1>
          <p className="mt-1 text-sm text-ink-600">Every order, with its own configured stage plan.</p>
        </div>
        <Link href="/admin/orders/new" className="group">
          <Button className="gap-1.5">
            <span className="inline-block transition-transform duration-300 group-hover:rotate-90">+</span>
            Create Order
          </Button>
        </Link>
      </div>

      {isLoading && <Loader label="Loading orders…" />}

      {orders && orders.length > 0 && (
        <Input placeholder="Search by IO number, style, or color…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-sm" />
      )}

      {orders && orders.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-2xl shadow-[0_12px_30px_-8px_rgba(21,94,239,0.45)]">📦</span>
          <p className="text-sm font-semibold text-ink-800">No orders yet</p>
          <p className="max-w-sm text-sm text-ink-500">Create the first one to try the dynamic, per-order stage plan.</p>
        </Card>
      )}

      {orders && orders.length > 0 && filteredOrders?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-ink-500">No orders match this search.</p>
        </Card>
      )}

      {filteredOrders && filteredOrders.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order, i) => {
            const imageUrl = orderImageUrl(order.imageId);
            const urgency = order.deliveryDate ? deliveryUrgency(order.deliveryDate) : null;
            const urgencyLabel = urgency ? URGENCY_LABEL[urgency] : null;
            const poCount = order.purchaseOrders.length;
            // Gray/blue/orange, the same status colours used everywhere else -
            // hidden reads as gray, an approaching/overdue delivery as orange.
            const tone = orderUrgencyToCardTone(order.isHidden, urgency ?? "none");

            return (
              <Card
                key={order.id}
                className="group relative animate-fadeInUp overflow-hidden !bg-white/85 transition-all duration-300 hover:-translate-y-1.5 hover:!shadow-[0_28px_56px_-16px_rgba(21,94,239,0.28),0_10px_24px_-8px_rgba(15,23,42,0.10),inset_0_1px_1px_0_rgba(255,255,255,0.9)]"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, animationFillMode: "backwards" }}
              >
                {/* Top accent bar - colour carries status (gray/blue/orange). */}
                <span
                  className="absolute inset-x-0 top-0 h-[3px] transition-opacity duration-300 opacity-70 group-hover:opacity-100"
                  style={{ backgroundColor: cardStatusAccent[tone] }}
                />
                {/* Soft glow that blooms in from the corner on hover - purely decorative. */}
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

                <div className="relative flex items-center gap-3 border-b border-white/70 p-4">
                  <div
                    className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-2 ring-white transition-transform duration-300 group-hover:scale-105"
                    style={!imageUrl ? { backgroundImage: "linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)" } : undefined}
                  >
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={order.style} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    ) : (
                      <GarmentPlaceholder className="h-7 w-7 text-indigo-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-ink-900">{order.style}</p>
                      {order.isHidden && <Badge tone="warn">Hidden</Badge>}
                    </div>
                    <p className="truncate text-xs font-medium text-ink-500">
                      IO {order.ioNo} · {order.color}
                    </p>
                  </div>
                </div>

                <CardBody className="relative space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 font-bold text-indigo-700 ring-1 ring-inset ring-indigo-200/70">
                      {poCount} PO{poCount === 1 ? "" : "s"}
                    </span>
                    <span className="font-bold tabular-nums text-ink-800">{order.totalQty.toLocaleString()} PCS</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-500">Delivery {formatDisplayDate(order.deliveryDate)}</span>
                    {urgency && urgency !== "none" && <span className={`rounded-full border bg-white px-2 py-0.5 font-semibold ${urgencyColorClasses[urgency]}`}>{urgencyLabel}</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
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
                      onClick={() => toggleHidden(order)}
                      isLoading={setHidden.isPending}
                    >
                      {order.isHidden ? "Unhide" : "Hide"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-status-bad transition-all duration-200 hover:bg-bad-gradient hover:text-white hover:shadow-[0_8px_18px_-8px_rgba(225,29,72,0.55)]"
                      onClick={() => handleDelete(order)}
                      isLoading={deleteOrder.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
