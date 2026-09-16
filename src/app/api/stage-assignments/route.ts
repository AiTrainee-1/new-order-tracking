import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/** Global stage-role defaults: a user set as the default assignee for a
 *  catalog stage, applying to every order whose plan includes it. */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const assignments = await prisma.stageAssignment.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ stageAssignments: serializeForJson(assignments) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can set stage roles.");
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const stageDefinitionId = typeof body?.stageDefinitionId === "string" ? body.stageDefinitionId : "";
  const canEnterData = body?.canEnterData !== false;

  if (!userId || !stageDefinitionId) {
    return apiError(400, "userId and stageDefinitionId are required.");
  }

  const assignment = await prisma.stageAssignment.upsert({
    where: { userId_stageDefinitionId: { userId, stageDefinitionId } },
    update: { canEnterData },
    create: { userId, stageDefinitionId, canEnterData },
  });

  return NextResponse.json({ stageAssignment: serializeForJson(assignment) }, { status: 201 });
}
