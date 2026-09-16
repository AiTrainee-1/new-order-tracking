import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { verifyPassword } from "@/lib/server/password";
import { createSession } from "@/lib/server/session";
import { toPublicAppUser } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const user = await prisma.appUser.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: "This account has been deactivated. Contact your Admin." },
      { status: 403 },
    );
  }

  await createSession(user.id, user.role);
  await prisma.appUser.update({ where: { id: user.id }, data: { lastActivityAt: new Date() } });

  return NextResponse.json({ appUser: toPublicAppUser(user) });
}
