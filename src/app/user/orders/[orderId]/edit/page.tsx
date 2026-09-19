import { OrderEditPanel } from "@/components/forms/OrderEditPanel";
import { BackButton } from "@/components/ui/BackButton";

export default async function EditOrderUserPage({ params }: PageProps<"/user/orders/[orderId]/edit">) {
  const { orderId } = await params;

  return (
    <div className="space-y-4">
      <BackButton to="/user/create-order" label="Back to My Orders" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Edit Order</h1>
        <p className="mt-1 text-sm text-ink-600">Change the garment details, size breakdown, Purchase Orders, or this order&apos;s stage plan.</p>
      </div>
      <OrderEditPanel orderId={orderId} redirectTo="/user/create-order" />
    </div>
  );
}
