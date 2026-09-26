import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canCreateOrders } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/** Every buyer, A-Z - any signed-in user may read the list (it feeds the
 *  order forms' dropdown and the Buyer filters on every order listing). */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const buyers = await prisma.buyer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return NextResponse.json({ buyers: serializeForJson(buyers) });
}

/** Adds a buyer - or, if one with the same name (ignoring case and stray
 *  spaces) already exists, returns that one instead of a duplicate, so two
 *  people typing "H&M" and "h&m " end up sharing a single buyer. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await canCreateOrders(auth.session.userId))) {
    return apiError(403, "You don't have permission to add buyers.");
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return apiError(400, "Enter a buyer name.");
  if (name.length > 120) return apiError(400, "Buyer name is too long.");

  const existing = await prisma.buyer.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return NextResponse.json({ buyer: serializeForJson(existing), created: false });

  const buyer = await prisma.buyer.create({
    data: { name, createdBy: auth.session.userId },
    select: { id: true, name: true },
  });
  return NextResponse.json({ buyer: serializeForJson(buyer), created: true }, { status: 201 });
}
