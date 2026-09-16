"use client";

import { useEntryUser } from "./useEntryUser";
import { useCreateStageEntry, type CreateStageEntryInput } from "./useStageEntries";
import type { AssignmentWithDetails, Order } from "@/lib/types";

export type StageAction = "plan" | "forward" | "complete";

/**
 * Builds and writes the `stage_entries` gating row for one of the three
 * stage actions. `is_forwarded`/`is_completed` come from a single
 * discriminator rather than two independent booleans, because two booleans
 * can express a fourth state that doesn't exist - "Save Plan" and "Not
 * Complete - Move Forward" both wrote `isCompleted: false` with no way to
 * tell them apart, and the next stage never unlocked. See the README's
 * "Three ways to move work on" section for the full history.
 *
 * No demo-mode guard of its own: this hook only assembles a row and hands it
 * to useCreateStageEntry, and attributes it via useEntryUser - both of which
 * are already guarded, so inside a Preview sandbox the entry lands in the
 * in-memory demo store. See src/context/DemoModeContext.tsx.
 */
export function useStageEntryBuilder(order: Order, assignment: AssignmentWithDetails) {
  const appUser = useEntryUser();
  const createEntry = useCreateStageEntry();

  function buildEntry(overrides: Partial<CreateStageEntryInput>, action: StageAction): CreateStageEntryInput {
    return {
      orderId: order.id,
      poId: assignment.poId,
      sectionId: assignment.sectionId,
      entryDate: new Date().toISOString().slice(0, 10),
      unitType: assignment.section?.unitType ?? "PCS",
      qtyReceived: 0,
      qtyCompletedToday: 0,
      qtyForwarded: 0,
      qtyShortage: 0,
      qtyRejected: 0,
      qtyReturned: 0,
      isExternal: false,
      externalUnitName: null,
      isSentOutside: false,
      isReturned: false,
      isForwarded: action !== "plan",
      isCompleted: action === "complete",
      branch: null,
      unitName: assignment.unitName,
      transferType: "none",
      transferTo: null,
      notes: null,
      forwardedToUserId: null,
      ...overrides,
    };
  }

  async function submitMovement({ base, action }: { base: Partial<CreateStageEntryInput>; action: StageAction }) {
    await createEntry.mutateAsync(buildEntry(base, action));
  }

  return { buildEntry, submitMovement, isPending: createEntry.isPending, appUser };
}
