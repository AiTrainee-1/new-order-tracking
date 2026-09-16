"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useStageChain } from "@/hooks/useProductionChain";
import { Checkbox, Textarea } from "@/components/ui/FormControls";
import { Loader } from "@/components/ui/Loader";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "@/hooks/useStageEntryBuilder";
import { QtyBox, Section } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Pattern Making & Marker Planning - the one confirmation-only stage left.
 *
 * It plans rather than consumes, so it forwards the fabric it received
 * untouched. Its real job is to show the planner the fabric actually in store
 * and the size breakdown the marker has to satisfy, then get a sign-off before
 * Cutting starts turning kilos into pieces.
 */
export function SimpleConfirmForm({ order, assignment, stageProgress, onForwarded, showDetails }: StageFormProps) {
  const toast = useToast();
  const { submitMovement, isPending, appUser } = useStageEntryBuilder(order, assignment);
  const { cs, sizes, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);

  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn&apos;t load this stage&apos;s data.</p>;

  const totalPcs = sizes.reduce((sum, s) => sum + s.quantity, 0);

  async function handleForward(isFinal: boolean) {
    if (!appUser) return;
    setError(null);
    if (!notes.trim()) {
      toast.error("Add a note before continuing.");
      return;
    }
    try {
      const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
      await submitMovement({
        base: {
          qtyReceived: cs!.input,
          qtyCompletedToday: Math.max(cs!.input - alreadyLogged, 0),
          qtyForwarded: Math.max(cs!.input - alreadyLogged, 0),
          notes: notes.trim(),
        },
        action: isFinal ? "complete" : "forward",
      });
      toast.success(isFinal ? "Marker confirmed - Cutting can start." : "Moved forward - this stage stays open until the full set is signed off.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not forward.";
      setError(message);
      toast.error(message);
    }
  }

  /** Records marker progress without releasing the fabric to Cutting. */
  async function savePlan() {
    if (!appUser) return;
    setError(null);
    if (!notes.trim()) {
      toast.error("Add a note before continuing.");
      return;
    }
    try {
      await submitMovement({
        base: { qtyReceived: cs!.input, qtyForwarded: 0, notes: notes.trim() },
        action: "plan",
      });
      toast.success("Saved. Nothing moved on.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
        Is the pattern card and marker ready for this order, and is it clear to proceed to Cutting?
      </p>

      {showDetails && (
        <Section title="What this marker has to satisfy">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <QtyBox label="Fabric in store" value={cs.input} unit="KG" hint="carried in from Fabric Store" />
            <QtyBox label="Pieces to cut" value={totalPcs} unit="PCS" />
            <QtyBox label="Sizes" value={sizes.length} />
          </div>
          {sizes.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                    {sizes.map((s) => (
                      <th key={s.sizeCode} className="px-3 py-2 text-center font-semibold">
                        {s.sizeCode}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    {sizes.map((s) => (
                      <td key={s.sizeCode} className="px-3 py-2.5 text-center font-semibold tabular-nums">
                        {s.quantity.toLocaleString()}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        Part of the pattern set ready? Move it forward so Cutting can start - this stage stays orange until the full set is signed off.
      </p>

      <Checkbox checked={confirmed} onChange={setConfirmed} label="Pattern / marker is ready" />

      <Textarea
        label="Notes"
        required
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Marker planned at 1:2:3:3:2:1 - 82% efficiency"
      />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <StageActions
        sectionLabel={assignment.section?.label ?? "this stage"}
        unitType="KG"
        balance={0}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => handleForward(false)}
        onComplete={() => handleForward(true)}
      />
    </div>
  );
}
