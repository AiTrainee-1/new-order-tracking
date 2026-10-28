import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, prismaErrorCode } from "@/lib/server/http";
import { isAdmin, isAdminOrMd } from "@/lib/server/authz";
import { hashPassword } from "@/lib/server/password";
import { serializeForJson } from "@/lib/server/serialize";
import { toPublicAppUser, USER_ROLES } from "@/lib/types";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  // MD is a read-only role that needs the full user directory too (name
  // resolution on order-tracking pages, MdUsersPage) - matches migration
  // 015's is_admin_or_md() widening of the old app_users SELECT policy.
  if (!(await isAdminOrMd(auth.session.userId))) {
    return apiError(403, "Only Admin and MD accounts can view the user list.");
  }

  const [users, admin] = await Promise.all([prisma.appUser.findMany({ orderBy: { createdAt: "asc" } }), isAdmin(auth.session.userId)]);
  return NextResponse.json({ users: users.map((u) => serializeForJson(toPublicAppUser(u, { includePassword: admin }))) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can perform this action.");
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = typeof body?.role === "string" ? body.role.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const isMonitorOnly = !!body?.isMonitorOnly;

  if (!name || !username || !password || !role) {
    return apiError(400, "Name, username, password and role are all required.");
  }
  if (!USERNAME_PATTERN.test(username)) {
    return apiError(400, "Username must be 3-32 characters: lowercase letters, numbers, dots, underscores, or hyphens only.");
  }
  if (password.length < 6) {
    return apiError(400, "Password must be at least 6 characters.");
  }
  if (!(USER_ROLES as readonly string[]).includes(role)) {
    return apiError(400, `Role must be one of: ${USER_ROLES.join(", ")}.`);
  }

  const existing = await prisma.appUser.findUnique({ where: { username } });
  if (existing) {
    return apiError(409, `Username "${username}" is already taken.`);
  }

  const passwordHash = await hashPassword(password);
  // The findUnique above answers the common case nicely; two admins creating the same username at once still
  // meet the unique index, answered the same way.
  const user = await prisma.appUser.create({
    data: {
      name,
      username,
      passwordHash,
      passwordPlain: password,
      role,
      phone: phone || null,
      isMonitorOnly,
      isActive: true,
    },
  }).catch((error: unknown) => {
    if (prismaErrorCode(error) === "P2002") return null;
    throw error;
  });
  if (!user) return apiError(409, `Username "${username}" is already taken.`);

  return NextResponse.json({ id: user.id }, { status: 201 });
}
