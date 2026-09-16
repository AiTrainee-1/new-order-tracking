import { OrderDetailView } from "@/components/orders/OrderDetailView";

export default async function AdminOrderDetailPage({ params }: PageProps<"/admin/orders/[orderId]">) {
  const { orderId } = await params;
  return <OrderDetailView orderId={orderId} />;
}
