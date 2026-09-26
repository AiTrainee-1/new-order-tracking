import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/authz";
import type { TrackingHistoryResponse, TrackingStage } from "@/lib/trackingHistory";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-MM-dd of a timestamp in the caller's own timezone. `tzOffset` is the
 *  browser's Date#getTimezoneOffset() (minutes, UTC minus local). */
function localDayKey(ts: Date, tzOffset: number): string {
  return new Date(ts.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);
}

/** A @db.Date column comes back as UTC midnight - its own yyyy-MM-dd. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Bucket {
  period: number;
  total: number;
  last: string | null;
}

/**
 * Admin-only. For every visible order and every stage in its own plan: how
 * many entries were recorded inside [from, to], how many ever, and where the
 * stage stands. Built entirely from the tables data entry already writes -
 * nothing is stored for this page.
 *
 * "An entry" is one record in whichever place that stage's form saves to:
 *   - production stages (knitting ... packing): a production_txns row
 *   - Raw Material Planning: a material requirement (or plan entry)
 *   - PO to Suppliers / Raw Material Inward: a material entry (dc|receipt / inward)
 *   - Accessories: an accessory requirement or an accessory entry
 *   - Order Confirmation and the plain confirm stages (no ledger of their
 *     own): a stage_entries row (the Save / Move Forward / Complete click)
 * Completed = someone pressed Complete on it (stage_entries.is_completed),
 * the same flag the dashboard's progress uses.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdmin(auth.session.userId))) return apiError(403, "Only Admin accounts can view Tracking History.");

  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return apiError(400, "Pick a valid date range.");
  const tzOffset = Number(params.get("tzOffset")) || 0;

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const inRange = (key: string) => key >= from && key <= to;

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
    prisma.productionTxn.groupBy({ by: ["sectionId"], where: visible, _count: { _all: true }, _max: { entryDate: true } }),
    prisma.productionTxn.groupBy({ by: ["sectionId"], where: { ...visible, entryDate: { gte: fromDate, lte: toDate } }, _count: { _all: true } }),
    prisma.stageEntry.groupBy({ by: ["sectionId"], where: visible, _count: { _all: true }, _max: { entryDate: true } }),
    prisma.stageEntry.groupBy({ by: ["sectionId"], where: { ...visible, entryDate: { gte: fromDate, lte: toDate } }, _count: { _all: true } }),
    prisma.stageEntry.groupBy({ by: ["sectionId"], where: { ...visible, isCompleted: true }, _count: { _all: true } }),
    prisma.materialEntry.findMany({ where: { requirement: visible }, select: { entryType: true, entryDate: true, requirement: { select: { orderId: true } } } }),
    prisma.materialRequirement.findMany({ where: visible, select: { orderId: true, createdAt: true } }),
    prisma.accessoryEntry.findMany({ where: { requirement: visible }, select: { entryDate: true, requirement: { select: { orderId: true } } } }),
    prisma.accessoryRequirement.findMany({ where: visible, select: { orderId: true, requiredDate: true, createdAt: true } }),
  ]);

  const bySection = <T extends { sectionId: string }>(rows: T[]) => new Map(rows.map((r) => [r.sectionId, r]));
  const txnAllMap = bySection(txnAll);
  const txnRangeMap = bySection(txnRange);
  const stageAllMap = bySection(stageAll);
  const stageRangeMap = bySection(stageRange);
  const completedSections = new Set(stageDone.map((r) => r.sectionId));

  // Order-scoped ledgers (material / accessories) aren't tied to a stage row,
  // so they're bucketed by (order, stage key) and attached to the matching
  // stage of each order's own plan below.
  const scoped = new Map<string, Bucket>();
  const bump = (orderId: string, stageKey: string, day: string) => {
    const id = `${orderId}::${stageKey}`;
    const b = scoped.get(id) ?? { period: 0, total: 0, last: null };
    b.total += 1;
    if (inRange(day)) b.period += 1;
    if (!b.last || day > b.last) b.last = day;
    scoped.set(id, b);
  };
  for (const e of materialEntries) {
    const stageKey = e.entryType === "inward" ? "raw_material_inward" : e.entryType === "plan" ? "raw_material_planning" : "po_to_suppliers";
    bump(e.requirement.orderId, stageKey, dayKey(e.entryDate));
  }
  for (const r of materialReqs) bump(r.orderId, "raw_material_planning", localDayKey(r.createdAt, tzOffset));
  for (const e of accessoryEntries) bump(e.requirement.orderId, "accessories", dayKey(e.entryDate));
  for (const r of accessoryReqs) bump(r.orderId, "accessories", r.requiredDate ? dayKey(r.requiredDate) : localDayKey(r.createdAt, tzOffset));

  const result: TrackingHistoryResponse = {
    from,
    to,
    orders: orders.map((o) => ({
      id: o.id,
      ioNo: o.ioNo,
      style: o.style,
      color: o.color,
      deliveryDate: o.deliveryDate ? dayKey(o.deliveryDate) : null,
      buyer: o.buyer,
      stages: o.stagePlan.map((s): TrackingStage => {
        const stageEntryCount = stageAllMap.get(s.id)?._count._all ?? 0;
        let bucket: Bucket;
        if (s.formType === "confirmation" || s.formType === "simple_confirm") {
          const last = stageAllMap.get(s.id)?._max.entryDate;
          bucket = { period: stageRangeMap.get(s.id)?._count._all ?? 0, total: stageEntryCount, last: last ? dayKey(last) : null };
        } else if (s.formType === "material_planning" || s.formType === "supplier_dc" || s.formType === "material_inward" || s.formType === "accessories") {
          bucket = scoped.get(`${o.id}::${s.key}`) ?? { period: 0, total: 0, last: null };
        } else {
          const last = txnAllMap.get(s.id)?._max.entryDate;
          bucket = { period: txnRangeMap.get(s.id)?._count._all ?? 0, total: txnAllMap.get(s.id)?._count._all ?? 0, last: last ? dayKey(last) : null };
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
          lastEntryDate: bucket.last,
        };
      }),
    })),
  };

  return NextResponse.json(result);
}
