import "server-only";
import type { NextResponse } from "next/server";
import { apiError } from "./http";
import { GroupSyncError } from "./orderGroups";

/**
 * Run an Order Group planner (planGroupedCreate, planMaterialEntryChange, ...): its plan, or - when the write
 * is grouped but cannot be mirrored safely (GroupSyncError, thrown before anything is written) - the error
 * response to send instead. Any other failure is a real bug and is rethrown.
 */
export async function groupPlan<T>(planning: Promise<T>): Promise<{ plan: T } | { error: NextResponse }> {
  try {
    return { plan: await planning };
  } catch (error) {
    if (error instanceof GroupSyncError) return { error: apiError(error.status, error.message) };
    throw error;
  }
}
