"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StagePlanValue } from "@/components/forms/StagePlanPicker";

export interface PoSizeInput {
  sizeCode: string;
  quantity: number;
}

export interface OrderPoInput {
  /** An existing PurchaseOrder id when editing a row that already exists -
   *  omitted for a freshly added row. Lets the update route tell "keep this
   *  PO, just change its numbers" apart from "this is a new row" without
   *  ever reassigning an id that production_txns/stage_entries/etc. may
   *  already point at. */
  id?: string;
  poNumber: string;
  /** Derived from `sizes` - kept on the row so the API doesn't need a
   *  separate round trip to compute it. This is the BUYER total;
   *  extraPercent is applied on top of it downstream, not baked in. */
  quantity: number;
  deliveryDate: string | null;
  sizes: PoSizeInput[];
  extraPercent: number;
}

/** A PO's quantity is the sum of its size rows, never typed directly - the
 *  two can then never disagree. */
export function poTotal(sizes: PoSizeInput[]): number {
  return sizes.reduce((total, s) => total + (Number(s.quantity) || 0), 0);
}

export interface OrderFormInput {
  ioNo: string;
  style: string;
  description: string;
  color: string;
  fabric: string;
  deliveryDate: string | null;
  imageFile: File | null;
  purchaseOrders: OrderPoInput[];
  stagePlan: StagePlanValue;
}

function invalidateOrderQueries(queryClient: ReturnType<typeof useQueryClient>, orderId?: string) {
  queryClient.invalidateQueries({ queryKey: ["orders_list"] });
  if (orderId) queryClient.invalidateQueries({ queryKey: ["order_detail", orderId] });
}

async function uploadOrderImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/images", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not upload the image.");
  return data.imageId as string;
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrderFormInput) => {
      const usablePos = input.purchaseOrders.filter((po) => po.poNumber.trim().length > 0);
      const imageId = input.imageFile ? await uploadOrderImage(input.imageFile) : null;

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ioNo: input.ioNo,
          style: input.style,
          description: input.description || null,
          color: input.color || null,
          fabric: input.fabric || null,
          deliveryDate: input.deliveryDate,
          imageId,
          purchaseOrders: usablePos.map((po) => ({
            poNumber: po.poNumber,
            quantity: poTotal(po.sizes),
            deliveryDate: po.deliveryDate,
            extraPercent: po.extraPercent,
            sizes: po.sizes.filter((s) => s.sizeCode.trim().length > 0),
          })),
          stagePlan: {
            stages: input.stagePlan.selectedIds.map((id, i) => ({ stageDefinitionId: id, seq: i + 1 })),
            sizeOriginStageDefinitionId: input.stagePlan.sizeOriginStageDefinitionId,
            lotOriginStageDefinitionId: input.stagePlan.lotOriginStageDefinitionId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create order.");
      return data.order;
    },
    onSuccess: () => invalidateOrderQueries(queryClient),
  });
}

/** Full edit - basic details, Purchase Orders/sizes, and the stage plan, all
 *  at once. Unlike useCreateOrder, an omitted `imageFile` means "leave the
 *  existing image alone" rather than "no image": the image field is only
 *  sent when a new file was actually picked. */
export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, input }: { orderId: string; input: OrderFormInput }) => {
      const usablePos = input.purchaseOrders.filter((po) => po.poNumber.trim().length > 0);
      const imageId = input.imageFile ? await uploadOrderImage(input.imageFile) : undefined;

      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ioNo: input.ioNo,
          style: input.style,
          description: input.description || null,
          color: input.color || null,
          fabric: input.fabric || null,
          deliveryDate: input.deliveryDate,
          ...(imageId !== undefined ? { imageId } : {}),
          purchaseOrders: usablePos.map((po) => ({
            id: po.id,
            poNumber: po.poNumber,
            deliveryDate: po.deliveryDate,
            extraPercent: po.extraPercent,
            sizes: po.sizes.filter((s) => s.sizeCode.trim().length > 0),
          })),
          stagePlan: {
            stages: input.stagePlan.selectedIds.map((id, i) => ({ stageDefinitionId: id, seq: i + 1 })),
            sizeOriginStageDefinitionId: input.stagePlan.sizeOriginStageDefinitionId,
            lotOriginStageDefinitionId: input.stagePlan.lotOriginStageDefinitionId,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update order.");
      return data.order;
    },
    onSuccess: (_data, v) => invalidateOrderQueries(queryClient, v.orderId),
  });
}

export function useSetOrderHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, hidden }: { orderId: string; hidden: boolean }) => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: hidden }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update the order.");
      return data.order;
    },
    onSuccess: (_data, v) => invalidateOrderQueries(queryClient, v.orderId),
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete order.");
    },
    onSuccess: (_data, orderId) => invalidateOrderQueries(queryClient, orderId),
  });
}
