"use client";

import { useMemo } from "react";
import { DemoModeProvider, useDemoStore } from "@/context/DemoModeContext";
import { buildOrderProgress } from "@/lib/progress";
import { getOrderProductionQty } from "@/lib/orderQty";
import { DEMO_ORDER, DEMO_PO, DEMO_PREVIEW_SECTION_ID, DEMO_USER, buildDemoSections } from "@/lib/demoData";
import { Button } from "@/components/ui/Button";
import { StageFormRouter } from "./StageFormRouter";
import type { StagePlanCatalogEntry } from "@/lib/stagePlan";
import type { AssignmentWithDetails, ChainSection } from "@/lib/types";

/**
 * The Preview sandbox - the real stage form, wired to memory instead of the
 * database.
 *
 * This renders the SAME component the floor uses. Not a screenshot, not a
 * simplified copy: <StageFormRouter/> picks exactly the form it would pick for
 * this stage on a real order, off `assignment.section.formType` alone. Every
 * field, every table, every button behaves as it does in production, and the
 * numbers move as entries are added.
 *
 * What makes it safe is DemoModeProvider. Inside it, every hook that reads or
 * writes production data finds a demo store and uses that instead of the API -
 * the guards live in the hooks themselves (useProductionChain.ts,
 * useStageEntries.ts, useEntryUser.ts), so nothing here has to remember to be
 * careful.
 */
export function StagePreviewSandbox({ stage }: { stage: StagePlanCatalogEntry }) {
  // A two-or-three row stand-in stage plan: an order-origin row, optionally a
  // KG predecessor, then this stage. See buildDemoSections for why each row is
  // there and what it unlocks in chain.ts / progress.ts.
  const sections = useMemo<ChainSection[]>(() => buildDemoSections(stage), [stage]);

  return (
    <DemoModeProvider sections={sections}>
      <SandboxBody stage={stage} sections={sections} />
    </DemoModeProvider>
  );
}

function SandboxBody({ stage, sections }: { stage: StagePlanCatalogEntry; sections: ChainSection[] }) {
  const demo = useDemoStore()!;
  const section = sections[sections.length - 1];

  /** A stand-in assignment, order-wide like every real one - data entry is
   *  never scoped to a single PO. */
  const assignment = useMemo<AssignmentWithDetails>(
    () => ({
      id: "demo-assignment",
      userId: DEMO_USER.id,
      orderId: DEMO_ORDER.id,
      poId: null,
      sectionId: DEMO_PREVIEW_SECTION_ID,
      unitName: null,
      canEnterData: true,
      createdAt: new Date().toISOString(),
      order: DEMO_ORDER,
      po: null,
      section,
      user: { id: DEMO_USER.id, name: DEMO_USER.name, username: "preview", phone: null },
    }),
    [section],
  );

  /** Gating progress for the sandbox, built from its own in-memory entries so
   *  pressing Move Forward visibly changes the stage's state. */
  const stageProgress = useMemo(() => {
    const progress = buildOrderProgress(DEMO_ORDER, sections, demo.stageEntries, {
      totalQty: getOrderProductionQty([DEMO_PO]) || DEMO_ORDER.totalQty,
      cutQuantity: DEMO_ORDER.cutQuantity,
    });
    return progress.stages.find((s) => s.stage.id === DEMO_PREVIEW_SECTION_ID);
  }, [sections, demo.stageEntries]);

  const movedOn = stageProgress?.isPartial || stageProgress?.isCompleted;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-900">Practice mode - nothing here is saved</p>
          <p className="text-[11px] leading-relaxed text-blue-800">
            This is the real {stage.label} form running on a sample order. Type in it, add entries, press the
            buttons - none of it touches your orders or reaches the database.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={demo.reset}>
          Reset practice data
        </Button>
      </div>

      {movedOn && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900">
          You just moved this practice stage on
          {stageProgress?.isCompleted ? " and marked it complete" : " without completing it"}. On a real order the
          next stage would now unlock. Press <b>Reset practice data</b> to try again.
        </p>
      )}

      {/* The genuine article. Same component, same props shape, same
          behaviour. Always shown in full - the Preview exists to demonstrate
          the form, so there's nothing to collapse behind a details toggle. */}
      <StageFormRouter
        order={DEMO_ORDER}
        assignment={assignment}
        stageProgress={stageProgress}
        onForwarded={() => {
          /* The demo store re-renders on its own; there's nothing to refetch. */
        }}
        showDetails
      />
    </div>
  );
}
