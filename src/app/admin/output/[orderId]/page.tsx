import { OutputView } from "@/components/orders/OutputView";

export default async function AdminOutputPage({ params }: PageProps<"/admin/output/[orderId]">) {
  const { orderId } = await params;
  return <OutputView orderId={orderId} />;
}
