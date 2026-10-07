import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterSection, canJobWork } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { GroupSyncError, planGroupedCreate } from "@/lib/server/orderGroups";

interface TxnInput {
  orderId: string;
  poId: string | null;
  sectionId: string;
  lotId: string | null;
  sizeCode: string | null;
  txnType: string;
  unit: string;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  qtyRework: number;
  qtyCount?: number;
  refName: string | null;
  docNo: string | null;
  dcName?: string | null;
  entryDate: string;
  notes: string | null;
  isJobWork?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { rows?: TxnInput[] } | null;
  const rows = body?.rows ?? [];
  const usable = rows.filter((r) => r.qtyIn || r.qtyOut || r.qtyRejected || r.qtyRework || r.qtyCount);
  if (usable.length === 0) return NextResponse.json({ txns: [] });

  const first = usable[0];
  // A job-work entry is a genuinely separate, assignment-free grant (see
  // JobWorkPage): can_job_work() lets someone log an externally-manufactured
  // quantity against ANY order/section without being assigned to it, bounded
  // to rows they tag isJobWork themselves. Every non-job-work row still goes
  // through the ordinary per-section assignment check.
  const isJobWorkBatch = usable.every((r) => r.isJobWork);
  const allowed = isJobWorkBatch ? await canJobWork(auth.session.userId) : await canEnterSection(auth.session.userId, first.orderId, first.poId, first.sectionId);
  if (!allowed) return apiError(403, "You don't have write access to this stage.");

  // An entry on an order whose stage is in an Order Group is mirrored onto
  // every other member (see lib/server/orderGroups.ts). For any other order
  // this returns the rows exactly as they came in, with nothing extra to write.
  let plan;
  try {
    plan = await planGroupedCreate(usable, auth.session.userId);
  } catch (error) {
    if (error instanceof GroupSyncError) return apiError(error.status, error.message);
    throw error;
  }

  const toData = (r: (typeof plan.rows)[number]) => ({
    orderId: r.orderId,
    poId: r.poId,
    sectionId: r.sectionId,
    lotId: r.lotId,
    sizeCode: r.sizeCode,
    txnType: r.txnType as never,
    unit: r.unit as never,
    qtyIn: r.qtyIn,
    qtyOut: r.qtyOut,
    qtyRejected: r.qtyRejected,
    qtyRework: r.qtyRework,
    qtyCount: r.qtyCount ?? 0,
    refName: r.refName,
    docNo: r.docNo,
    dcName: r.dcName ?? null,
    entryDate: new Date(r.entryDate),
    notes: r.notes,
    enteredBy: auth.session.userId,
    isJobWork: r.isJobWork ?? false,
    groupId: r.groupId,
    groupLinkId: r.groupLinkId,
  });

  if (!plan.sync) {
    // Not in a group: the single batch of creates this route has always run.
    const created = await prisma.$transaction(plan.rows.map((r) => prisma.productionTxn.create({ data: toData(r) })));
    return NextResponse.json({ txns: serializeForJson(created) }, { status: 201 });
  }

  // In a group: every order's copy of the entry is saved, or none is. One INSERT
  // of all the rows is atomic by itself, so it needs no wrapping transaction
  // (each statement is a round trip to the database, and the floor user is
  // waiting on them) - unless a sibling needs a lot created first, which has to
  // land in the same transaction as the rows that point at it.
  const rowData = plan.rows.map(toData);
  const all =
    plan.lotCreates.length > 0
      ? await prisma.$transaction(async (tx) => {
          await tx.productionLot.createMany({ data: plan.lotCreates });
          return tx.productionTxn.createManyAndReturn({ data: rowData });
        })
      : await prisma.productionTxn.createManyAndReturn({ data: rowData });
  // The audit trail for the other orders is written once their rows are safely
  // in; like every other audit write in the app, a failure here must never undo
  // a genuine production entry.
  if (plan.audit.length > 0) {
    await prisma.auditLog.createMany({ data: plan.audit }).catch((error) => console.warn("Group audit write failed:", error));
  }
  // What the caller gets back is the order it entered on - the others' copies are an effect.
  const created = all.filter((r) => r.orderId === plan.rows[0].orderId);

  return NextResponse.json({ txns: serializeForJson(created), groupSync: plan.sync }, { status: 201 });
}
