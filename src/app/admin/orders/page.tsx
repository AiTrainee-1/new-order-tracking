"use client";

import { useOrdersList } from "@/hooks/useOrdersList";
import { useOrderListActions } from "@/hooks/useOrderListActions";
import { OrdersListView } from "@/components/orders/OrdersListView";

/** Orders list - track/edit/hide/delete each one. Editing (Purchase Orders,
 *  sizes, even the stage plan) goes through /admin/orders/[orderId]/edit -
 *  see OrderEditPanel and useUpdateOrder for how existing PO/stage rows are
 *  preserved in place rather than deleted and recreated. The layout itself
 *  lives in OrdersListView; this page just supplies the data and the actions. */
export default function OrdersPage() {
  const { data: orders, isLoading, isError } = useOrdersList({ includeHidden: true });
  const { toggleHidden, handleDelete, hidePending, deletePending } = useOrderListActions((order) => ({
    title: `Delete "${order.style}"?`,
    message: "This permanently deletes the order and everything under it - POs, size breakdowns, assignments, all recorded production, material requirements, and history. It can't be undone.",
  }));

  return (
    <OrdersListView
      orders={orders}
      isLoading={isLoading}
      isError={isError}
      onToggleHidden={toggleHidden}
      onDelete={handleDelete}
      hidePending={hidePending}
      deletePending={deletePending}
    />
  );
}
