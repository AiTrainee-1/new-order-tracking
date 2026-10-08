import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";

/**
 * Make one user the default assignee for many stages in a SINGLE transaction -
 * what "Assign All Stages" calls.
 *
 * It used to be one request per stage, run one after another from the browser:
 * any single failed request (a network blip, a database timeout, a refresh or a
 * closed tab part-way) stopped the loop and left the user on only the first few
 * stages, with the rest silently missing. Here it is all-or-nothing, and the
 * server - not the browser's possibly stale copy of the catalog - decides which
 * stages "all" means.
 *
 * Body: { userId, canEnterData?, stageDefinitionIds? }
 *   stageDefinitionIds omitted -> every active stage in the catalog.
 *
 * Re-running is safe: stages the user already has are left alone (or have their
 * access level brought in line with `canEnterData`), never duplicated.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can set stage roles.");
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const canEnterData = body?.canEnterData !== false;
  if (!userId) return apiError(400, "userId is required.");
  if (body?.stageDefinitionIds !== undefined && (!Array.isArray(body.stageDefinitionIds) || body.stageDefinitionIds.some((id: unknown) => typeof id !== "string"))) {
    return apiError(400, "stageDefinitionIds must be a list of stage ids.");
  }

  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return apiError(404, "That user no longer exists.");

  const activeStages = await prisma.stageDefinition.findMany({ where: { isActive: true }, select: { id: true } });
  const activeIds = new Set(activeStages.map((s) => s.id));
  const requested: string[] = body?.stageDefinitionIds ? [...new Set<string>(body.stageDefinitionIds)] : activeStages.map((s) => s.id);
  const unknown = requested.filter((id) => !activeIds.has(id));
  if (unknown.length > 0) return apiError(400, `${unknown.length} of those stages aren't in the catalog (anymore). Refresh and try again.`);
  if (requested.length === 0) return apiError(400, "There are no stages to assign.");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.stageAssignment.findMany({
        where: { userId, stageDefinitionId: { in: requested } },
        select: { stageDefinitionId: true, canEnterData: true },
      });
      const have = new Map(existing.map((e) => [e.stageDefinitionId, e.canEnterData]));
      const toCreate = requested.filter((id) => !have.has(id));
      const toUpdate = existing.filter((e) => e.canEnterData !== canEnterData).map((e) => e.stageDefinitionId);

      if (toCreate.length > 0) {
        await tx.stageAssignment.createMany({
          data: toCreate.map((stageDefinitionId) => ({ userId, stageDefinitionId, canEnterData })),
          skipDuplicates: true,
        });
      }
      if (toUpdate.length > 0) {
        await tx.stageAssignment.updateMany({ where: { userId, stageDefinitionId: { in: toUpdate } }, data: { canEnterData } });
      }

      // Re-count before committing: if even one stage is missing, throw and
      // roll the whole thing back rather than report a success that isn't.
      const total = await tx.stageAssignment.count({ where: { userId, stageDefinitionId: { in: requested } } });
      if (total !== requested.length) {
        throw new Error(`Only ${total} of ${requested.length} stages were saved.`);
      }
      return { created: toCreate.length, updated: toUpdate.length, unchanged: requested.length - toCreate.length - toUpdate.length, total };
    });

    return NextResponse.json({ requested: requested.length, ...result });
  } catch (err) {
    console.error("[stage-assignments/bulk]", err);
    return apiError(500, "Couldn't assign every stage, so nothing was changed. Please try again.");
  }
}
