import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { badDateMessage, isSaneDate } from "@/lib/dateInput";
import { canEnterSections, canJobWork, sectionsBelongToOrders } from "@/lib/server/authz";
import { parseBody, txnBatch } from "@/lib/server/validation";
import { serializeForJson } from "@/lib/server/serialize";
import { planGroupedCreate } from "@/lib/server/orderGroups";
import { groupPlan } from "@/lib/server/groupWrite";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = parseBody(txnBatch, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const rows = parsed.data.rows;
  const usable = rows.filter((r) => r.qtyIn || r.qtyOut || r.qtyRejected || r.qtyRework || r.qtyCount);
  if (usable.length === 0) return NextResponse.json({ txns: [] });
  // One mistyped year (20226) is stored happily and then no page that lists the row can load - so refuse it here.
  const badRow = usable.find((r) => !isSaneDate(r.entryDate));
  if (badRow) return apiError(400, badDateMessage(badRow.entryDate, "entry date"));

  // A job-work entry is a genuinely separate, assignment-free grant (see
  // JobWorkPage): can_job_work() lets someone log an externally-manufactured
  // quantity against ANY order/section without being assigned to it, bounded
  // to rows they tag isJobWork themselves. Every non-job-work row still goes
  // through the ordinary per-section assignment check. EVERY row is checked,
  // not just the first: a batch can name several orders/stages, and each one
  // must be writable (and each stage/PO must belong to its row's order).
  const jobWorkRows = usable.filter((r) => r.isJobWork);
  const assignedRows = usable.filter((r) => !r.isJobWork);
  const [jobWorkAllowed, assignedAllowed] = await Promise.all([
    jobWorkRows.length === 0 ? true : canJobWork(auth.session.userId),
    assignedRows.length === 0 ? true : canEnterSections(auth.session.userId, assignedRows),
  ]);
  if (!jobWorkAllowed || !assignedAllowed) return apiError(403, "You don't have write access to this stage.");
  // Job Work rows skip canEnterSection's shape checks, and no row's lot is covered by them: every stage, PO and
  // lot a row names must belong to that row's order.
  if (!(await sectionsBelongToOrders(usable))) return apiError(400, "A lot, PO or stage on this entry belongs to a different order.");

  // An entry on an order whose stage is in an Order Group is mirrored onto
  // every other member (see lib/server/orderGroups.ts). For any other order
  // this returns the rows exactly as they came in, with nothing extra to write.
  const grouped = await groupPlan(planGroupedCreate(usable, auth.session.userId));
  if ("error" in grouped) return grouped.error;
  const plan = grouped.plan;

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
