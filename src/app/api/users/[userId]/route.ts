import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, prismaErrorCode } from "@/lib/server/http";
import { forgetUser, isAdmin } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { toPublicAppUser, USER_ROLES } from "@/lib/types";

const HAS_HISTORY_MESSAGE =
  "This user has production entries on record and can't be permanently deleted, to keep the order history intact. Deactivate the account instead.";

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
  if (typeof body.name === "string") {
    if (!body.name.trim()) return apiError(400, "Name can't be blank.");
    data.name = body.name.trim();
  }
  if (body.role !== undefined) {
    if (!(USER_ROLES as readonly unknown[]).includes(body.role)) return apiError(400, `Role must be one of: ${USER_ROLES.join(", ")}.`);
    data.role = body.role;
  }
  if (body.phone === null || typeof body.phone === "string") data.phone = body.phone ? body.phone.trim() : null;
  if (typeof body.isMonitorOnly === "boolean") data.isMonitorOnly = body.isMonitorOnly;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.canCreateOrders === "boolean") data.canCreateOrders = body.canCreateOrders;
  if (typeof body.canJobWork === "boolean") data.canJobWork = body.canJobWork;

  // Demoting or deactivating yourself would lock you out mid-session, and doing it to the last active admin
  // would leave nobody able to manage accounts at all.
  const losesAdmin = (data.role !== undefined && data.role !== "admin") || data.isActive === false;
  if (losesAdmin) {
    if (userId === auth.session.userId) {
      return apiError(400, "You can't remove admin access from, or deactivate, the account you're logged in as.");
    }
    const target = await prisma.appUser.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (target?.role === "admin" && target.isActive) {
      const activeAdmins = await prisma.appUser.count({ where: { role: "admin", isActive: true } });
      if (activeAdmins <= 1) return apiError(400, "This is the last active Admin account - make another Admin first.");
    }
  }

  try {
    const user = await prisma.appUser.update({ where: { id: userId }, data });
    forgetUser(userId);
    return NextResponse.json({ user: serializeForJson(toPublicAppUser(user, { includePassword: true })) });
  } catch (error) {
    if (prismaErrorCode(error) === "P2025") return apiError(404, "User not found.");
    throw error;
  }
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

  const target = await prisma.appUser.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!target) return apiError(404, "User not found.");
  if (target.role === "admin" && target.isActive) {
    const activeAdmins = await prisma.appUser.count({ where: { role: "admin", isActive: true } });
    if (activeAdmins <= 1) return apiError(400, "This is the last active Admin account - make another Admin first.");
  }

  // Every table that records who did what (stage entries, txns, material/accessory entries, the audit log ...)
  // restricts deleting its user, so the database itself refuses when there is history - answered as a 409.
  try {
    await prisma.appUser.delete({ where: { id: userId } });
  } catch (error) {
    if (prismaErrorCode(error) === "P2003") {
      return NextResponse.json({ error: HAS_HISTORY_MESSAGE, code: "HAS_HISTORY" }, { status: 409 });
    }
    throw error;
  }
  forgetUser(userId);
  return NextResponse.json({ ok: true });
}
