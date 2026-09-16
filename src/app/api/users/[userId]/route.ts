import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { toPublicAppUser } from "@/lib/types";

/**
 * General-purpose patch for app_users - name/role/phone edits, the active
 * toggle, and the two capability flags (canCreateOrders/canJobWork) all go
 * through here. The old app let any of these through a plain Supabase
 * client call relying on RLS; here every one of them is explicitly gated to
 * admin, since there's no RLS backstop any more.
 */
export async function PATCH(request: Request, context: RouteContext<"/api/users/[userId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can perform this action.");
  }

  const { userId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "Invalid request body.");

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.role === "string") data.role = body.role.trim();
  if (body.phone === null || typeof body.phone === "string") data.phone = body.phone ? body.phone.trim() : null;
  if (typeof body.isMonitorOnly === "boolean") data.isMonitorOnly = body.isMonitorOnly;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.canCreateOrders === "boolean") data.canCreateOrders = body.canCreateOrders;
  if (typeof body.canJobWork === "boolean") data.canJobWork = body.canJobWork;

  const user = await prisma.appUser.update({ where: { id: userId }, data });
  return NextResponse.json({ user: serializeForJson(toPublicAppUser(user)) });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/users/[userId]">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can perform this action.");
  }

  const { userId } = await context.params;
  if (userId === auth.session.userId) {
    return apiError(400, "You can't delete the account you're currently logged in as.");
  }

  const [enteredCount, forwardedCount] = await Promise.all([
    prisma.stageEntry.count({ where: { enteredBy: userId } }),
    prisma.stageEntry.count({ where: { forwardedToUserId: userId } }),
  ]);
  if (enteredCount > 0 || forwardedCount > 0) {
    return NextResponse.json(
      {
        error:
          "This user has production entries on record and can't be permanently deleted, to keep the order history intact. Deactivate the account instead.",
        code: "HAS_HISTORY",
      },
      { status: 409 },
    );
  }

  await prisma.appUser.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}
