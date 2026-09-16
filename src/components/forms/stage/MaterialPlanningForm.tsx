"use client";

import { useStageChain } from "@/hooks/useProductionChain";
import { buildRequirementFlow } from "@/lib/chain";
import { Loader } from "@/components/ui/Loader";
import { MaterialLedger } from "./MaterialLedger";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "@/hooks/useStageEntryBuilder";
import { DirectionPanel } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Raw Material Planning - Required Plan: what quantity is required?
 *
 * One responsibility only: the yarn counts and fabric types this order needs
 * (add / rename / remove) and how many kilos of each. Nothing about purchasing
 * or receiving is entered here - Purchase Order to Suppliers reads this
 * required figure as its own input, and Raw Material Inward reads theirs in
 * turn, so the same "required 500" number is never re-typed downstream.
 *
 * Trims and accessories are deliberately absent: they were removed from this
 * stage as not part of the fabric chain.
 */
export function MaterialPlanningForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded } = props;
  const { cs, requirements, materialEntries, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);

  if (isLoading) return <Loader label="Loading the material plan…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn&apos;t load the material plan.</p>;

  const flows = requirements.map((r) => buildRequirementFlow(r, materialEntries));

  async function forward(isFinal: boolean) {
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qtyReceived: cs!.input,
        qtyCompletedToday: Math.max(cs!.output - alreadyLogged, 0),
        qtyForwarded: Math.max(cs!.output - alreadyLogged, 0),
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  /** The plan itself is written as it's entered above, so this records that
   * planning progressed without handing anything to procurement yet. */
  async function savePlan() {
    await submitMovement({
      base: { qtyReceived: cs!.input, qtyForwarded: 0, notes: "Plan saved - nothing forwarded." },
      action: "plan",
    });
    onForwarded();
  }

  return (
    <div className="space-y-6">
      {props.showDetails && (
        <p className="text-xs leading-relaxed text-ink-500">
          Required Plan - say what this order needs: a name, a required quantity in KG, and a reason whenever that quantity changes.
          Purchasing and receiving happen on the next two screens, not here. Three planners can work at once - each marks their own
          lines complete as they finish.
        </p>
      )}

      {/* Blue: a commitment we're making, not a quantity that has arrived. */}
      <DirectionPanel direction="out" step={1} title="Required Plan" subtitle="What this order needs. Purchasing and receiving happen on the next two screens.">
        <MaterialLedger
          orderId={order.id}
          poId={assignment.poId}
          sectionId={assignment.sectionId}
          flows={flows}
          categories={["yarn", "fabric"]}
          canEditRequirements
          entryTypes={[]}
          onSaved={onForwarded}
        />
      </DirectionPanel>

      <StageActions
        sectionLabel={assignment.section?.label ?? "Raw Material Planning"}
        unitType="KG"
        balance={cs.balance}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
      {flows.length === 0 && (
        <p className="text-center text-[11px] text-amber-700">No yarn counts or fabric added yet - procurement will have nothing to buy against.</p>
      )}
    </div>
  );
}
