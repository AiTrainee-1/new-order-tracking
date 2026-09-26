import type { Order } from "./types";

/** True when `order` belongs to the filtered buyer - "" (no filter) matches everything. */
export function matchesBuyer(order: Pick<Order, "buyerId" | "buyer">, buyerId: string): boolean {
  return !buyerId || (order.buyerId ?? order.buyer?.id ?? null) === buyerId;
}
