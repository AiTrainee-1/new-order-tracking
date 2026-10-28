"use client";

import type { ReactNode } from "react";
import { useOrderPurchaseOrders } from "@/hooks/useProductionChain";
import type { ChainStage } from "@/lib/chain";
import { stageQtyLabels } from "@/lib/stageLabels";
import { applyExtraPercent } from "@/lib/sizes";
import { getOrderProductionQty } from "@/lib/orderQty";
import type { AssignmentWithDetails, Order } from "@/lib/types";

/**
 * The read-only pieces every quantity-recording stage shows around its
 * ledger: the chain strip, the order-quantity banner, the lot/size/rework
 * roll-ups, and the panels the forms are laid out in. Split from
 * chainShared - which still re-exports all of it.
 */

// ---------------------------------------------------------------------------
// Chain strip - the same four numbers at the top of every stage
// ---------------------------------------------------------------------------

export function QtyBox({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: number;
  /** KG / PCS, or any other unit label ("Nos"). */
  unit?: string;
  tone?: "good" | "bad" | "warn" | "neutral";
  hint?: string;
}) {
  const color =
    tone === "bad" ? "text-status-bad" : tone === "good" ? "text-status-good" : tone === "warn" ? "text-amber-600" : "text-ink-900";
  return (
    <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
      {unit && <p className="text-[10px] font-medium text-ink-400">{unit}</p>}
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-ink-400">{hint}</p>}
    </div>
  );
}

/** Input → Output → Rejected → Balance. */
export function ChainStrip({ cs, inputHint }: { cs: ChainStage; inputHint?: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QtyBox
          label="Input"
          value={cs.input}
          unit={cs.unit}
          hint={inputHint ?? (cs.recordedIn > 0 ? "counted in here" : cs.inherited > 0 ? "from previous stage" : "order baseline")}
        />
        <QtyBox label="Output" value={cs.output} unit={cs.unit} tone="good" hint="sent on" />
        <QtyBox label="Rejected" value={cs.rejected} unit={cs.unit} tone={cs.rejected > 0 ? "bad" : "neutral"} />
        <QtyBox label="Balance" value={cs.balance} unit={cs.unit} tone={cs.balance > 0 ? "warn" : "good"} hint="still owed" />
      </div>
      {cs.hasMismatch && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The previous stage sent on <b>{cs.inherited.toLocaleString()} {cs.unit}</b> but{" "}
          <b>{cs.recordedIn.toLocaleString()} {cs.unit}</b> was counted in here - a difference of{" "}
          {Math.abs(cs.recordedIn - cs.inherited).toLocaleString()} {cs.unit}. Both figures are kept;
          reconcile before completing this stage.
        </p>
      )}
    </div>
  );
}

/** Buyer Order Quantity -> Excess % -> Extra Quantity -> Final Production Quantity. */
export function OrderQtyBanner({ order, assignment }: { order: Order; assignment: AssignmentWithDetails }) {
  const posQuery = useOrderPurchaseOrders(order.id);
  const po = assignment.po;

  const buyerQty = po ? po.quantity : order.totalQty;
  const productionQty = po ? applyExtraPercent(po.quantity, po.extraPercent) : getOrderProductionQty(posQuery.data ?? []) || buyerQty;
  const extraQty = productionQty - buyerQty;
  const extraPercent = buyerQty > 0 ? Math.round((extraQty / buyerQty) * 1000) / 10 : 0;

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/70 bg-white/70 p-2.5 sm:grid-cols-4">
      <QtyBox label="Buyer Order Quantity" value={buyerQty} unit="PCS" hint="reference / comparison only" />
      <QtyBox label="Extra %" value={extraPercent} hint="effective rate across every PO in this order" />
      <QtyBox label="Extra Quantity" value={extraQty} unit="PCS" hint="added on top of buyer order qty" />
      <QtyBox label="Final Production Quantity" value={productionQty} unit="PCS" tone="good" hint="what production actually runs against" />
    </div>
  );
}

/**
 * Where an order stands on quantity at one garment stage - the original
 * (buyer) quantity, what was added on top as excess, what was cut, and then what
 * has happened to those pieces: rejected (gone for good), in rework (owed back),
 * still to do.
 *
 * Rejection and rework are kept deliberately apart: a rejected piece comes OFF
 * the quantity every later stage can process, a rework piece stays on it until it
 * is solved.
 */
