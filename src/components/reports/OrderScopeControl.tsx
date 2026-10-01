"use client";

import { useMemo, useState } from "react";
import { ORDER_SCOPES, type OrderScope } from "@/lib/reports";
import { useBuyers } from "@/hooks/useBuyers";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { Tabs } from "@/components/ui/Tabs";
import { Checkbox } from "@/components/ui/FormControls";

export interface OrderOption {
  id: string;
  ioNo: string;
  style: string;
  buyerName: string | null;
}

/**
 * Which orders the report covers - All / Specific / Buyer-wise, per the
 * product ask. "Specific" offers the full order roster (not just orders
 * with activity in the period) so picking one that turns out to have zero
 * entries is itself a valid, informative result, not a dead end.
 */
export function OrderScopeControl({
  scope,
  onScope,
  orders,
  orderIds,
  onOrderIds,
  buyerId,
  onBuyerId,
}: {
  scope: OrderScope;
  onScope: (s: OrderScope) => void;
  orders: OrderOption[];
  orderIds: Set<string>;
  onOrderIds: (ids: Set<string>) => void;
  buyerId: string;
  onBuyerId: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: buyers = [] } = useBuyers();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...orders].sort((a, b) => a.ioNo.localeCompare(b.ioNo, undefined, { numeric: true }));
    if (!q) return sorted;
    return sorted.filter((o) => o.ioNo.toLowerCase().includes(q) || o.style.toLowerCase().includes(q) || (o.buyerName?.toLowerCase().includes(q) ?? false));
  }, [orders, search]);

  function toggle(id: string, checked: boolean) {
    const next = new Set(orderIds);
    if (checked) next.add(id);
    else next.delete(id);
    onOrderIds(next);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-600">Order Selection</p>
        <Tabs value={scope} onChange={onScope} tabs={ORDER_SCOPES.map((s) => ({ key: s.key, label: s.label }))} />
        <p className="mt-1 text-[11px] text-ink-500">{ORDER_SCOPES.find((s) => s.key === scope)?.hint}</p>
      </div>

      {scope === "buyer" && (
        <div className="max-w-xs">
          <BuyerFilter value={buyerId} onChange={onBuyerId} />
          {!buyerId && buyers.length > 0 && <p className="mt-1 text-[11px] font-medium text-amber-700">Pick a buyer to include their orders.</p>}
        </div>
      )}

      {scope === "specific" && (
        <div className="rounded-xl border border-ink-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search IO number, style, or buyer…"
              className="w-64 rounded-lg border border-ink-200 px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-ink-600">{orderIds.size} selected</span>
              {orderIds.size > 0 && (
                <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onOrderIds(new Set())}>
                  Clear
                </button>
              )}
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onOrderIds(new Set(filtered.map((o) => o.id)))}>
                Select all shown
              </button>
            </div>
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink-400">No orders match this search.</p>
            ) : (
              filtered.map((o) => (
                <div key={o.id} className="rounded-md px-1.5 py-1 hover:bg-ink-50">
                  <Checkbox
                    checked={orderIds.has(o.id)}
                    onChange={(checked) => toggle(o.id, checked)}
                    label={
                      <span className="truncate">
                        <b className="font-semibold">{o.ioNo}</b> · {o.style}
                        {o.buyerName ? <span className="text-ink-400"> · {o.buyerName}</span> : null}
                      </span>
                    }
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
