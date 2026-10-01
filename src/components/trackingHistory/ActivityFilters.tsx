"use client";

import { useMemo } from "react";
import type { ActivityRecord } from "@/lib/trackingHistory";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { Select } from "@/components/ui/FormControls";

export interface ActivityFilterState {
  buyerId: string;
  orderId: string;
  userId: string;
  stageKey: string;
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFilterState = { buyerId: "", orderId: "", userId: "", stageKey: "" };

/**
 * The shared User / Order / Stage / Buyer filter bar for every report that's
 * a grouping of the flat activity feed (User-Wise, Stage-Wise, Order-Wise,
 * Detailed Activity, Today vs Yesterday). Order/User/Stage options are built
 * from the records actually loaded, not the whole app's user/order list, so
 * the dropdowns only ever offer choices with something behind them.
 */
export function ActivityFilters({ records, value, onChange }: { records: ActivityRecord[]; value: ActivityFilterState; onChange: (next: ActivityFilterState) => void }) {
  const scopedByBuyer = useMemo(() => (value.buyerId ? records.filter((r) => r.buyerId === value.buyerId) : records), [records, value.buyerId]);

  const orders = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of scopedByBuyer) map.set(r.orderId, `${r.ioNo} · ${r.style}`);
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [scopedByBuyer]);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of scopedByBuyer) map.set(r.userId, r.userName);
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedByBuyer]);

  const stages = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of scopedByBuyer) map.set(r.stageKey, r.stageLabel);
    return Array.from(map, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedByBuyer]);

  function set(patch: Partial<ActivityFilterState>) {
    const next = { ...value, ...patch };
    // A choice that's no longer offered under the narrowed set (e.g. a user
    // who only appears for a different buyer) would otherwise silently show
    // zero rows with no clue why.
    if (next.orderId && !orders.some((o) => o.id === next.orderId)) next.orderId = "";
    if (next.userId && !users.some((u) => u.id === next.userId)) next.userId = "";
    if (next.stageKey && !stages.some((s) => s.key === next.stageKey)) next.stageKey = "";
    onChange(next);
  }

  const anyFilter = value.buyerId || value.orderId || value.userId || value.stageKey;

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-4">
        <BuyerFilter value={value.buyerId} onChange={(buyerId) => set({ buyerId })} />
        <Select label="Order" value={value.orderId} onChange={(e) => set({ orderId: e.target.value })}>
          <option value="">All orders</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select label="User" value={value.userId} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </Select>
        <Select label="Stage" value={value.stageKey} onChange={(e) => set({ stageKey: e.target.value })}>
          <option value="">All stages</option>
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      {anyFilter ? (
        <button type="button" onClick={() => onChange(EMPTY_ACTIVITY_FILTERS)} className="text-xs font-semibold text-brand hover:underline">
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function describeActivityFilters(value: ActivityFilterState, records: ActivityRecord[]): string {
  const buyer = value.buyerId ? records.find((r) => r.buyerId === value.buyerId)?.buyerName ?? "Selected buyer" : "All";
  const order = value.orderId ? records.find((r) => r.orderId === value.orderId)?.ioNo ?? "Selected order" : "All";
  const user = value.userId ? records.find((r) => r.userId === value.userId)?.userName ?? "Selected user" : "All";
  const stage = value.stageKey ? records.find((r) => r.stageKey === value.stageKey)?.stageLabel ?? "Selected stage" : "All";
  return `Buyer: ${buyer} · Order: ${order} · User: ${user} · Stage: ${stage}`;
}

export function applyFilters(records: ActivityRecord[], value: ActivityFilterState): ActivityRecord[] {
  return records.filter(
    (r) => (!value.buyerId || r.buyerId === value.buyerId) && (!value.orderId || r.orderId === value.orderId) && (!value.userId || r.userId === value.userId) && (!value.stageKey || r.stageKey === value.stageKey),
  );
}
