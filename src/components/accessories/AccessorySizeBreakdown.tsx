"use client";

import { useState } from "react";
import { buildAccessorySizeTotals, type AccessoryFlow } from "@/lib/accessories";
import { Input } from "@/components/ui/FormControls";

/**
 * Size-wise Required/Purchased/Inward/Dispatched for one accessory, shown as
 * a collapsed-by-default expandable row - used everywhere an accessory's
 * totals already render (the data-entry form, the fleet Accessories page,
 * the per-order Output report, the Order Detail stage panel) so a size-wise
 * accessory's breakdown is one click away in all of them, without cluttering
 * the main row for the (still common) non-size-wise accessories that have
 * nothing to expand.
 */
export function AccessorySizeBreakdownRow({
  flow,
  unit,
  colSpan,
  defaultOpen = false,
}: {
  flow: AccessoryFlow;
  unit: string;
  colSpan: number;
  /** Open on first render - for the single-order detail page, where the
   *  breakdown is the point; the dense multi-order views leave it collapsed. */
  defaultOpen?: boolean;
}) {
  const sizeTotals = buildAccessorySizeTotals(flow);
  const [open, setOpen] = useState(defaultOpen);
  if (!sizeTotals) return null;

  return (
    <tr>
      <td colSpan={colSpan} className="border border-ink-200 bg-slate-50/70 px-3 py-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-brand hover:underline">
          {open ? "▾" : "▸"} Size-wise breakdown ({sizeTotals.length} size{sizeTotals.length === 1 ? "" : "s"})
        </button>
        {open && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-ink-200 bg-white">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
                  <th className="px-2.5 py-1.5 text-left font-semibold">Size</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Required</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Purchased</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Inward</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Dispatched</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {sizeTotals.map((s) => (
                  <tr key={s.sizeCode} className="bg-white">
                    <td className="px-2.5 py-1.5 font-semibold text-ink-900">{s.sizeCode}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {s.required.toLocaleString()} {unit}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{s.purchased.toLocaleString()}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{s.inward.toLocaleString()}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-status-good">{s.dispatched.toLocaleString()}</td>
                    <td className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${s.balance > 0 ? "text-amber-600" : "text-status-good"}`}>{s.balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * The per-size data-entry table used by every stage of the accessories flow -
 * Required (reference column = the order's own quantity for that size) and
 * Purchase/Inward/Dispatch (reference column = what was required for that
 * size, plus what this stage has already recorded against it). One row per
 * size, a quantity box on each, and a running total underneath.
 */
export function SizeQtyGrid({
  sizes,
  values,
  onChange,
  unit,
  referenceLabel,
  reference,
  soFarLabel,
  soFar,
}: {
  sizes: string[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  unit: string;
  referenceLabel: string;
  reference: Record<string, number>;
  soFarLabel?: string;
  soFar?: Record<string, number>;
}) {
  const total = sizes.reduce((sum, code) => sum + (Number(values[code]) || 0), 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
      <table className="w-full min-w-[320px] text-xs">
        <thead>
          <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
            <th className="px-2.5 py-1.5 text-left font-semibold">Size</th>
            <th className="px-2.5 py-1.5 text-right font-semibold">{referenceLabel}</th>
            {soFar && <th className="px-2.5 py-1.5 text-right font-semibold">{soFarLabel}</th>}
            <th className="w-32 px-2.5 py-1.5 text-right font-semibold">Qty ({unit})</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {sizes.map((code) => (
            <tr key={code}>
              <td className="px-2.5 py-1 font-semibold text-ink-900">{code}</td>
              <td className="px-2.5 py-1 text-right tabular-nums text-ink-500">{(reference[code] ?? 0).toLocaleString()}</td>
              {soFar && <td className="px-2.5 py-1 text-right tabular-nums text-ink-500">{(soFar[code] ?? 0).toLocaleString()}</td>}
              <td className="px-2.5 py-1">
                <Input
                  aria-label={`${code} quantity`}
                  type="number"
                  min={0}
                  value={values[code] ?? ""}
                  onChange={(e) => onChange({ ...values, [code]: e.target.value })}
                  className="text-right"
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ink-50 font-bold text-ink-800">
            <td className="px-2.5 py-1.5">Total</td>
            <td className="px-2.5 py-1.5 text-right tabular-nums">{sizes.reduce((sum, code) => sum + (reference[code] ?? 0), 0).toLocaleString()}</td>
            {soFar && <td className="px-2.5 py-1.5 text-right tabular-nums">{sizes.reduce((sum, code) => sum + (soFar[code] ?? 0), 0).toLocaleString()}</td>}
            <td className="px-2.5 py-1.5 text-right tabular-nums">
              {total.toLocaleString()} {unit}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Compact inline chips ("S: 10 · M: 20 · L: 15") for a size-wise entry or
 *  requirement row where a full expandable table would be too heavy - the
 *  data-entry ledger rows within AccessoriesForm. */
export function SizeBreakdownChips({ breakdown, unit }: { breakdown: { sizeCode: string; quantity: number }[] | null; unit: string }) {
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <p className="mt-0.5 text-[10px] leading-snug text-ink-500">
      {breakdown.map((s, i) => (
        <span key={s.sizeCode}>
          {i > 0 && " · "}
          {s.sizeCode}: <b className="tabular-nums">{s.quantity.toLocaleString()}</b>
        </span>
      ))}{" "}
      {unit}
    </p>
  );
}
