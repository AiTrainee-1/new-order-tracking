"use client";

import type { ReactNode } from "react";
import type { LotFlow, LotSizeCell } from "@/lib/chain";
import type { UnitType } from "@/lib/types";

/** Small presentational pieces of the StageLedger grid and draft rows. */

export function LotAvailableHint({ flow, unit }: { flow: LotFlow | null; unit: UnitType }) {
  if (!flow) return null;
  if (flow.available <= 0) {
    return <p className="mt-1 text-[11px] text-ink-400">No quantity carried forward for this lot yet - the previous section hasn&apos;t recorded what it received.</p>;
  }
  const recorded = flow.qtyIn > 0 ? flow.qtyIn : flow.qtyOut;
  const exhausted = flow.remainingAvailable <= 0;
  return (
    <p className="mt-1 text-[11px] leading-snug">
      <span className="text-ink-500">Received from previous section </span>
      <b className="tabular-nums text-ink-800">{flow.available.toLocaleString()} {unit}</b>
      {recorded > 0 && (
        <>
          <span className="text-ink-500"> · already recorded here </span>
          <b className="tabular-nums text-ink-800">{recorded.toLocaleString()} {unit}</b>
        </>
      )}
      <span className="text-ink-500"> · </span>
      <b className={`tabular-nums ${exhausted ? "text-status-good" : "text-amber-700"}`}>
        {exhausted ? "fully accounted for" : `${flow.remainingAvailable.toLocaleString()} ${unit} still available`}
      </b>
    </p>
  );
}

export function CellAvailableHint({ cell, unit }: { cell: LotSizeCell | null; unit: UnitType }) {
  if (!cell) return <p className="mt-1 text-[11px] text-ink-400">Nothing carried forward for this lot and size yet.</p>;
  const done = cell.qtyOut + cell.qtyRejected;
  const remaining = Math.max(cell.available - done, 0);
  return (
    <p className="mt-1 text-[11px] leading-snug">
      <span className="text-ink-500">Available </span>
      <b className="tabular-nums text-ink-800">{cell.available.toLocaleString()} {unit}</b>
      {done > 0 && (
        <>
          <span className="text-ink-500"> · sent </span>
          <b className="tabular-nums text-ink-800">{done.toLocaleString()}</b>
        </>
      )}
      <span className="text-ink-500"> · </span>
      <b className={`tabular-nums ${remaining > 0 ? "text-amber-700" : "text-status-good"}`}>{remaining > 0 ? `${remaining.toLocaleString()} ${unit} can be sent` : "fully sent"}</b>
    </p>
  );
}

export function GridInput({
  value,
  onChange,
  invalid = false,
  max,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  max?: number;
  hint?: ReactNode;
}) {
  return (
    <td className="px-3 py-1.5 text-right">
      {hint && <div className="mb-0.5 text-[10px] text-ink-400">{hint}</div>}
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-24 rounded-lg border px-2 py-1 text-right text-sm outline-none focus:border-brand ${invalid ? "border-status-bad bg-red-50" : "border-ink-200"}`}
      />
    </td>
  );
}

export function MiniStat({ label, value, unit, tone }: { label: string; value: number; unit: UnitType; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-status-good" : tone === "bad" ? "text-status-bad" : tone === "warn" ? "text-amber-600" : "text-ink-900";
  return (
    <div>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
        <span className="ml-0.5 text-[9px] font-medium text-ink-400">{unit}</span>
      </p>
    </div>
  );
}
