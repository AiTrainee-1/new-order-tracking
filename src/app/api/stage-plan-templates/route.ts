import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession } from "@/lib/server/http";

export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const templates = await prisma.stagePlanTemplate.findMany({
    orderBy: { name: "asc" },
    include: { items: { orderBy: { seq: "asc" }, include: { stageDefinition: true } } },
  });

  return NextResponse.json({ templates });
}
