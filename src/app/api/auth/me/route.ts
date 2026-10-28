import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { deleteSession, getSession } from "@/lib/server/session";
import { isSessionCurrent } from "@/lib/server/authz";
import { toPublicAppUser } from "@/lib/types";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ appUser: null }, { status: 200 });
  }

  // A deactivated account or a pre-reset token: clear the cookie so proxy.ts lets the browser back to /login.
  if (!(await isSessionCurrent(session))) {
    await deleteSession();
    return NextResponse.json({ appUser: null }, { status: 200 });
  }

  const user = await prisma.appUser.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ appUser: null }, { status: 200 });
  }

  return NextResponse.json({ appUser: toPublicAppUser(user) });
}
