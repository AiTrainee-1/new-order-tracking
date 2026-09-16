"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useStageChain } from "@/hooks/useProductionChain";
import { Textarea } from "@/components/ui/FormControls";
import { Loader } from "@/components/ui/Loader";
import { Badge } from "@/components/ui/Badge";
import { formatDisplayDate } from "@/lib/workflow";
import { StageActions } from "./shared";
import { useStageEntryBuilder } from "@/hooks/useStageEntryBuilder";
import { DirectionPanel, QtyBox, Section } from "./chainShared";
import type { StageFormProps } from "./types";

/**
 * Order Confirmation - the gate everything downstream depends on.
 *
 * Its job is to make someone actually look at the size breakdown before the
 * factory starts spending yarn against it, because every later stage measures
 * itself against these numbers. A PO with no size split is flagged rather than
 * silently allowed through: Cutting would otherwise have nothing to compare
 * against and the size-wise tracking would be hollow from the start.
 */
export function ConfirmationForm({ order, assignment, onForwarded, showDetails }: StageFormProps) {
  const toast = useToast();
  const { submitMovement, isPending, appUser } = useStageEntryBuilder(order, assignment);
  const { sizes, isLoading, cs } = useStageChain(order.id, assignment.poId, assignment.sectionId);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Loader label="Loading order details…" />;

  const total = sizes.reduce((sum, s) => sum + s.quantity, 0);
  const hasSizeBreakdown = sizes.length > 1 || (sizes.length === 1 && sizes[0].sizeCode !== "TOTAL");

  async function handleForward(isFinal: boolean) {
    if (!appUser) return;
    setError(null);
    if (!notes.trim()) {
      toast.error("Add a note before continuing.");
      return;
    }
    try {
      await submitMovement({
        base: {
          qtyReceived: total,
          qtyCompletedToday: total,
          qtyForwarded: total,
          notes: notes.trim(),
        },
        action: isFinal ? "complete" : "forward",
      });
      toast.success(isFinal ? "Order confirmed and forwarded to Raw Material Planning." : "Moved forward - this stage stays open until you confirm it.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not confirm order.";
      setError(message);
      toast.error(message);
    }
  }

  /** Records the note against the order without releasing it to planning -
   * used when the sizes need checking with the buyer first. */
  async function savePlan() {
    if (!appUser) return;
    setError(null);
    if (!notes.trim()) {
      toast.error("Add a note before continuing.");
      return;
    }
    try {
      await submitMovement({
        base: { qtyReceived: total, qtyForwarded: 0, notes: notes.trim() },
        action: "plan",
      });
      toast.success("Saved. The order hasn't moved on yet.");
      onForwarded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      {showDetails && (
        <Section title="Order">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Style" value={order.style} />
            <Field label="IO / No" value={order.ioNo} />
            <Field label="Colour" value={order.color ?? "-"} />
            <Field label="Delivery" value={formatDisplayDate(order.deliveryDate)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Description" value={order.description || "-"} />
            <Field label="Fabric" value={order.fabric || "-"} />
          </div>
        </Section>
      )}

      {/* Slate: a checkpoint, not a movement. Confirmation approves figures
          that already exist rather than committing or receiving any quantity,
          so it deliberately takes neither the blue nor the green. */}
      <DirectionPanel
        direction="neutral"
        title="Confirm the Order"
        subtitle="These quantities are the yardstick for Cutting, Panel Checking, Sewing and Packing. Check them before anything is committed."
      >
        <Section title={assignment.po ? `PO ${assignment.po.poNumber} - size breakdown` : "Size breakdown"}>
          {!hasSizeBreakdown && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This PO has no size split - only a total. Size-wise tracking won&apos;t be available downstream until an Admin edits the
              order and breaks the quantity out by size.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  {sizes.map((s) => (
                    <th key={s.sizeCode} className="px-3 py-2 text-center font-semibold">
                      {s.sizeCode}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  {sizes.map((s) => (
                    <td key={s.sizeCode} className="px-3 py-2.5 text-center font-semibold tabular-nums text-ink-900">
                      {s.quantity.toLocaleString()}
                    </td>
                  ))}
                  <td className="bg-ink-50 px-3 py-2.5 text-center font-bold tabular-nums text-ink-900">{total.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </DirectionPanel>

      {showDetails && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <QtyBox label="Order quantity" value={total} unit="PCS" />
          <QtyBox label="Sizes" value={sizes.length} />
          <div className="flex items-center justify-center rounded-xl border border-white/70 bg-white/70 px-3 py-2.5">
            <Badge tone={cs?.isStarted ? "good" : "neutral"}>{cs?.isStarted ? "Confirmed" : "Awaiting confirmation"}</Badge>
          </div>
        </div>
      )}

      <Textarea
        label="Notes"
        required
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything the planning team should know before material is committed…"
      />

      {error && <p className="text-sm text-status-bad">{error}</p>}

      <StageActions
        sectionLabel={assignment.section?.label ?? "Order Confirmation"}
        unitType="PCS"
        balance={0}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => handleForward(false)}
        onComplete={() => handleForward(true)}
        completeLabel="Completed – Confirm & Move Forward"
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}