export function QuantityPosition({ orderId, cs, sizes }: { orderId: string; cs: ChainStage; sizes: { sizeCode: string; quantity: number }[] }) {
  const posQuery = useOrderPurchaseOrders(orderId);
  const pos = posQuery.data ?? [];
  const productionQty = sizes.reduce((t, s) => t + s.quantity, 0) || getOrderProductionQty(pos);
  const buyerQty = pos.reduce((t, p) => t + p.quantity, 0) || productionQty;
  const excessQty = Math.max(productionQty - buyerQty, 0);
  const cutQty = sumBy(cs.bySize, (s) => s.cutQty);
  const rejectedHere = cs.rejected;
  const rejectedEarlier = sumBy(cs.bySize, (s) => s.upstreamRejected);
  const reworkPending = sumBy(cs.reworkBySize, (r) => r.pending);
  const remaining = sumBy(cs.bySize, (s) => s.balance);

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Quantity position at this stage</p>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/70 bg-white/70 p-2.5 sm:grid-cols-4">
        <QtyBox label="Original order qty" value={buyerQty} unit="PCS" hint="buyer quantity" />
        <QtyBox label="Excess qty" value={excessQty} unit="PCS" hint="added on top" />
        <QtyBox label="Cut qty" value={cutQty} unit="PCS" hint="what was actually cut" />
        <QtyBox label="Rework pending" value={reworkPending} unit="PCS" tone={reworkPending > 0 ? "warn" : "neutral"} hint="owed back, still counts" />
        <QtyBox label="Rejected here" value={rejectedHere} unit="PCS" tone={rejectedHere > 0 ? "bad" : "neutral"} hint="gone for good" />
        <QtyBox label="Rejected earlier" value={rejectedEarlier} unit="PCS" tone={rejectedEarlier > 0 ? "bad" : "neutral"} hint="at earlier stages" />
        <QtyBox label="Line output" value={cs.output} unit="PCS" tone="good" hint="passed on" />
        <QtyBox label="Remaining" value={remaining} unit="PCS" tone={remaining > 0 ? "warn" : "good"} hint="still to do here" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lot-wise and size-wise roll-ups
// ---------------------------------------------------------------------------

export function LotSummaryTable({ cs }: { cs: ChainStage }) {
  const labels = stageQtyLabels(cs.stage.key);
  if (cs.byLot.length === 0) return null;
  const showRework = !!labels.rework && cs.byLot.some((l) => l.qtyRework > 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Lot</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.in}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.out}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.rejected}</th>
            {showRework && <th className="px-3 py-2 text-right font-semibold">{labels.rework}</th>}
            <th className="px-3 py-2 text-right font-semibold">{labels.balance}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cs.byLot.map((l) => (
            <tr key={l.lotId} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{l.lotNo}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.qtyIn.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{l.qtyOut.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-bad">{l.qtyRejected.toLocaleString()}</td>
              {showRework && <td className="px-3 py-2 text-right tabular-nums text-amber-600">{l.qtyRework.toLocaleString()}</td>}
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${l.balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                {l.balance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SizeSummaryTable({ cs }: { cs: ChainStage }) {
  const labels = stageQtyLabels(cs.stage.key);
  if (cs.bySize.length === 0) return null;
  const hasUpstream = cs.bySize.some((s) => s.upstreamRejected > 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Size</th>
            <th className="px-3 py-2 text-right font-semibold">PO Qty</th>
            {hasUpstream && <th className="px-3 py-2 text-right font-semibold">Rejected earlier</th>}
            <th className="px-3 py-2 text-right font-semibold">{labels.in}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.out}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.rejected}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.balance}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cs.bySize.map((s) => (
            <tr key={s.sizeCode} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{s.sizeCode}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-500">{s.poQty.toLocaleString()}</td>
              {hasUpstream && <td className="px-3 py-2 text-right tabular-nums text-status-bad">{s.upstreamRejected > 0 ? s.upstreamRejected.toLocaleString() : "-"}</td>}
              <td className="px-3 py-2 text-right tabular-nums">{s.qtyIn.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{s.qtyOut.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-bad">{s.qtyRejected.toLocaleString()}</td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${s.balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                {s.balance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ink-50 text-xs font-bold text-ink-800">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.poQty).toLocaleString()}</td>
            {hasUpstream && <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.upstreamRejected).toLocaleString()}</td>}
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyIn).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyOut).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyRejected).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.balance).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ReworkSummaryTable({ cs }: { cs: ChainStage }) {
  const rows = cs.reworkBySize.filter((r) => r.added > 0 || r.solved > 0);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Size</th>
            <th className="px-3 py-2 text-right font-semibold">Sent to Rework</th>
            <th className="px-3 py-2 text-right font-semibold">Solved</th>
            <th className="px-3 py-2 text-right font-semibold">Pending</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => (
            <tr key={r.sizeCode} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{r.sizeCode}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.added.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{r.solved.toLocaleString()}</td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.pending > 0 ? "text-amber-600" : "text-status-good"}`}>
                {r.pending.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ink-50 text-xs font-bold text-ink-800">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(rows, (r) => r.added).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(rows, (r) => r.solved).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(rows, (r) => r.pending).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

// ---------------------------------------------------------------------------
// Layout pieces shared by the stage forms
// ---------------------------------------------------------------------------

export function DirectionPanel({
  direction,
  step,
  title,
  subtitle,
  children,
}: {
  direction: "out" | "in" | "neutral";
  step?: number;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const skin =
    direction === "out"
      ? { frame: "border-sky-400 bg-sky-50/40", band: "bg-sky-100/80", chip: "bg-sky-600", text: "text-sky-900", arrow: "→" }
      : direction === "in"
        ? { frame: "border-emerald-500 bg-emerald-50/40", band: "bg-emerald-100/80", chip: "bg-emerald-600", text: "text-emerald-900", arrow: "←" }
        : { frame: "border-ink-300 bg-ink-50/60", band: "bg-ink-100/80", chip: "bg-ink-600", text: "text-ink-800", arrow: "✓" };

  return (
    <div className={`overflow-hidden rounded-2xl border-2 ${skin.frame}`}>
      <div className={`flex flex-wrap items-center gap-2.5 px-3 py-2.5 ${skin.band}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm ${skin.chip}`} aria-hidden>
          {skin.arrow}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold uppercase tracking-wide ${skin.text}`}>
            {step != null ? `Step ${step} · ` : ""}
            {title}
          </p>
          <p className="text-[11px] leading-snug text-ink-600">{subtitle}</p>
        </div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600">{title}</h4>
        {subtitle && <p className="text-[11px] leading-snug text-ink-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
