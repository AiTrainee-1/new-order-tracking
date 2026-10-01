import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import type { TrackingHistoryResponse, TrackingStage } from "@/lib/trackingHistory";

/**
 * Admin-only. The Final Order Report: for every visible order and every
 * stage in ITS OWN plan, how many entries were recorded inside [from, to],
 * how many ever, and where the stage stands. `from`/`to` are ISO instants
 * (see resolveRange in lib/trackingHistory.ts) - everything is filtered on
 * createdAt, the same canonical timestamp every other Tracking History
 * report uses (see lib/server/trackingActivity.ts's module comment for why).
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only Admin accounts can view Tracking History.");

  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!from || !to || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return apiError(400, "Pick a valid date range.");
  }

  const orders = await prisma.order.findMany({
    where: { isHidden: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ioNo: true,
      style: true,
      color: true,
      deliveryDate: true,
      buyer: { select: { id: true, name: true } },
      stagePlan: { orderBy: { seq: "asc" }, select: { id: true, seq: true, key: true, label: true, unitType: true, formType: true } },
    },
  });
  const visible = { order: { isHidden: false } };

  const [txnAll, txnRange, stageAll, stageRange, stageDone, materialEntries, materialReqs, accessoryEntries, accessoryReqs] = await Promise.all([
    prisma.productionTxn.groupBy({ by: ["sectionId"], where: visible, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.productionTxn.groupBy({ by: ["sectionId"], where: { ...visible, createdAt: { gte: fromDate, lte: toDate } }, _count: { _all: true } }),
    prisma.stageEntry.groupBy({ by: ["sectionId"], where: visible, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.stageEntry.groupBy({ by: ["sectionId"], where: { ...visible, createdAt: { gte: fromDate, lte: toDate } }, _count: { _all: true } }),
    prisma.stageEntry.groupBy({ by: ["sectionId"], where: { ...visible, isCompleted: true }, _count: { _all: true } }),
    prisma.materialEntry.findMany({ where: { requirement: visible }, select: { entryType: true, createdAt: true, requirement: { select: { orderId: true } } } }),
    prisma.materialRequirement.findMany({ where: visible, select: { orderId: true, createdAt: true } }),
    prisma.accessoryEntry.findMany({ where: { requirement: visible }, select: { createdAt: true, requirement: { select: { orderId: true } } } }),
    prisma.accessoryRequirement.findMany({ where: visible, select: { orderId: true, createdAt: true } }),
  ]);

  const bySection = <T extends { sectionId: string }>(rows: T[]) => new Map(rows.map((r) => [r.sectionId, r]));
  const txnAllMap = bySection(txnAll);
  const txnRangeMap = bySection(txnRange);
  const stageAllMap = bySection(stageAll);
  const stageRangeMap = bySection(stageRange);
  const completedSections = new Set(stageDone.map((r) => r.sectionId));

  // Order-scoped ledgers (material / accessories) aren't tied to a stage row,
  // so they're bucketed by (order, stage key) and attached to the matching
  // stage of each order's own plan below. All on createdAt, like everything else.
  interface Bucket {
    period: number;
    total: number;
    last: string | null;
  }
  const scoped = new Map<string, Bucket>();
  const bump = (orderId: string, stageKey: string, at: Date) => {
    const id = `${orderId}::${stageKey}`;
    const b = scoped.get(id) ?? { period: 0, total: 0, last: null };
    b.total += 1;
    if (at >= fromDate && at <= toDate) b.period += 1;
    const iso = at.toISOString();
    if (!b.last || iso > b.last) b.last = iso;
    scoped.set(id, b);
  };
  for (const e of materialEntries) bump(e.requirement.orderId, e.entryType === "inward" ? "raw_material_inward" : e.entryType === "dc" ? "po_to_suppliers" : "raw_material_planning", e.createdAt);
  for (const r of materialReqs) bump(r.orderId, "raw_material_planning", r.createdAt);
  for (const e of accessoryEntries) bump(e.requirement.orderId, "accessories", e.createdAt);
  for (const r of accessoryReqs) bump(r.orderId, "accessories", r.createdAt);

  const result: TrackingHistoryResponse = {
    from,
    to,
    orders: orders.map((o) => ({
      id: o.id,
      ioNo: o.ioNo,
      style: o.style,
      color: o.color,
      deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString().slice(0, 10) : null,
      buyer: o.buyer,
      stages: o.stagePlan.map((s): TrackingStage => {
        const stageEntryCount = stageAllMap.get(s.id)?._count._all ?? 0;
        let bucket: Bucket;
        if (s.formType === "confirmation" || s.formType === "simple_confirm") {
          const last = stageAllMap.get(s.id)?._max.createdAt;
          bucket = { period: stageRangeMap.get(s.id)?._count._all ?? 0, total: stageEntryCount, last: last ? last.toISOString() : null };
        } else if (s.formType === "material_planning" || s.formType === "supplier_dc" || s.formType === "material_inward" || s.formType === "accessories") {
          bucket = scoped.get(`${o.id}::${s.key}`) ?? { period: 0, total: 0, last: null };
        } else {
          const last = txnAllMap.get(s.id)?._max.createdAt;
          bucket = { period: txnRangeMap.get(s.id)?._count._all ?? 0, total: txnAllMap.get(s.id)?._count._all ?? 0, last: last ? last.toISOString() : null };
        }

        const status = completedSections.has(s.id) ? "completed" : bucket.total > 0 || stageEntryCount > 0 ? "in_progress" : "not_started";
        return {
          sectionId: s.id,
          seq: s.seq,
          key: s.key,
          label: s.label,
          unitType: s.unitType,
          status,
          entries: bucket.period,
          totalEntries: bucket.total,
          lastEntryAt: bucket.last,
        };
      }),
    })),
  };

  return NextResponse.json(result);
}
