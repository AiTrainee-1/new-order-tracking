import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";

export async function DELETE(_request: Request, context: RouteContext<"/api/stage-assignments/[id]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can remove stage roles.");
  }

  const { id } = await context.params;
  await prisma.stageAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
