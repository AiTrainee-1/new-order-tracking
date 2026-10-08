"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/context/ConfirmContext";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import { useOrdersList, type OrderListRow } from "@/hooks/useOrdersList";
import { useNow, useTnaOverview } from "@/hooks/useTna";
import { matchesBuyer } from "@/lib/buyers";
import { TNA_STATUS_META, computeTna } from "@/lib/tna";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FilterIcon, FilterSelect } from "@/components/ui/FilterSelect";
import { Loader } from "@/components/ui/Loader";
import { AccentCard, PageHero, SectionTitle } from "@/components/ui/SectionCard";
import { StageScheduleEditor } from "./StageScheduleEditor";
import { TnaNav } from "./TnaNav";

const orderLabel = (o: Pick<OrderListRow, "style" | "color">) => `${o.style}${o.color ? ` / ${o.color}` : ""}`;

/**
 * TNA Assignment: buyer -> IO -> the orders under it -> one order -> its stages.
 * Same flow as the Grouping page. Orders and stages are never touched by
 * anything here except by adding or changing their TNA schedule.
 */
export function TnaAssign() {
  const confirm = useConfirm();
  const { appUser } = useAuth();
  const who = appUser?.id ?? "anon";
  const params = useSearchParams();
  const deepLink = params.get("order");
  const { data: orders, isLoading } = useOrdersList({ includeStagePlan: true });
  const { data: overview = [] } = useTnaOverview();
  const now = useNow(30_000);

  const [buyerId, setBuyerId] = usePersistedState(`ot:tna-assign:${who}:buyer`, "");
  const [ioNo, setIoNo] = usePersistedState(`ot:tna-assign:${who}:io`, "");
  const [orderId, setOrderId] = usePersistedState(`ot:tna-assign:${who}:order`, "");
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  // /admin/TNA/assign?order=<id> (from a record's "Edit this order's TNA") jumps straight to that order.
  const appliedLink = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLink || !orders || appliedLink.current === deepLink) return;
    const target = orders.find((o) => o.id === deepLink);
    if (!target) return;
    appliedLink.current = deepLink;
    setBuyerId("");
    setIoNo(target.ioNo);
    setOrderId(target.id);
  }, [deepLink, orders, setBuyerId, setIoNo, setOrderId]);

  const buyerOrders = useMemo(() => (orders ?? []).filter((o) => matchesBuyer(o, buyerId)), [orders, buyerId]);
  const ioNumbers = useMemo(() => Array.from(new Set(buyerOrders.map((o) => o.ioNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [buyerOrders]);
  const ordersForIo = useMemo(() => buyerOrders.filter((o) => o.ioNo === ioNo).sort((a, b) => orderLabel(a).localeCompare(orderLabel(b))), [buyerOrders, ioNo]);
  const selected = useMemo(() => (orders ?? []).find((o) => o.id === orderId) ?? null, [orders, orderId]);

  const byOrder = useMemo(() => {
    const m = new Map<string, typeof overview>();
    for (const r of overview) m.set(r.orderId, [...(m.get(r.orderId) ?? []), r]);
    return m;
  }, [overview]);

  /** Switching away from an order with unsaved edits asks first. */
  async function guarded(action: () => void) {
    if (dirty.current) {
      const ok = await confirm({ title: "Discard your unsaved TNA changes?", message: "You've typed dates for this order that haven't been saved. Switching now throws them away.", confirmLabel: "Discard and switch", tone: "danger" });
      if (!ok) return;
      dirty.current = false;
    }
    action();
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon="🗓️"
        iconBg="linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)"
        title="TNA Assignment"
        titleGradient="linear-gradient(100deg, #0D9488 0%, #2563EB 55%, #7C3AED 100%)"
        description="Pick a buyer, an IO and an order, then give each of its stages a start, an end and (optionally) some grace time. Stages you leave empty simply aren't tracked."
      />

      <TnaNav />

      <AccentCard tone="sky">
        <CardHeader title={<SectionTitle icon="🧭" tone="sky">Choose an order</SectionTitle>} subtitle="Buyer → IO → order. Every order under the IO is listed." />
        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <BuyerFilter value={buyerId} onChange={(v) => guarded(() => { setBuyerId(v); setIoNo(""); setOrderId(""); })} />
            <FilterSelect
              label="IO"
              icon={FilterIcon.order}
              value={ioNo}
              onChange={(v) => guarded(() => { setIoNo(v); setOrderId(""); })}
              placeholder="Select an IO…"
              searchPlaceholder="Search IO numbers…"
              options={ioNumbers.map((io) => ({ value: io, label: `IO ${io}` }))}
            />
          </div>

          {isLoading && <Loader label="Loading orders…" />}

          {ioNo && ordersForIo.length > 0 && (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {ordersForIo.map((o) => {
                const recs = byOrder.get(o.id) ?? [];
                const total = o.stagePlan?.length ?? 0;
                const worst = recs.map((r) => computeTna(r, now)).sort((a, b) => TNA_STATUS_META[a.status].rank - TNA_STATUS_META[b.status].rank)[0];
                const active = o.id === orderId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => guarded(() => setOrderId(o.id))}
                    aria-pressed={active}
                    className={`group relative rounded-2xl border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 ${active ? "border-brand bg-brand/[0.06] shadow-[0_14px_30px_-14px_rgba(21,94,239,0.5)] ring-2 ring-brand/30" : "border-white/80 bg-white/70 hover:bg-white"}`}
                  >
                    <p className="flex items-center gap-2">
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-brand bg-brand" : "border-ink-300"}`}>{active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
                      <span className="truncate text-sm font-extrabold text-ink-900">{orderLabel(o)}</span>
                    </p>
                    <p className="mt-0.5 truncate pl-6 text-xs text-ink-500">
                      {o.totalQty.toLocaleString()} PCS · {o.purchaseOrders.length} PO{o.purchaseOrders.length === 1 ? "" : "s"}
                      {o.buyer ? ` · ${o.buyer.name}` : ""}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 pl-6 text-[11px]">
                      <span className={`rounded-full px-2 py-px font-bold ${recs.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-ink-100 text-ink-500"}`}>
                        {recs.length > 0 ? `${recs.length} of ${total} stages scheduled` : "no TNA yet"}
                      </span>
                      {worst && TNA_STATUS_META[worst.status].needsAttention && (
                        <span className="rounded-full px-2 py-px font-bold" style={{ backgroundColor: TNA_STATUS_META[worst.status].soft, color: TNA_STATUS_META[worst.status].text }}>
                          {TNA_STATUS_META[worst.status].short}
                        </span>
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
          {ioNo && ordersForIo.length === 0 && !isLoading && <p className="text-sm text-ink-500">No orders under this IO{buyerId ? " for that buyer" : ""}.</p>}
          {!ioNo && !isLoading && <p className="text-sm text-ink-500">Pick an IO to see its orders.</p>}
        </div>
      </AccentCard>

      {selected ? (
        <StageScheduleEditor key={selected.id} order={selected} allRecords={overview} onDirtyChange={onDirtyChange} />
      ) : (
        <Card>
          <CardBody>
            <p className="py-6 text-center text-sm text-ink-500">Choose an order above to schedule its stages.</p>
          </CardBody>
        </Card>
      )}

      <p className="text-center text-xs text-ink-400">
        TNA only watches - it never blocks data entry or “Move Forward”. Orders without a TNA work exactly as before.{" "}
        <Link href="/admin/TNA" className="font-semibold text-brand hover:underline">
          See everything on the TNA View →
        </Link>
      </p>
    </div>
  );
}
