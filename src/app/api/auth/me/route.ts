import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { getSession } from "@/lib/server/session";
import { toPublicAppUser } from "@/lib/types";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ appUser: null }, { status: 200 });
  }

  const user = await prisma.appUser.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) {
    return NextResponse.json({ appUser: null }, { status: 200 });
  }

  return NextResponse.json({ appUser: toPublicAppUser(user) });
}
