"use client";

import { useStageChain } from "@/hooks/useProductionChain";
import { buildRequirementFlow } from "@/lib/chain";
import { Loader } from "@/components/ui/Loader";
import { Badge } from "@/components/ui/Badge";
import { MaterialLedger } from "./MaterialLedger";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "@/hooks/useStageEntryBuilder";
import { DirectionPanel, QtyBox, Section } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Raw Material Inward - Received Quantity: how much was actually received?
 *
 * One responsibility only: for each material, how much physically arrived
 * against the planned quantity Purchase Order to Suppliers set. That planned
 * figure is carried in, not re-typed, so this screen is a single comparison -
 *
 *     Planned Quantity → Received Quantity
 *
 * - that makes full / partial / pending obvious at a glance, per material and
 * overall. There is only one "received" concept here, not two - the number
 * entered on this screen IS the inward figure. After this stage is confirmed,
 * the order forwards to Knitting exactly as it always has.
 */
export function MaterialInwardForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { cs, requirements, materialEntries, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);

  if (isLoading) return <Loader label="Loading inward position…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn&apos;t load inward data.</p>;

  const flows = requirements.map((r) => buildRequirementFlow(r, materialEntries));
  const totals = flows.reduce((acc, f) => ({ planned: acc.planned + f.plannedQty, received: acc.received + f.receivedQty }), { planned: 0, received: 0 });
  const pending = Math.max(totals.planned - totals.received, 0);

  async function forward(isFinal: boolean) {
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qtyReceived: totals.planned,
        qtyCompletedToday: Math.max(totals.received - alreadyLogged, 0),
        qtyForwarded: Math.max(totals.received - alreadyLogged, 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** Inward rows are written as they're entered above, so this records that the
   * store progressed without releasing anything to Knitting. */
  async function savePlan() {
    await submitMovement({
      base: { qtyReceived: totals.planned, qtyForwarded: 0, notes: "Plan saved - nothing forwarded." },
      action: "plan",
    });
    onForwarded();
  }

  return (
    <div className="space-y-6">
      {props.showDetails && (
        <>
          <p className="text-xs leading-relaxed text-ink-500">
            Received Quantity - for each material, confirm how much was actually received against the planned quantity. Once this is
            complete, the order forwards on to Knitting as usual.
          </p>

          <Section title="Inward position">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <QtyBox label="Planned" value={totals.planned} unit="KG" />
              <QtyBox label="Received" value={totals.received} unit="KG" tone="good" />
              <QtyBox label="Balance" value={pending} unit="KG" tone={pending > 0 ? "warn" : "good"} />
            </div>
          </Section>

          {flows.length > 0 && (
            <Section title="Planned vs Received" subtitle="Every material, side by side - full, partial or pending at a glance.">
              <div className="overflow-x-auto rounded-xl border border-ink-100">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="px-3 py-2 text-left font-semibold">Material</th>
                      <th className="px-3 py-2 text-left font-semibold">Type</th>
                      <th className="px-3 py-2 text-right font-semibold">Planned</th>
                      <th className="px-3 py-2 text-right font-semibold">Received</th>
                      <th className="px-3 py-2 text-right font-semibold">Balance</th>
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {flows.map((f) => {
                      const balance = f.balance;
                      return (
                        <tr key={f.requirement.id} className="bg-white">
                          <td className="px-3 py-2 font-semibold text-ink-900">{f.requirement.name}</td>
                          <td className="px-3 py-2 capitalize text-ink-500">{f.requirement.category}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{f.plannedQty.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-status-good">{f.receivedQty.toLocaleString()}</td>
                          <td className={`px-3 py-2 text-right font-semibold tabular-nums ${balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                            {balance.toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={balance === 0 ? "good" : f.receivedQty > 0 ? "warn" : "neutral"}>
                              {balance === 0 ? "Full" : f.receivedQty > 0 ? "Partial" : "Pending"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-ink-50 text-xs font-bold text-ink-800">
                      <td className="px-3 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{totals.planned.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totals.received.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pending.toLocaleString()}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Section>
          )}
        </>
      )}

      {flows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
          No materials planned for this order yet.
        </p>
      ) : (
        // Green: material that has physically arrived - the first inbound
        // figure in the whole chain, hence the same colour every later
        // "received" panel uses.
        <DirectionPanel direction="in" step={1} title="Received Into Store" subtitle="What physically arrived against the planned quantity. Knitting draws from this.">
          <MaterialLedger
            orderId={order.id}
            poId={assignment.poId}
            sectionId={assignment.sectionId}
            flows={flows}
            categories={["yarn", "fabric"]}
            canEditRequirements={false}
            entryTypes={["inward"]}
            onSaved={onForwarded}
          />
        </DirectionPanel>
      )}

      <StageActions
        sectionLabel={assignment.section?.label ?? "Raw Material Inward"}
        unitType="KG"
        balance={pending}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}
