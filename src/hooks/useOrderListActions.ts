"use client";

import { useDeleteOrder, useSetOrderHidden } from "@/hooks/useOrderMutations";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import type { OrderListRow } from "@/hooks/useOrdersList";

/**
 * The Hide/Unhide and Delete actions on an order card, with their toasts and
 * the delete confirmation - shared by the Admin Orders list and a floor user's
 * "Your orders" tab. Only the confirmation's wording differs between them, so
 * that's the one thing the caller supplies.
 */
export function useOrderListActions(deleteConfirm: (order: OrderListRow) => { title: string; message: string }) {
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
    const ok = await confirm({ ...deleteConfirm(order), confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    try {
      await deleteOrder.mutateAsync(order.id);
      toast.success(`Deleted "${order.style}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete order.");
    }
  }

  return { toggleHidden, handleDelete, hidePending: setHidden.isPending, deletePending: deleteOrder.isPending };
}
