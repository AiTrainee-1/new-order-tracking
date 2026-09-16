"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useOrdersList } from "@/hooks/useOrdersList";
import { useDeleteOrder, useSetOrderHidden } from "@/hooks/useOrderMutations";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { orderImageUrl } from "@/lib/imageUrl";
import { deliveryUrgency, formatDisplayDate } from "@/lib/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { OrderCreatePanel } from "@/components/forms/OrderCreatePanel";
import { cardStatusAccent, orderUrgencyToCardTone } from "@/lib/theme";
import type { Order } from "@/lib/types";

/**
 * The floor-side counterpart to Admin's "+ Create Order" - same form, same
 * useCreateOrder mutation, same result: a normal row in `orders` that shows
 * up everywhere else in the app exactly like an Admin-created one (Dashboard,
 * Orders, Assign Work, Stage Roles, Data Input). The only thing scoped to
 * this user is what they're allowed to do here - create, and manage what
 * they created - not what the created order can be used for afterward.
 *
 * Reachable only with canCreateOrders (granted from Stage Roles); the nav
 * item is hidden without it, and this is the backstop if someone still types
 * the URL directly. The real backstop is server-side - the orders API's
 * authz check blocks it regardless - this is just the friendly version.
 */
export default function CreateOrderPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  // includeHidden: this is the one list in the whole app that's SUPPOSED to
  // still show a hidden order - otherwise there'd be nowhere left to unhide
  // it from (see useOrdersList's default, which excludes them everywhere else).
  const { data, isLoading } = useOrdersList({ includeHidden: true });

  const myOrders = useMemo(() => (data ?? []).filter((o) => o.createdBy === appUser?.id), [data, appUser]);

  useEffect(() => {
    if (appUser && !appUser.canCreateOrders) router.replace("/user/home");
  }, [appUser, router]);

  if (!appUser || !appUser.canCreateOrders) return <Loader full label="Loading…" />;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/70 px-6 py-6 shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),0_4px_12px_-2px_rgba(21,94,239,0.04)] backdrop-blur-md">
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-status-good/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-xl shadow-[0_12px_30px_-8px_rgba(21,94,239,0.5)]">📦</span>
          <div>
            <h1 className="bg-clip-text text-2xl font-extrabold tracking-tight text-transparent" style={{ backgroundImage: "linear-gradient(100deg, #155EEF 0%, #7C3AED 60%, #DB2777 100%)" }}>
              Create Order
            </h1>
            <p className="mt-0.5 text-sm text-ink-600">Add a new garment order and its POs - it&apos;ll appear across the whole app just like any other order, ready to be assigned and tracked.</p>
          </div>
        </div>
      </div>

      <OrderCreatePanel />

      {!isLoading && myOrders.length > 0 && (
        <Card className="animate-fadeInUp">
          <CardHeader title="Orders You've Created" subtitle={`${myOrders.length} so far`} />
          <CardBody className="space-y-2.5">
            {myOrders.map((order, i) => (
              <MyOrderRow key={order.id} order={order} index={i} />
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function MyOrderRow({ order, index }: { order: Order; index: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const setHidden = useSetOrderHidden();
  const deleteOrder = useDeleteOrder();
  const imageUrl = orderImageUrl(order.imageId);

  async function toggleHidden() {
    try {
      await setHidden.mutateAsync({ orderId: order.id, hidden: !order.isHidden });
      toast.success(order.isHidden ? "Order unhidden." : "Order hidden - it won't show anywhere else in the app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order.");
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this order?",
      message: `This permanently deletes "${order.style}" and everything under it - POs, size breakdowns, assignments, and any recorded production. It can't be undone.`,
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

  const tone = orderUrgencyToCardTone(order.isHidden, order.deliveryDate ? deliveryUrgency(order.deliveryDate) : "none");

  return (
    <div
      className="group relative flex animate-fadeInUp items-center gap-3 overflow-hidden rounded-xl border border-white/70 bg-white/70 p-3 shadow-[0_6px_16px_-10px_rgba(15,23,42,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_12px_28px_-10px_rgba(15,23,42,0.25)]"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms`, animationFillMode: "backwards" }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: cardStatusAccent[tone] }} />
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/80 bg-white/70 ring-1 ring-inset transition-transform duration-200 group-hover:scale-105"
        style={{ boxShadow: `inset 0 0 0 1px ${cardStatusAccent[tone]}33` }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
        ) : (
          <GarmentPlaceholder className="h-6 w-6 text-ink-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink-900">{order.style}</p>
          {order.isHidden && <Badge tone="warn">Hidden</Badge>}
        </div>
        <p className="truncate text-xs text-ink-500">
          IO {order.ioNo} · {order.color} · {order.totalQty.toLocaleString()} PCS · Delivery {formatDisplayDate(order.deliveryDate)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={toggleHidden} isLoading={setHidden.isPending}>
          {order.isHidden ? "Unhide" : "Hide"}
        </Button>
        <Button variant="ghost" size="sm" className="text-status-bad hover:bg-red-50" onClick={handleDelete} isLoading={deleteOrder.isPending}>
          Delete
        </Button>
      </div>
    </div>
  );
}
