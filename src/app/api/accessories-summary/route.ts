import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdminOrMd } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/**
 * Cross-order accessories view for the admin/MD Accessories Management page.
 * The per-order bundle route is scoped to one order, so this is a separate
 * query rather than N calls to that route.
 */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdminOrMd(auth.session.userId))) {
    return apiError(403, "Only Admin and MD accounts can view the accessories summary.");
  }

  const requirements = await prisma.accessoryRequirement.findMany({
    include: {
      order: { select: { id: true, ioNo: true, style: true, color: true, buyer: { select: { id: true, name: true } } } },
      po: { select: { id: true, poNumber: true } },
      entries: { orderBy: { entryDate: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requirements: serializeForJson(requirements) });
}
