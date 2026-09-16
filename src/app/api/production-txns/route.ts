import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canEnterSection, canJobWork } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";

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
  refName: string | null;
  docNo: string | null;
  entryDate: string;
  notes: string | null;
  isJobWork?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { rows?: TxnInput[] } | null;
  const rows = body?.rows ?? [];
  const usable = rows.filter((r) => r.qtyIn || r.qtyOut || r.qtyRejected || r.qtyRework);
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

  const created = await prisma.$transaction(
    usable.map((r) =>
      prisma.productionTxn.create({
        data: {
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
          refName: r.refName,
          docNo: r.docNo,
          entryDate: new Date(r.entryDate),
          notes: r.notes,
          enteredBy: auth.session.userId,
          isJobWork: r.isJobWork ?? false,
        },
      }),
    ),
  );

  return NextResponse.json({ txns: serializeForJson(created) }, { status: 201 });
}
