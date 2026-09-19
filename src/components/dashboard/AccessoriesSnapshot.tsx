"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCESSORY_STAGE_META as STAGES, type AccessoryFleetStats } from "@/lib/accessories";
import { orderTrackingBasePath } from "@/lib/routing";
import { AccentCard, SectionTitle } from "@/components/ui/SectionCard";
import { CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * The dashboard's window onto the Accessories module: how many accessories
 * are being tracked, across how many orders, and how far along they are.
 * Counts rather than quantities - accessories are bought in PCS, KG, CONE,
 * GROSS and more, so a summed quantity would mean nothing.
 */
export function AccessoriesSnapshot({
  stats,
  status,
  orderCount,
}: {
  stats: AccessoryFleetStats | null;
  status: "loading" | "error" | "ready";
  /** Orders in production - the "of N" next to the orders-with-accessories count. */
  orderCount: number;
}) {
  const basePath = orderTrackingBasePath(usePathname());

  return (
    <AccentCard tone="amber" className="flex flex-col">
      <CardHeader title={<SectionTitle icon="🧷" tone="amber">Accessories</SectionTitle>} subtitle="Across orders in production." />
      <div className="flex flex-1 flex-col gap-4 px-6 py-5">
        {status === "loading" && <p className="py-6 text-center text-sm text-ink-400">Loading accessories…</p>}
        {status === "error" && <p className="py-6 text-center text-sm text-status-bad">Couldn&apos;t load accessories.</p>}
        {status === "ready" && stats && stats.total === 0 && (
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">No accessories tracked on any order yet.</p>
        )}

        {status === "ready" && stats && stats.total > 0 && (
          <>
            <div className="text-center">
              <p className="text-4xl font-extrabold leading-none tracking-tight text-ink-900 tabular-nums">{stats.total.toLocaleString()}</p>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">accessories tracked</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="rounded-xl border border-white/80 bg-white/70 px-2 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Orders</p>
                <p className="text-xl font-bold tabular-nums text-ink-900">
                  {stats.orders}
                  <span className="text-[11px] font-semibold text-ink-400"> / {orderCount}</span>
                </p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/70 px-2 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Size wise</p>
                <p className="text-xl font-bold tabular-nums text-ink-900">{stats.sizeWise}</p>
              </div>
            </div>

            <div>
              <div
                role="img"
                aria-label={`Accessories by stage: ${STAGES.map((s) => `${stats.byStage[s.key]} ${s.label.toLowerCase()}`).join(", ")}`}
                className="mb-2.5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-ink-100 p-0.5"
              >
                {STAGES.filter((s) => stats.byStage[s.key] > 0).map((s) => (
                  <div key={s.key} title={`${s.label}: ${stats.byStage[s.key]}`} className="h-full min-w-1 rounded-full" style={{ flexGrow: stats.byStage[s.key], flexBasis: 0, backgroundColor: s.color }} />
                ))}
              </div>
              <ul className="space-y-1.5">
                {STAGES.map((s) => (
                  <li key={s.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-semibold text-ink-600">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-bold tabular-nums text-ink-900">{stats.byStage[s.key]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <Link href={`${basePath}/accessories`} className="mt-auto block">
          <Button variant="secondary" size="sm" className="w-full">
            Open Accessories →
          </Button>
        </Link>
      </div>
    </AccentCard>
  );
}
