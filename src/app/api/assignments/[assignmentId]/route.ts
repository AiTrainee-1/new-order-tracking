import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";

export async function DELETE(_request: Request, context: RouteContext<"/api/assignments/[assignmentId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can remove assignments.");
  }

  const { assignmentId } = await context.params;
  await prisma.userAssignment.delete({ where: { id: assignmentId } });
  return NextResponse.json({ ok: true });
}
