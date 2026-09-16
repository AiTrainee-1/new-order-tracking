import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession } from "@/lib/server/http";

/** The full stage catalog - any authenticated user may read it (matches the
 *  old workflow_stages SELECT policy: `auth.role() = 'authenticated'`). */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const stages = await prisma.stageDefinition.findMany({
    where: { isActive: true },
    orderBy: [{ isOrderOrigin: "desc" }, { label: "asc" }],
  });

  return NextResponse.json({ stages });
}
