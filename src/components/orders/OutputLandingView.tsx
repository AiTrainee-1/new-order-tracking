"use client";

import { useMemo, useState } from "react";
import { useAllOrderProgress } from "@/hooks/useOrders";
import { Card, CardBody } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { Input } from "@/components/ui/FormControls";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { matchesBuyer } from "@/lib/buyers";
import { OrderCard } from "@/components/dashboard/OrderCard";

/**
 * Production Output & Reports - order picker, shared verbatim between
 * /admin/output and /md/output (same "one component, two thin page
 * wrappers" pattern OutputView.tsx itself already uses for the per-order
 * report). Output only ever existed at /output/[orderId] - this is the
 * landing page that lets someone find that order without already knowing
 * its id, the same way Dashboard's order grid does, just linking into the
 * Output report instead of the order detail page.
 */
export function OutputLandingView() {
  const { bundles, isLoading, isError } = useAllOrderProgress();
  const [search, setSearch] = useState("");
  const [buyerId, setBuyerId] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bundles.filter(
      (b) =>
        matchesBuyer(b.order, buyerId) &&
        (!q || b.order.ioNo.toLowerCase().includes(q) || b.order.style.toLowerCase().includes(q) || (b.order.color?.toLowerCase().includes(q) ?? false) || (b.order.buyer?.name.toLowerCase().includes(q) ?? false)),
    );
  }, [bundles, search, buyerId]);

  if (isLoading) return <Loader full label="Loading orders…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load orders. Check the database connection.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Production Output & Reports</h1>
        <p className="text-sm text-ink-500">Pick an order to see its full output report - KPIs, Stage Matrix, Size Matrix, Accessories, and every chart.</p>
      </div>

      <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-[minmax(0,1fr)_14rem]">
        <Input placeholder="Search by IO number, style, buyer, or color…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <BuyerFilter value={buyerId} onChange={setBuyerId} />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-sm text-ink-400">
              {bundles.length === 0 ? "No orders yet." : "No orders match this search."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((bundle) => (
            <OrderCard key={bundle.order.id} bundle={bundle} linkTo={(basePath, orderId) => `${basePath}/output/${orderId}`} />
          ))}
        </div>
      )}
    </div>
  );
}
