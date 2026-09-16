import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import { hashPassword } from "@/lib/server/password";

export async function POST(request: Request, context: RouteContext<"/api/users/[userId]/reset-password">) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) {
    return apiError(403, "Only Admin accounts can perform this action.");
  }

  const { userId } = await context.params;
  const body = await request.json().catch(() => null);
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 6) {
    return apiError(400, "A password of at least 6 characters is required.");
  }

  const passwordHash = await hashPassword(newPassword);
  // A single transaction fixes what was a real gap in the old app: there,
  // the hashed Supabase Auth password and the password_plain mirror column
  // were two separate, non-atomic writes.
  await prisma.appUser.update({
    where: { id: userId },
    data: { passwordHash, passwordPlain: newPassword },
  });

  return NextResponse.json({ ok: true });
}
