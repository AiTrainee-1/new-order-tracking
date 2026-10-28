"use client";

import { Fragment, useMemo } from "react";
import type { StageProgress } from "@/lib/progress";
import type { ChainStage } from "@/lib/chain";
import type { AccessoryFlow } from "@/lib/accessories";
import { AccessorySizeBreakdownRow, SizeBreakdownChips } from "@/components/accessories/AccessorySizeBreakdown";
import { stageQtyLabels } from "@/lib/stageLabels";
import { formatDisplayDate } from "@/lib/workflow";
import { Badge } from "@/components/ui/Badge";
import type { PublicAppUser } from "@/lib/types";

/**
 * The read-only blocks StageDetailPanel is built from - the section's
 * summary, the accessory position table, the bit-count side of Bit Cutting,
 * contributors and contact tiles. Split from StageDetailPanel.
 */

/**
 * The headline numbers for a section, in the order someone actually asks
 * them: what came in, what went out, what's left, what was lost.
 *
 * The stacked bar underneath is the point of this block - it puts Output,
 * Rejected and Balance on the same scale as Input, so "did this section pass
 * its quantity through cleanly?" is answered by looking, not by subtracting
 * two numbers in your head.
 */
export function SectionSummary({ cs, stage, cumulativeLoss, nameOf }: { cs: ChainStage; stage: StageProgress; cumulativeLoss: number | null; nameOf: (id: string) => string }) {
  const unit = cs.unit;
  const labels = stageQtyLabels(cs.stage.key);
  const { input, output, rejected, balance } = cs;

  // Scale against whichever is larger so an over-producing stage (output above
  // input) still renders inside the bar instead of overflowing it.
  const denom = Math.max(input, output + rejected, 1);
  const pct = (n: number) => Math.max(0, Math.min(100, (n / denom) * 100));
  const outputPct = pct(output);
  const rejectedPct = pct(rejected);
  const balancePct = Math.max(0, 100 - outputPct - rejectedPct);

  const yieldPct = input > 0 ? Math.round((output / input) * 1000) / 10 : null;

  // Variation against the previous section: what it handed over vs what this
  // one actually counted in. Only meaningful when both figures exist.
  const variation = cs.recordedIn > 0 && cs.inherited > 0 ? cs.recordedIn - cs.inherited : null;

  // While a section is open the outstanding figure is work still owed; once
  // it's closed the same number is a shortage that will never arrive.
  const closed = stage.isCompleted;

  return (
    <div className="space-y-3 rounded-2xl border border-white/70 bg-white/70 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label={labels.in} value={input} unit={unit} hint={inputHint(cs)} />
        <SummaryTile label={labels.out} value={output} unit={unit} tone="good" hint="passed to next section" />
        <SummaryTile
          label={closed ? "Shortage" : labels.balance}
          value={balance}
          unit={unit}
          tone={balance > 0 ? (closed ? "bad" : "warn") : "good"}
          hint={closed ? "never arrived" : "still owed here"}
        />
        <SummaryTile label={labels.rejected} value={rejected} unit={unit} tone={rejected > 0 ? "bad" : "neutral"} hint="removed from the flow" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wide text-ink-500">Input → Output comparison</span>
          {yieldPct !== null && <span className="font-semibold tabular-nums text-ink-700">{yieldPct}% of input moved on</span>}
        </div>

        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-ink-100" role="presentation">
          {outputPct > 0 && <div className="h-full bg-status-good" style={{ width: `${outputPct}%` }} />}
          {rejectedPct > 0 && <div className="h-full bg-status-rejected" style={{ width: `${rejectedPct}%` }} />}
          {balancePct > 0 && <div className="h-full bg-status-warn" style={{ width: `${balancePct}%` }} />}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-600">
          <BarKey className="bg-status-good" label={labels.out} value={output} unit={unit} />
          {rejected > 0 && <BarKey className="bg-status-rejected" label={labels.rejected} value={rejected} unit={unit} />}
          {balance > 0 && <BarKey className="bg-status-warn" label={closed ? "Shortage" : labels.balance} value={balance} unit={unit} />}
        </div>
      </div>

      {variation !== null && variation !== 0 && (
        <p className={`rounded-lg border px-3 py-2 text-xs ${variation < 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
          <b>Variation vs previous section:</b> {cs.inherited.toLocaleString()} {unit} was handed over, {cs.recordedIn.toLocaleString()} {unit} was counted in here -{" "}
          <b>
            {variation > 0 ? "+" : "−"}
            {Math.abs(variation).toLocaleString()} {unit}
          </b>
          {variation < 0 ? " short on arrival." : " more than expected."} Both figures are kept as recorded.
        </p>
      )}

      {cumulativeLoss !== null && cumulativeLoss > 0 && (
        <p className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-800">
          <b>Cumulative loss</b> across every lot up to this section:{" "}
          <b>
            {cumulativeLoss.toLocaleString()} {unit}
          </b>
        </p>
      )}

      <Contributors cs={cs} stage={stage} nameOf={nameOf} />
    </div>
  );
}

/** Checkerboard cell shading, matching OutputView's Stage/Size Matrix and
 *  AccessoriesTrackingView's own tables - kept as its own copy per this
 *  codebase's existing precedent (each stage-matrix-style view defines it
 *  locally rather than sharing one utility). */
function accPosCellShade(rowIdx: number, colIdx: number): string {
  return (rowIdx + colIdx) % 2 === 0 ? "bg-white" : "bg-slate-50";
}
const accPosCellBase = "border border-ink-200 px-3 py-2.5 text-sm";
const accPosCellNum = `${accPosCellBase} text-right font-mono tabular-nums`;

/** The Accessories stage's real data - Required/Purchased/Inward/Dispatched
 *  per accessory, plus every entry against it. Renders in place of the
 *  generic (and here meaningless) Size-wise Breakdown - see the module
 *  comment above `isAccessoriesStage` in StageDetailPanel. Styled as a dark-
 *  header checkerboard grid (not the plain `Table` component) so it reads
 *  clearly against the busy panel around it. */
export function AccessoryPositionSection({ flows }: { flows: AccessoryFlow[] }) {
  const entries = useMemo(
    () =>
      flows
        .flatMap((f) => f.entries.map((e) => ({ entry: e, name: f.requirement.name, unit: f.requirement.unit })))
        .sort((a, b) => b.entry.entryDate.localeCompare(a.entry.entryDate) || b.entry.createdAt.localeCompare(a.entry.createdAt)),
    [flows],
  );

  return (
    <>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Accessory Position</h4>
        {flows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 bg-white/60 px-3 py-6 text-center text-sm text-ink-400">No accessories required for this order yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-200 shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-ink-900 text-[11px] uppercase tracking-wide text-white">
                  {["Accessory", "Unit", "Required", "Purchased", "Inward", "Dispatched", "Balance", "Status"].map((h) => (
                    <th key={h} className="border border-ink-800 px-3 py-2.5 text-right font-semibold first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flows.map((f, rowIdx) => {
                  const balance = f.balanceToPurchase || f.balanceToInward || f.balanceToDispatch;
                  const started = f.totals.purchased + f.totals.inward + f.totals.dispatched > 0;
                  const tone = f.isComplete ? "good" : started ? "warn" : "neutral";
                  const label = f.isComplete ? "Complete" : started ? "Partial" : "Pending";
                  return (
                    <Fragment key={f.requirement.id}>
                      <tr>
                        <td className={`${accPosCellBase} font-semibold text-ink-900 ${accPosCellShade(rowIdx, 0)}`}>{f.requirement.name}</td>
                        <td className={`${accPosCellBase} text-ink-500 ${accPosCellShade(rowIdx, 1)}`}>{f.requirement.unit}</td>
                        <td className={`${accPosCellNum} ${accPosCellShade(rowIdx, 2)}`}>{f.totals.required.toLocaleString()}</td>
                        <td className={`${accPosCellNum} ${accPosCellShade(rowIdx, 3)}`}>{f.totals.purchased.toLocaleString()}</td>
                        <td className={`${accPosCellNum} ${accPosCellShade(rowIdx, 4)}`}>{f.totals.inward.toLocaleString()}</td>
                        <td className={`${accPosCellNum} font-semibold text-status-good ${accPosCellShade(rowIdx, 5)}`}>{f.totals.dispatched.toLocaleString()}</td>
                        <td className={`${accPosCellNum} font-semibold ${balance > 0 ? "text-amber-600" : "text-status-good"} ${accPosCellShade(rowIdx, 6)}`}>{balance.toLocaleString()}</td>
                        <td className={`${accPosCellBase} text-right ${accPosCellShade(rowIdx, 7)}`}>
                          <Badge tone={tone}>{label}</Badge>
                        </td>
                      </tr>
                      <AccessorySizeBreakdownRow flow={f} unit={f.requirement.unit} colSpan={8} />
                    </Fragment>
                  );
                })}
              </tbody>
              {flows.length > 1 && (
                <tfoot>
                  <tr className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 font-bold">
                    <td className={`${accPosCellBase} border-l-4 border-l-blue-600 text-blue-900`} colSpan={2}>
                      Total
                    </td>
                    <td className={`${accPosCellNum} text-blue-900`}>{sumByFlow(flows, (f) => f.totals.required)}</td>
                    <td className={`${accPosCellNum} text-blue-900`}>{sumByFlow(flows, (f) => f.totals.purchased)}</td>
                    <td className={`${accPosCellNum} text-blue-900`}>{sumByFlow(flows, (f) => f.totals.inward)}</td>
                    <td className={`${accPosCellNum} text-emerald-700`}>{sumByFlow(flows, (f) => f.totals.dispatched)}</td>
                    <td className={accPosCellNum} />
                    <td className={accPosCellBase} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Accessory Entries</h4>
          <div className="overflow-x-auto rounded-xl border border-ink-200 shadow-sm">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  {["Date", "Accessory", "Type", "Qty", "Vendor / Sent To", "DC Name"].map((h) => (
                    <th key={h} className="border-b-2 border-ink-200 px-3 py-2.5 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {entries.map(({ entry, name, unit }, rowIdx) => (
                  <tr key={entry.id} className={accPosCellShade(rowIdx, 0)}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-500">{formatDisplayDate(entry.entryDate)}</td>
                    <td className="px-3 py-2.5 font-semibold text-ink-900">
                      {name}
                      <SizeBreakdownChips breakdown={entry.sizeBreakdown} unit={unit} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={entry.entryType === "dispatch" ? "good" : entry.entryType === "inward" ? "info" : "warn"}>{entry.entryType}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {entry.qty.toLocaleString()} {unit}
                    </td>
                    <td className="px-3 py-2.5 text-ink-600">{(entry.entryType === "dispatch" ? entry.sentTo : entry.vendor) ?? "-"}</td>
                    <td className="px-3 py-2.5 text-ink-600">{entry.docNo ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function sumByFlow(flows: AccessoryFlow[], pick: (f: AccessoryFlow) => number): string {
  return flows.reduce((total, f) => total + pick(f), 0).toLocaleString();
}

function inputHint(cs: ChainStage): string {
  if (cs.recordedIn > 0) return "counted in here";
  if (cs.inherited > 0) return "carried from previous";
  return "order baseline";
}

/** Bit Cutting's count side - the stage's main figures above are its Bit KG,
 *  so the count (and the pieces from before it was KG-wise) get their own row. */
export function BitCountSummary({ cs }: { cs: ChainStage }) {
  const earlier = cs.pcs?.txns ?? [];
  const sum = (rows: { qty: number }[]) => rows.reduce((t, r) => t + r.qty, 0);
  const sent = sum(cs.txns.filter((t) => t.txnType === "send").map((t) => ({ qty: t.qtyCount }))) + sum(earlier.filter((t) => t.txnType === "send").map((t) => ({ qty: t.qtyIn })));
  const received = sum(cs.txns.filter((t) => t.txnType === "receive").map((t) => ({ qty: t.qtyCount }))) + sum(earlier.filter((t) => t.txnType === "receive").map((t) => ({ qty: t.qtyOut })));
  if (sent + received === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      <SummaryTile label="Bit Count sent" value={sent} unit="Nos" />
      <SummaryTile label="Bit Count received" value={received} unit="Nos" tone="good" />
      <SummaryTile label="Bit Count with vendor" value={Math.max(sent - received, 0)} unit="Nos" tone={sent - received > 0 ? "warn" : "good"} />
    </div>
  );
}

export function SummaryTile({ label, value, unit, tone = "neutral", hint }: { label: string; value: number; unit: string; tone?: "good" | "bad" | "warn" | "neutral"; hint?: string }) {
  const color = tone === "good" ? "text-status-good" : tone === "bad" ? "text-status-bad" : tone === "warn" ? "text-amber-600" : "text-ink-900";
  return (
    <div className="rounded-xl border border-white/80 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-[10px] font-medium text-ink-400">{unit}</span>
      </p>
      {hint && <p className="text-[10px] leading-tight text-ink-400">{hint}</p>}
    </div>
  );
}

function BarKey({ className, label, value, unit }: { className: string; label: string; value: number; unit: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}{" "}
      <b className="tabular-nums text-ink-800">
        {value.toLocaleString()} {unit}
      </b>
    </span>
  );
}

/**
 * Who actually entered this section's figures, and how much each of them
 * accounted for - the question "who do I ask about this number?" answered
 * without scrolling the ledger.
 *
 * Prefers the production ledger, since that's where the quantities live, and
 * falls back to the gating entries for sections that don't write one (the
 * procurement and confirmation stages).
 */
function Contributors({ cs, stage, nameOf }: { cs: ChainStage; stage: StageProgress; nameOf: (id: string) => string }) {
  const people = useMemo(() => {
    const map = new Map<string, { id: string; entries: number; qty: number; last: string | null }>();

    const bump = (id: string, qty: number, date: string) => {
      const row = map.get(id) ?? { id, entries: 0, qty: 0, last: null };
      row.entries += 1;
      row.qty += qty;
      row.last = !row.last || date > row.last ? date : row.last;
      map.set(id, row);
    };

    const allTxns = [...cs.txns, ...(cs.pcs?.txns ?? [])];
    if (allTxns.length > 0) {
      // A row in the OTHER unit (a dual-unit stage's PCS rows) still counts as
      // an entry, but not toward the quantity shown, which is printed in this
      // stage's own unit - adding pieces to kilograms would be wrong.
      for (const t of allTxns) bump(t.enteredBy, t.unit === cs.unit ? t.qtyOut || t.qtyIn : 0, t.entryDate);
    } else {
      for (const e of stage.entries) bump(e.enteredBy, e.qtyForwarded, e.entryDate);
    }

    return Array.from(map.values()).sort((a, b) => b.entries - a.entries);
  }, [cs.txns, cs.pcs, cs.unit, stage.entries]);

  if (people.length === 0) return null;

  return (
    <div className="border-t border-ink-100 pt-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Entered by</p>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/80 bg-white px-2.5 py-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-bold text-white">{nameOf(p.id).charAt(0).toUpperCase()}</span>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-ink-900">{nameOf(p.id)}</p>
              <p className="text-[10px] text-ink-500">
                {p.entries} {p.entries === 1 ? "entry" : "entries"}
                {p.qty > 0 ? ` · ${p.qty.toLocaleString()} ${cs.unit}` : ""}
                {p.last ? ` · last ${formatDisplayDate(p.last)}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContactTile({ label, people, emptyLabel }: { label: string; people: PublicAppUser[]; emptyLabel: string }) {
  const unique = Array.from(new Map(people.map((p) => [p.id, p])).values());
  return (
    <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      {unique.length === 0 ? (
        <p className="mt-0.5 text-sm text-ink-400">{emptyLabel}</p>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          {unique.map((p) => (
            <div key={p.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-ink-900">{p.name}</span>
              {p.phone ? (
                <a href={`tel:${p.phone}`} className="text-xs font-medium text-brand hover:underline">
                  {p.phone}
                </a>
              ) : (
                <span className="text-xs text-ink-400">no phone on file</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
