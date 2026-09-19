"use client";

import { useOrdersList, type OrderListRow } from "@/hooks/useOrdersList";
import { useDeleteOrder, useSetOrderHidden } from "@/hooks/useOrderMutations";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { OrdersListView } from "@/components/orders/OrdersListView";

/** Orders list - track/edit/hide/delete each one. Editing (Purchase Orders,
 *  sizes, even the stage plan) goes through /admin/orders/[orderId]/edit -
 *  see OrderEditPanel and useUpdateOrder for how existing PO/stage rows are
 *  preserved in place rather than deleted and recreated. The layout itself
 *  lives in OrdersListView; this page just supplies the data and the actions. */
export default function OrdersPage() {
  const { data: orders, isLoading } = useOrdersList({ includeHidden: true });
  const setHidden = useSetOrderHidden();
  const deleteOrder = useDeleteOrder();
  const toast = useToast();
  const confirm = useConfirm();

  async function toggleHidden(order: OrderListRow) {
    try {
      await setHidden.mutateAsync({ orderId: order.id, hidden: !order.isHidden });
      toast.success(order.isHidden ? "Order unhidden." : "Order hidden - it won't show anywhere else in the app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order.");
    }
  }

  async function handleDelete(order: OrderListRow) {
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
    <OrdersListView
      orders={orders}
      isLoading={isLoading}
      onToggleHidden={toggleHidden}
      onDelete={handleDelete}
      hidePending={setHidden.isPending}
      deletePending={deleteOrder.isPending}
    />
  );
}
