"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUpdateOrder, type OrderFormInput } from "@/hooks/useOrderMutations";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useToast } from "@/context/ToastContext";
import { orderImageUrl } from "@/lib/imageUrl";
import { Card, CardBody } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { OrderForm } from "@/components/forms/OrderForm";

/**
 * Full order editing - basic details, Purchase Orders/sizes, and the stage
 * plan, all at once (see useUpdateOrder's own comment on why this is safe:
 * existing PO/stage rows are updated in place by id, never deleted and
 * recreated, unless the caller explicitly removes them from the list).
 *
 * Shared between Admin's own edit page and the floor-side one, same pairing
 * as OrderCreatePanel/OrderForm for creation - same form, same mutation,
 * same result either way. Owns its own navigation (via `redirectTo`) rather
 * than taking an onSaved callback, so the page.tsx wrappers that render it
 * can stay plain server components, like every other order-tracking page.
 */
export function OrderEditPanel({ orderId, redirectTo }: { orderId: string; redirectTo: string }) {
  const toast = useToast();
  const router = useRouter();
  const { order, purchaseOrders, isLoading, isError } = useOrderDetail(orderId);
  const updateOrder = useUpdateOrder();
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(input: OrderFormInput) {
    setFormError(null);
    try {
      await updateOrder.mutateAsync({ orderId, input });
      toast.success("Order updated.");
      router.push(redirectTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update order.";
      setFormError(message);
      toast.error(message);
    }
  }

  if (isLoading) return <Loader label="Loading this order…" />;
  if (isError || !order) {
    return <p className="text-sm text-status-bad">Couldn&apos;t load this order.</p>;
  }

  const sizes = purchaseOrders.flatMap((po) => po.sizeQuantities);

  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient" />
      <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-brand/10 blur-3xl" />
      <CardBody>
        <OrderForm
          initialOrder={order}
          initialPurchaseOrders={purchaseOrders}
          initialSizes={sizes}
          initialStagePlan={order.stagePlan}
          existingImageUrl={orderImageUrl(order.imageId)}
          onSubmit={handleSubmit}
          onCancel={() => router.push(redirectTo)}
          submitting={updateOrder.isPending}
          error={formError}
        />
      </CardBody>
    </Card>
  );
}
