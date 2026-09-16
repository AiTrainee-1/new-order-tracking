import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";

export async function DELETE(_request: Request, context: RouteContext<"/api/production-lots/[lotId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can delete a lot.");
  }

  const { lotId } = await context.params;
  await prisma.productionLot.delete({ where: { id: lotId } });
  return NextResponse.json({ ok: true });
}
