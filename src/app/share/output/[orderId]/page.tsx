"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChainStage, ProductionChain } from "@/lib/chain";
import { formatDisplayDate } from "@/lib/workflow";
import { spatialBackground } from "@/lib/theme";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { BrandMark } from "@/components/ui/BrandMark";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import {
  buildOutputDashboard,
  FabricTrendCard,
  GarmentTrendCard,
  LotTraceabilityCard,
  OrderFunnelCard,
  OutputDynamicDashboardCard,
  OutputKpiCard,
  SizeMatrixCard,
  SizeOutputChartCard,
  StageMatrixCard,
} from "@/components/output/outputShared";

/**
 * The page a scanned QR code opens (see ShareQrModal on the real Output &
 * Reports page). Public and unauthenticated on purpose - mounted outside
 * every role-gated layout (see proxy.ts's PUBLIC_PREFIXES), reading from
 * /api/public-order-output instead of an authenticated session.
 *
 * The dashboard sections are the same ones OutputView draws (see
 * outputShared) - but this page owns its own data path: it never touches the
 * authenticated hooks, only the public endpoint, whose chain carries no
 * per-entry attribution (entered-by, notes, DC/doc numbers), and nothing
 * here reads any. View-only: no download buttons, no back button, no nav
 * chrome, nothing that writes anything.
 */

interface PublicOrder {
  id: string;
  ioNo: string;
  style: string;
  description: string | null;
  color: string | null;
  fabric: string | null;
  totalQty: number;
  deliveryDate: string | null;
  imageUrl: string | null;
}

async function fetchSharedOutput(orderId: string): Promise<{ order: PublicOrder; chain: Omit<ProductionChain, "byKey"> }> {
  const res = await fetch(`/api/public-order-output?orderId=${encodeURIComponent(orderId)}`);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "Couldn't load this dashboard.");
  }
  return res.json();
}

export default function SharedOutputPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public_order_output", orderId],
    queryFn: () => fetchSharedOutput(orderId),
    enabled: !!orderId,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen" style={spatialBackground}>
        <Loader full label="Loading production dashboard…" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center" style={spatialBackground}>
        <div>
          <p className="text-2xl">🔒</p>
          <p className="mt-2 text-sm font-semibold text-ink-700">{error instanceof Error ? error.message : "Couldn't load this dashboard."}</p>
        </div>
      </div>
    );
  }

  const { order } = data;
  // Rebuild the real ProductionChain shape - byKey is a Map, which doesn't
  // survive JSON, so it's reconstructed the same one-liner way every other
  // consumer of this shape already does.
  const chain: ProductionChain = {
    ...data.chain,
    byKey: new Map(data.chain.stages.map((s: ChainStage) => [s.stage.key, s])),
  };

  const dashboard = buildOutputDashboard(chain);

  return (
    <div className="min-h-screen pb-10" style={spatialBackground}>
      <div className="space-y-5 p-4 sm:space-y-6 md:p-8">
        {/* --------------------------- Header card --------------------------- */}
        <div className="flex items-center gap-2 pt-2">
          <BrandMark size={22} />
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">UK Textiles · Shared view</span>
        </div>

        <Card>
          <CardBody className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/70">
              {order.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={order.imageUrl} alt={order.style} className="h-full w-full object-cover" />
              ) : (
                <GarmentPlaceholder className="h-9 w-9 text-ink-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-lg font-bold text-ink-900">{order.style}</h1>
                <Badge tone="neutral">IO {order.ioNo}</Badge>
                {order.color && <Badge tone="neutral">{order.color}</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-500">
                {order.totalQty.toLocaleString()} PCS · Delivery {formatDisplayDate(order.deliveryDate)}
              </p>
            </div>
          </CardBody>
        </Card>

        <OutputKpiCard dashboard={dashboard} />
        <OutputDynamicDashboardCard dashboard={dashboard} variant="share" />
        <StageMatrixCard dashboard={dashboard} variant="share" />
        <SizeMatrixCard dashboard={dashboard} variant="share" />
        <FabricTrendCard dashboard={dashboard} variant="share" />
        <GarmentTrendCard dashboard={dashboard} variant="share" />
        <OrderFunnelCard dashboard={dashboard} />
        <SizeOutputChartCard dashboard={dashboard} variant="share" />
        <LotTraceabilityCard dashboard={dashboard} variant="share" />

        <p className="pb-2 text-center text-xs text-ink-400">
          Report generated {formatDisplayDate(new Date().toISOString().slice(0, 10))} · every figure above is derived from the recorded entries. View-only shared link.
        </p>
      </div>
    </div>
  );
}
