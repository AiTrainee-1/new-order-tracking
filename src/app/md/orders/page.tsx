"use client";

import { useOrdersList } from "@/hooks/useOrdersList";
import { OrdersListView } from "@/components/orders/OrdersListView";

/** MD's Orders list - the same list, search, filters and production figures the
 *  Admin sees, track-only: nothing here creates, edits, hides or deletes. */
export default function MdOrdersPage() {
  const { data: orders, isLoading } = useOrdersList();
  return <OrdersListView orders={orders} isLoading={isLoading} readOnly basePath="/md" />;
}
