import { OrderDetailView } from "@/components/orders/OrderDetailView";

export default async function MdOrderDetailPage({ params }: PageProps<"/md/orders/[orderId]">) {
  const { orderId } = await params;
  return <OrderDetailView orderId={orderId} />;
}
