import "server-only";
import { prisma } from "./prisma";
import type { ActivityRecord } from "../trackingHistory";

/**
 * The single source of truth for "what counts as an entry" across the whole
 * Tracking History feature (Final Order Report, User-Wise Report, Today vs
 * Yesterday, Stage/Order-Wise, Detailed Activity). Every one of those is a
 * different view over the same flat list this module builds, so they can
 * never disagree with each other about a count.
 *
 * An entry is one row written by a real data-entry action:
 *   - a production_txns row (Knitting ... Packing, and every lot/garment form)
 *   - a material_entries row (PO to Suppliers' DC, Raw Material Inward)
 *   - a material_requirements row, counted at creation (Raw Material Planning's "Required")
 *   - an accessory_entries row (Purchase / Inward / Dispatch)
 *   - an accessory_requirements row, counted at creation (Accessories' "Required")
 *   - a stage_entries row, but ONLY for stages with no ledger of their own
 *     (Order Confirmation, Pattern Making) - every other stage's stage_entries
 *     row is just the gating "Move Forward/Complete" click that already has
 *     a ledger row alongside it, so counting both would double-count the
 *     same action.
 *
 * Every record's `at` is `createdAt` - when the row was actually saved, not
 * the editable business `entryDate`/`requiredDate` a user could set to any
 * day. That is what makes "Today"/"Yesterday"/user activity trustworthy: a
 * backdated business date can never make something look like it happened on
 * a different day than it really did.
 */

interface Range {
  from: Date;
  to: Date;
}

const TXN_TYPE_LABEL: Record<string, string> = { process: "Process", send: "Send", receive: "Receive", rework: "Rework" };
const MATERIAL_TYPE_LABEL: Record<string, string> = { plan: "Planned", dc: "DC", receipt: "Receipt", inward: "Inward" };
const ACCESSORY_TYPE_LABEL: Record<string, string> = { purchase: "Purchase", inward: "Inward", dispatch: "Dispatch" };
/** dc/inward are the two entry types any current form actually writes;
 *  plan/receipt are legacy enum values with no live form - bucketed under
 *  Planning defensively rather than dropped. */
const MATERIAL_STAGE_KEY: Record<string, string> = { dc: "po_to_suppliers", inward: "raw_material_inward", plan: "raw_material_planning", receipt: "raw_material_planning" };

function headlineQty(t: { txnType: string; qtyIn: unknown; qtyOut: unknown; qtyRework: unknown }): number {
  const n = (v: unknown) => Number(v) || 0;
  if (t.txnType === "rework") return n(t.qtyRework);
  return n(t.qtyOut) > 0 ? n(t.qtyOut) : n(t.qtyIn);
}

