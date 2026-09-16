"use client";

import { useState } from "react";
import { useCreateOrder, type OrderFormInput } from "@/hooks/useOrderMutations";
import { useToast } from "@/context/ToastContext";
import { Card, CardBody } from "@/components/ui/Card";
import { OrderForm } from "@/components/forms/OrderForm";
import type { Order } from "@/lib/types";

/**
 * The create-order form itself, shared between the floor-side Create Orders
 * page and Admin's own full-page create flow - same form, same mutation,
 * same result either way (see useCreateOrder). Only what happens around it
 * (title, back link, "orders you've made" list) differs per caller.
 */
export function OrderCreatePanel({ onCreated }: { onCreated?: (order: Order) => void }) {
  const toast = useToast();
  const createOrder = useCreateOrder();
  const [formError, setFormError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function handleSubmit(input: OrderFormInput) {
    setFormError(null);
    try {
      const order = await createOrder.mutateAsync(input);
      toast.success("Order created successfully.");
      setFormKey((k) => k + 1);
      onCreated?.(order);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create order.";
      setFormError(message);
      toast.error(message);
    }
  }

  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient" />
      <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-brand/10 blur-3xl" />
      <CardBody>
        <OrderForm
          key={formKey}
          onSubmit={handleSubmit}
          onCancel={() => setFormKey((k) => k + 1)}
          submitting={createOrder.isPending}
          error={formError}
        />
      </CardBody>
    </Card>
  );
}
