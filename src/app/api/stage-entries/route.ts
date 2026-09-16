import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterSection } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

/** Supports: ?orderId= (all entries for one order), ?orderId=&sectionId=
 *  (recent 20, for one stage), or ?orderIds=a,b,c (bulk, for the "my work"
 *  gating computation across every order a user has an assignment on). */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const orderId = request.nextUrl.searchParams.get("orderId");
  const sectionId = request.nextUrl.searchParams.get("sectionId");
  const orderIdsParam = request.nextUrl.searchParams.get("orderIds");

  if (orderIdsParam) {
    const orderIds = orderIdsParam.split(",").filter(Boolean);
    const entries = await prisma.stageEntry.findMany({ where: { orderId: { in: orderIds } } });
    return NextResponse.json({ entries: serializeForJson(entries) });
  }

  if (!orderId) return apiError(400, "orderId or orderIds is required.");

  if (sectionId) {
    const entries = await prisma.stageEntry.findMany({
      where: { orderId, sectionId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ entries: serializeForJson(entries) });
  }

  const entries = await prisma.stageEntry.findMany({
    where: { orderId },
    orderBy: { entryDate: "asc" },
  });
  return NextResponse.json({ entries: serializeForJson(entries) });
}

interface StageEntryInput {
  orderId: string;
  poId: string | null;
  sectionId: string;
  entryDate: string;
  unitType: string;
  qtyReceived: number;
  qtyCompletedToday: number;
  qtyForwarded: number;
  qtyShortage: number;
  qtyRejected: number;
  qtyReturned: number;
  isExternal: boolean;
  externalUnitName: string | null;
  isSentOutside: boolean;
  isReturned: boolean;
  isForwarded: boolean;
  isCompleted: boolean;
  branch: string | null;
  unitName: string | null;
  transferType: string;
  transferTo: string | null;
  notes: string | null;
  forwardedToUserId: string | null;
}

function toCreateData(input: StageEntryInput, userId: string) {
  return {
    orderId: input.orderId,
    poId: input.poId,
    sectionId: input.sectionId,
    entryDate: new Date(input.entryDate),
    unitType: input.unitType as never,
    qtyReceived: input.qtyReceived,
    qtyCompletedToday: input.qtyCompletedToday,
    qtyForwarded: input.qtyForwarded,
    qtyShortage: input.qtyShortage,
    qtyRejected: input.qtyRejected,
    qtyReturned: input.qtyReturned,
    isExternal: input.isExternal,
    externalUnitName: input.externalUnitName,
    isSentOutside: input.isSentOutside,
    isReturned: input.isReturned,
    isForwarded: input.isForwarded,
    isCompleted: input.isCompleted,
    branch: input.branch,
    unitName: input.unitName,
    transferType: input.transferType as never,
    transferTo: input.transferTo,
    notes: input.notes,
    enteredBy: userId,
    forwardedToUserId: input.forwardedToUserId,
  };
}

/** Accepts either one entry ({ entry }) or a batch ({ entries }) - the batch
 *  form is used when a stage's quantity is split across several units/
 *  branches/outside parties, each split getting its own auditable row. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { entry?: StageEntryInput; entries?: StageEntryInput[] }
    | null;
  const inputs = body?.entries ?? (body?.entry ? [body.entry] : []);
  if (inputs.length === 0) return apiError(400, "At least one entry is required.");

  const first = inputs[0];
  const allowed = await canEnterSection(auth.session.userId, first.orderId, first.poId, first.sectionId);
  if (!allowed) return apiError(403, "You don't have write access to this stage.");

  const created = await prisma.$transaction(
    inputs.map((input) => prisma.stageEntry.create({ data: toCreateData(input, auth.session.userId) })),
  );

  await prisma.appUser.update({
    where: { id: auth.session.userId },
    data: { lastActivityAt: new Date() },
  });

  return NextResponse.json({ entries: serializeForJson(created) }, { status: 201 });
}
