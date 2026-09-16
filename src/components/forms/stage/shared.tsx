"use client";

import { useConfirm } from "@/context/ConfirmContext";
import { Button } from "@/components/ui/Button";
import type { UnitType } from "@/lib/types";

/**
 * The three buttons that close every stage form. All three stay enabled at
 * all times, so the choice is always the operator's rather than the form's -
 * see useStageEntryBuilder.ts for why is_forwarded/is_completed are a single
 * discriminator rather than two independent booleans.
 */

function useForwardConfirm() {
  const confirm = useConfirm();
  return (sectionLabel: string, balance: { qty: number; unit: UnitType }) =>
    confirm({
      title: "Forward & Complete?",
      message: (
        <>
          <p>
            This marks <b>{sectionLabel}</b> complete and forwards it to the next stage. The following
            stage(s) will unlock, and this can&apos;t be undone.
          </p>
          {balance.qty > 0 && (
            <p className="mt-2">
              {balance.qty.toLocaleString()} {balance.unit} balance remains - it will be recorded as a
              shortage.
            </p>
          )}
        </>
      ),
      confirmLabel: "Yes, forward & complete",
      cancelLabel: "Go back",
    });
}

function usePartialConfirm() {
  const confirm = useConfirm();
  return (sectionLabel: string, balance: { qty: number; unit: UnitType }) =>
    confirm({
      title: "Move forward without completing?",
      message: (
        <>
          <p>
            This forwards what&apos;s ready so the next stage can start, but leaves <b>{sectionLabel}</b>{" "}
            open. It stays flagged in the workflow until you come back and complete it.
          </p>
          {balance.qty > 0 && (
            <p className="mt-2">
              {balance.qty.toLocaleString()} {balance.unit} will remain outstanding here.
            </p>
          )}
        </>
      ),
      confirmLabel: "Yes, move forward",
      cancelLabel: "Go back",
    });
}

export function StageActions({
  sectionLabel,
  unitType,
  balance,
  isLoading,
  onSavePlan,
  onMoveForward,
  onComplete,
  savePlanLabel = "Save Plan",
  moveForwardLabel = "Not Complete – Move Forward",
  completeLabel = "Completed – Move Forward",
  disabled = false,
}: {
  sectionLabel: string;
  unitType: UnitType;
  balance: number;
  isLoading: boolean;
  onSavePlan: () => void;
  onMoveForward: () => void;
  onComplete: () => void;
  savePlanLabel?: string;
  moveForwardLabel?: string;
  completeLabel?: string;
  disabled?: boolean;
}) {
  const confirmPartial = usePartialConfirm();
  const confirmComplete = useForwardConfirm();

  async function handleMoveForward() {
    const ok = await confirmPartial(sectionLabel, { qty: balance, unit: unitType });
    if (ok) onMoveForward();
  }

  async function handleComplete() {
    const ok = await confirmComplete(sectionLabel, { qty: balance, unit: unitType });
    if (ok) onComplete();
  }

  return (
    <div className="space-y-3 border-t border-ink-100 pt-4">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onSavePlan} isLoading={isLoading} disabled={disabled}>
          {savePlanLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleMoveForward}
          isLoading={isLoading}
          disabled={disabled}
          style={{ backgroundImage: "linear-gradient(120deg, #B45309 0%, #D97706 100%)", color: "white" }}
        >
          {moveForwardLabel}
        </Button>
      </div>
      <Button type="button" size="lg" className="w-full" onClick={handleComplete} isLoading={isLoading} disabled={disabled}>
        {completeLabel} →
      </Button>
      <p className="text-[11px] leading-relaxed text-ink-500">
        <b>Save Plan</b> keeps your entries here without moving anything on. <b>Not Complete</b> sends
        what&apos;s ready and leaves this stage open - shown in orange, with the balance still owed. The
        next stage unlocks either way.
      </p>
    </div>
  );
}
