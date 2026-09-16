"use client";

import { useRouter } from "next/navigation";
import { OrderCreatePanel } from "@/components/forms/OrderCreatePanel";
import { BackButton } from "@/components/ui/BackButton";

export default function CreateOrderAdminPage() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Create Order</h1>
        <p className="mt-1 text-sm text-ink-600">
          Set up the garment details, size breakdown, and this order's own stage plan.
        </p>
      </div>
      <OrderCreatePanel onCreated={() => router.push("/admin/orders")} />
    </div>
  );
}
