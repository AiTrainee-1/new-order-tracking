"use client";

import { useOrderGroups } from "@/hooks/useOrderGroups";
import { groupForStage, groupSyncKind, memberLabel, otherMembers } from "@/lib/orderGroups";
import type { StageFormType } from "@/lib/types";
import { LinkGlyph } from "./GroupIndicator";

/**
 * Shown above a stage's data-entry form when that order's stage is in an Order
 * Group. It says, before anything is typed, that what gets saved will also be
 * saved to the other orders - so a grouped entry is never a surprise.
 * Renders nothing for an order/stage that is not grouped.
 */
export function GroupSyncBanner({ orderId, stageKey, stageLabel, formType }: { orderId: string; stageKey: string | undefined; stageLabel: string; formType?: StageFormType }) {
  const { data: groups } = useOrderGroups();
  const group = stageKey ? groupForStage(groups, orderId, stageKey) : null;
  const others = group ? otherMembers(group, orderId) : [];
  if (!group || others.length === 0) return null;
  // Order Confirmation and Pattern Making have no ledger: the stage entry itself is what is shared.
  const confirmationOnly = formType ? groupSyncKind({ formType }) === "stage_entry" : false;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm text-violet-900">
      <p className="flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white">
          <LinkGlyph size={13} />
        </span>
        Grouped stage - &ldquo;{group.name}&rdquo;
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-violet-800">
        {stageLabel} is grouped with {others.length} other order{others.length === 1 ? "" : "s"}.{" "}
        {confirmationOnly ? (
          <>Saving, moving forward or completing it here does the same on <b>all of them</b>, with the same note.</>
        ) : (
          <>
            Everything you save here is saved to <b>all of them</b> as well, and a correction or removal here is applied on each of them. Marking the stage forward or complete is still done
            separately on each order.
          </>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {others.map((m) => (
          <span key={m.orderId} className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-medium text-violet-800">
            IO {m.ioNo} · {memberLabel(m)}
          </span>
        ))}
      </div>
    </div>
  );
}