export async function fetchActivityRecords({ from, to }: Range): Promise<ActivityRecord[]> {
  const visibleOrder = { isHidden: false };
  const createdAt = { gte: from, lte: to };

  const [production, materialEntries, materialReqs, accessoryEntries, accessoryReqs, stageEntries] = await Promise.all([
    prisma.productionTxn.findMany({
      where: { createdAt, order: visibleOrder },
      select: {
        id: true,
        createdAt: true,
        txnType: true,
        qtyIn: true,
        qtyOut: true,
        qtyRework: true,
        qtyRejected: true,
        qtyCount: true,
        unit: true,
        isJobWork: true,
        groupId: true,
        enteredByUser: { select: { id: true, name: true } },
        order: { select: { id: true, ioNo: true, style: true, buyer: { select: { id: true, name: true } } } },
        section: { select: { key: true, label: true } },
      },
    }),
    prisma.materialEntry.findMany({
      where: { createdAt, requirement: { order: visibleOrder } },
      select: {
        id: true,
        createdAt: true,
        entryType: true,
        qty: true,
        enteredByUser: { select: { id: true, name: true } },
        requirement: {
          select: { name: true, unit: true, order: { select: { id: true, ioNo: true, style: true, buyer: { select: { id: true, name: true } } } } },
        },
      },
    }),
    prisma.materialRequirement.findMany({
      where: { createdAt, order: visibleOrder },
      select: {
        id: true,
        createdAt: true,
        name: true,
        unit: true,
        requiredQty: true,
        creator: { select: { id: true, name: true } },
        order: { select: { id: true, ioNo: true, style: true, buyer: { select: { id: true, name: true } } } },
      },
    }),
    prisma.accessoryEntry.findMany({
      where: { createdAt, requirement: { order: visibleOrder } },
      select: {
        id: true,
        createdAt: true,
        entryType: true,
        qty: true,
        enteredByUser: { select: { id: true, name: true } },
        requirement: {
          select: { name: true, unit: true, order: { select: { id: true, ioNo: true, style: true, buyer: { select: { id: true, name: true } } } } },
        },
      },
    }),
    prisma.accessoryRequirement.findMany({
      where: { createdAt, order: visibleOrder },
      select: {
        id: true,
        createdAt: true,
        name: true,
        unit: true,
        requiredQty: true,
        creator: { select: { id: true, name: true } },
        order: { select: { id: true, ioNo: true, style: true, buyer: { select: { id: true, name: true } } } },
      },
    }),
    prisma.stageEntry.findMany({
      where: { createdAt, order: visibleOrder, section: { formType: { in: ["confirmation", "simple_confirm"] } } },
      select: {
        id: true,
        createdAt: true,
        isCompleted: true,
        isForwarded: true,
        enteredByUser: { select: { id: true, name: true } },
        order: { select: { id: true, ioNo: true, style: true, buyer: { select: { id: true, name: true } } } },
        section: { select: { key: true, label: true } },
      },
    }),
  ]);

  const records: ActivityRecord[] = [];

  for (const t of production) {
    records.push({
      id: `txn:${t.id}`,
      source: "production",
      at: t.createdAt.toISOString(),
      userId: t.enteredByUser.id,
      userName: t.enteredByUser.name,
      orderId: t.order.id,
      ioNo: t.order.ioNo,
      style: t.order.style,
      buyerId: t.order.buyer?.id ?? null,
      buyerName: t.order.buyer?.name ?? null,
      stageKey: t.section.key,
      stageLabel: t.section.label,
      // Bit Cutting records a KG and a count; if only a count was entered,
      // that count is the number worth showing.
      // A row that only rejects pieces still has a quantity worth showing - the
      // pieces rejected - rather than reading as an empty entry.
      qty: headlineQty(t) || Number(t.qtyCount) || (t.txnType === "process" ? Number(t.qtyRejected) : 0) || 0,
      unit: headlineQty(t) === 0 && Number(t.qtyCount) > 0 ? "Nos" : t.unit,
      action: `${headlineQty(t) === 0 && t.txnType === "process" && Number(t.qtyRejected) > 0 ? "Rejection" : (TXN_TYPE_LABEL[t.txnType] ?? t.txnType)}${t.isJobWork ? " (Job Work)" : ""}${t.groupId ? " (Group)" : ""}${Number(t.qtyCount) > 0 && headlineQty(t) > 0 ? ` · ${Number(t.qtyCount).toLocaleString()} nos` : ""}${t.txnType === "process" && Number(t.qtyRejected) > 0 && headlineQty(t) > 0 ? ` · ${Number(t.qtyRejected).toLocaleString()} rejected` : ""}`,
      completed: false,
    });
  }

  for (const e of materialEntries) {
    records.push({
      id: `mat:${e.id}`,
      source: "material",
      at: e.createdAt.toISOString(),
      userId: e.enteredByUser.id,
      userName: e.enteredByUser.name,
      orderId: e.requirement.order.id,
      ioNo: e.requirement.order.ioNo,
      style: e.requirement.order.style,
      buyerId: e.requirement.order.buyer?.id ?? null,
      buyerName: e.requirement.order.buyer?.name ?? null,
      stageKey: MATERIAL_STAGE_KEY[e.entryType] ?? "raw_material_planning",
      stageLabel: MATERIAL_STAGE_KEY[e.entryType] === "raw_material_inward" ? "Raw Material Inward" : "Purchase Order to Suppliers",
      qty: Number(e.qty) || 0,
      unit: e.requirement.unit,
      action: `${MATERIAL_TYPE_LABEL[e.entryType] ?? e.entryType} — ${e.requirement.name}`,
      completed: false,
    });
  }

  for (const r of materialReqs) {
    records.push({
      id: `matreq:${r.id}`,
      source: "material",
      at: r.createdAt.toISOString(),
      userId: r.creator?.id ?? "",
      userName: r.creator?.name ?? "Unknown",
      orderId: r.order.id,
      ioNo: r.order.ioNo,
      style: r.order.style,
      buyerId: r.order.buyer?.id ?? null,
      buyerName: r.order.buyer?.name ?? null,
      stageKey: "raw_material_planning",
      stageLabel: "Raw Material Planning",
      qty: Number(r.requiredQty) || 0,
      unit: r.unit,
      action: `Required — ${r.name}`,
      completed: false,
    });
  }

  for (const e of accessoryEntries) {
    records.push({
      id: `acc:${e.id}`,
      source: "accessory",
      at: e.createdAt.toISOString(),
      userId: e.enteredByUser.id,
      userName: e.enteredByUser.name,
      orderId: e.requirement.order.id,
      ioNo: e.requirement.order.ioNo,
      style: e.requirement.order.style,
      buyerId: e.requirement.order.buyer?.id ?? null,
      buyerName: e.requirement.order.buyer?.name ?? null,
      stageKey: "accessories",
      stageLabel: "Accessories",
      qty: Number(e.qty) || 0,
      unit: e.requirement.unit,
      action: `${ACCESSORY_TYPE_LABEL[e.entryType] ?? e.entryType} — ${e.requirement.name}`,
      completed: false,
    });
  }

  for (const r of accessoryReqs) {
    records.push({
      id: `accreq:${r.id}`,
      source: "accessory",
      at: r.createdAt.toISOString(),
      userId: r.creator?.id ?? "",
      userName: r.creator?.name ?? "Unknown",
      orderId: r.order.id,
      ioNo: r.order.ioNo,
      style: r.order.style,
      buyerId: r.order.buyer?.id ?? null,
      buyerName: r.order.buyer?.name ?? null,
      stageKey: "accessories",
      stageLabel: "Accessories",
      qty: Number(r.requiredQty) || 0,
      unit: r.unit,
      action: `Required — ${r.name}`,
      completed: false,
    });
  }

  for (const s of stageEntries) {
    records.push({
      id: `stage:${s.id}`,
      source: "stage",
      at: s.createdAt.toISOString(),
      userId: s.enteredByUser.id,
      userName: s.enteredByUser.name,
      orderId: s.order.id,
      ioNo: s.order.ioNo,
      style: s.order.style,
      buyerId: s.order.buyer?.id ?? null,
      buyerName: s.order.buyer?.name ?? null,
      stageKey: s.section.key,
      stageLabel: s.section.label,
      qty: null,
      unit: null,
      action: s.isCompleted ? "Completed" : s.isForwarded ? "Moved Forward" : "Saved Plan",
      completed: s.isCompleted,
    });
  }

  records.sort((a, b) => a.at.localeCompare(b.at));
  return records;
}
