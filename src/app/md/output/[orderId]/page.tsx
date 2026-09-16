import { OutputView } from "@/components/orders/OutputView";

export default async function MdOutputPage({ params }: PageProps<"/md/output/[orderId]">) {
  const { orderId } = await params;
  return <OutputView orderId={orderId} />;
}
