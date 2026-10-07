import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { serializeForJson } from "./serialize";
import { groupSyncKind, stageUnit } from "../orderGroups";
import { effectiveSizes } from "../sizes";
import type { PoSizeQuantity, PurchaseOrder } from "../types";

/**
 * The server half of Order Groups - what turns "an entry saved on one order"
 * into "the same entry saved on every order in its group", and what keeps the
 * copies in step when one is corrected or removed.
 *
 * How it stays safe, because the same data lands on several orders at once:
 *
 *  - Opt-in by lookup. Every planner starts by asking whether THIS order's THIS
 *    stage is linked into a group; if not it returns immediately and the caller
 *    carries on exactly as it did before groups existed. An order in no group
 *    never runs a line of the rest of this file.
 *  - The server decides. The client only ever says "an entry for order A, stage
 *    S". Which other orders receive it is read from the database here, never
 *    from the request, so nothing a browser sends can widen it.
 *  - Real rows, one per order. Each member gets an ordinary row in the stage's
 *    own table (so the chain, reports and Output need no changes), all sharing
 *    a group_link_id so an edit or delete can find its siblings.
 *  - All or nothing. Every member is validated before anything is written, and
 *    the caller writes everything in ONE transaction. If any member cannot take
 *    the entry (stage not open yet, a size or a requirement it does not have...)
 *    nothing is saved anywhere and the message names the order - a member is
 *    never silently skipped.
 *  - Edits and deletes follow the same links, but only between orders that are
 *    STILL group members for that stage, and only for rows that were written
 *    through the group. Leaving a group, or a stage leaving it, detaches the old
 *    rows without touching them; nothing is ever matched up by guesswork.
 *
 * Where each stage keeps its data - see groupSyncKind in lib/orderGroups.ts:
 *   ledger      production_txns        (planGroupedCreate / planGroupedUpdate)
 *   stage_entry stage_entries          (planGroupedStageEntries)
 *   material    material_requirements / material_entries
 *   accessory   accessory_requirements / accessory_entries
 */

export class GroupSyncError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

export interface OrderRef {
  id: string;
  ioNo: string;
  style: string;
  color: string | null;
}

type OrderRefOut = { orderId: string; ioNo: string; style: string; color: string | null };

/** What the response tells the client about the other orders it reached. */
export interface GroupSync {
  groupId: string;
  groupName: string;
  alsoSavedTo?: OrderRefOut[];
  alsoUpdated?: OrderRefOut[];
  alsoRemoved?: OrderRefOut[];
  rowsPerOrder?: number;
}

type AuditInput = Prisma.AuditLogUncheckedCreateInput;

function orderLabel(o: { ioNo: string; style: string; color: string | null }): string {
  return `IO ${o.ioNo} · ${o.style}${o.color ? ` / ${o.color}` : ""}`;
}

const asRef = (o: OrderRef): OrderRefOut => ({ orderId: o.id, ioNo: o.ioNo, style: o.style, color: o.color });

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

/** Sizes an order can legitimately hold entries for: every size on any of its POs. */
async function sizeCodesOf(orderId: string): Promise<Set<string>> {
  const rows = await prisma.poSizeQuantity.findMany({ where: { purchaseOrder: { orderId } }, select: { sizeCode: true } });
  return new Set(rows.map((r) => r.sizeCode));
}

/** Production quantity of an order, the way the confirmation form totals it. */
async function productionTotalOf(orderId: string): Promise<number> {
  const pos = await prisma.purchaseOrder.findMany({ where: { orderId }, include: { sizeQuantities: true } });
  return pos.reduce((sum, po) => {
    const { sizeQuantities, ...poRow } = po;
    const sizes = serializeForJson(sizeQuantities) as unknown as PoSizeQuantity[];
    return sum + effectiveSizes(serializeForJson(poRow) as unknown as PurchaseOrder, sizes).reduce((s, r) => s + r.quantity, 0);
  }, 0);
}

/**
 * Whether this order's stage can take entries yet - the same rule the Data
 * Input screen applies (src/lib/progress.ts: a stage is open once every earlier
 * stage in the order's own plan has completed or moved on; the first stage is
 * always open). A stage the order has already completed stays open: entries
 * after completion are allowed everywhere else in the app too.
 */
function isStageOpen(plan: { id: string; stageEntries: { isCompleted: boolean; isForwarded: boolean; qtyForwarded: unknown }[] }[], sectionId: string): boolean {
  const index = plan.findIndex((p) => p.id === sectionId);
  if (index <= 0) return index === 0;
  return plan.slice(0, index).every((p) => p.stageEntries.some((e) => e.isCompleted) || p.stageEntries.some((e) => e.isForwarded || Number(e.qtyForwarded) > 0));
}

/** The members of a group at one stage, with enough of each order to name it. */
async function membersAt(groupId: string, stageKey: string): Promise<OrderRef[]> {
  const links = await prisma.orderGroupLink.findMany({
    where: { groupId, stageKey },
    include: { order: { select: { id: true, ioNo: true, style: true, color: true } } },
    orderBy: { createdAt: "asc" },
  });
  return links.map((l) => l.order);
}

interface GroupContext {
  groupId: string;
  groupName: string;
  stageKey: string;
  stageLabel: string;
  origin: OrderRef;
  /** The OTHER members at this stage. Never empty - a group of one has nothing to mirror to. */
  others: OrderRef[];
}

/** The group `orderId` belongs to at this stage, or null when it is in none (or is alone in it). */
async function loadContext(orderId: string, stageKey: string, knownGroupId?: string): Promise<GroupContext | null> {
  const groupId = knownGroupId ?? (await prisma.orderGroupLink.findUnique({ where: { orderId_stageKey: { orderId, stageKey } } }))?.groupId;
  if (!groupId) return null;
  const [group, members, plan] = await Promise.all([
    prisma.orderGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true } }),
    membersAt(groupId, stageKey),
    prisma.orderStagePlan.findFirst({ where: { orderId, key: stageKey }, select: { label: true } }),
  ]);
  if (!group) return null;
  const origin = members.find((m) => m.id === orderId);
  if (!origin) return null;
  const others = members.filter((m) => m.id !== orderId);
  if (others.length === 0) return null;
  return { groupId: group.id, groupName: group.name, stageKey, stageLabel: plan?.label ?? stageKey, origin, others };
}

interface LiveSiblings {
  members: OrderRef[];
  groupName: string;
}

/** For an edit/delete of a row that was written through a group: the other
 *  members it should follow - or null when the row's own order has since left
 *  the group at this stage, in which case the row is just an ordinary one. */
async function liveSiblingOrders(row: { orderId: string; groupId: string | null; groupLinkId: string | null }, stageKey: string): Promise<LiveSiblings | null> {
  if (!row.groupId || !row.groupLinkId) return null;
  const link = await prisma.orderGroupLink.findUnique({ where: { orderId_stageKey: { orderId: row.orderId, stageKey } } });
  if (!link || link.groupId !== row.groupId) return null;
  const [group, all] = await Promise.all([prisma.orderGroup.findUnique({ where: { id: row.groupId }, select: { name: true } }), membersAt(row.groupId, stageKey)]);
  const members = all.filter((m) => m.id !== row.orderId);
  if (members.length === 0) return null;
  return { members, groupName: group?.name ?? "Group" };
}

interface Target {
  order: OrderRef;
  sectionId: string;
}

/** Checks every other member can take an entry at this stage, and returns each
 *  one's own stage row. Throws - before anything is written - naming the first
 *  member that can't. */
async function resolveTargets(ctx: GroupContext, opts: { unit?: string; sizeCodes?: string[] } = {}): Promise<Target[]> {
  const wantSizes = !!opts.sizeCodes && opts.sizeCodes.length > 0;
  // Each member's checks are independent of the others', and each check's
  // lookups of its own - run them all at once (this is a database round trip
  // apiece), then report the first member, in group order, that can't take it.
  const checked = await Promise.all(
    ctx.others.map(async (other) => {
      const [planRows, sizes] = await Promise.all([
        prisma.orderStagePlan.findMany({ where: { orderId: other.id }, orderBy: { seq: "asc" }, include: { stageEntries: { select: { isCompleted: true, isForwarded: true, qtyForwarded: true } } } }),
        wantSizes ? sizeCodesOf(other.id) : Promise.resolve(null),
      ]);
      const plan = planRows.find((p) => p.key === ctx.stageKey);
      if (!plan) return { other, error: `${orderLabel(other)} no longer has ${ctx.stageLabel} in its stage plan. Nothing was saved - an admin needs to fix the group first.` };
      if (opts.unit && stageUnit(plan) !== opts.unit) {
        return { other, error: `${orderLabel(other)} counts ${ctx.stageLabel} in ${stageUnit(plan)}, not ${opts.unit}. Nothing was saved - an admin needs to fix the group first.` };
      }
      if (!isStageOpen(planRows, plan.id)) {
        return { other, error: `${orderLabel(other)} hasn't reached ${ctx.stageLabel} yet, so it can't take this entry. Nothing was saved to any order in the group.` };
      }
      if (sizes && opts.sizeCodes) {
        const missing = opts.sizeCodes.filter((code) => !sizes.has(code));
        if (missing.length > 0) return { other, error: `${orderLabel(other)} has no size ${missing.join(", ")}. Nothing was saved to any order in the group.` };
      }
      return { other, sectionId: plan.id };
    }),
  );
  const targets: Target[] = [];
  for (const c of checked) {
    if ("error" in c && c.error) throw new GroupSyncError(c.error);
    if ("sectionId" in c && c.sectionId) targets.push({ order: c.other, sectionId: c.sectionId });
  }
  return targets;
}

type Changes = Record<string, { from: unknown; to: unknown }>;

function audit(userId: string, target: { orderId: string; sectionId: string | null }, entity: string, entityId: string | null, action: "create" | "update" | "delete", summary: string, notes: string | null = null, changes?: Changes): AuditInput {
  return { orderId: target.orderId, poId: null, sectionId: target.sectionId, entity, entityId, action, summary, changes: (changes as Prisma.InputJsonValue | undefined) ?? undefined, notes, userId };
}

/** Compares a stored row with the values an edit is about to write. */
function diffAgainst(row: Record<string, unknown>, data: Record<string, unknown>): Changes {
  const norm = (v: unknown) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function") return (v as { toNumber: () => number }).toNumber();
    return v ?? null;
  };
  const out: Changes = {};
  for (const [key, next] of Object.entries(data)) {
    const prev = norm(row[key]);
    const n = norm(next);
    if (JSON.stringify(prev) !== JSON.stringify(n)) out[key] = { from: prev, to: n };
  }
  return out;
}

async function sectionIdsFor(orderIds: string[], stageKey: string): Promise<Map<string, string>> {
  const rows = await prisma.orderStagePlan.findMany({ where: { orderId: { in: orderIds }, key: stageKey }, select: { id: true, orderId: true } });
  return new Map(rows.map((r) => [r.orderId, r.id]));
}

async function originRef(orderId: string) {
  return prisma.order.findUnique({ where: { id: orderId }, select: { ioNo: true, style: true, color: true } });
}

// ---------------------------------------------------------------------------
// Ledger stages - production_txns
// ---------------------------------------------------------------------------

/** The fields of a txn a client may send - mirrors the txns route's TxnInput. */
export interface GroupTxnInput {
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

export interface PlannedCreate {
  /** Every row to create, origin order first, already tagged with group ids. */
  rows: (GroupTxnInput & { groupId: string | null; groupLinkId: string | null })[];
  /** How many of those rows belong to the order the user actually entered on. */
  originRowCount: number;
  /** Lots a sibling needs and does not have yet - written BEFORE the rows. */
  lotCreates: Prisma.ProductionLotUncheckedCreateInput[];
  sync: GroupSync | null;
  /** Audit rows for the sibling orders (the origin's is written by the form). */
  audit: AuditInput[];
}

/**
 * A lot belongs to ONE order, so a lot-based row (Knitting, Dyeing, the fabric
 * washes...) is mirrored onto the sibling's lot of the same lot number - created
 * for it, with the same number and fabric type, when it doesn't have one yet.
 */
async function mapLots(originOrderId: string, lotIds: string[], targets: Target[], userId: string): Promise<{ mapping: Map<string, Map<string, string>>; creates: Prisma.ProductionLotUncheckedCreateInput[] }> {
  const mapping = new Map<string, Map<string, string>>(); // targetOrderId -> originLotId -> targetLotId
  const creates: Prisma.ProductionLotUncheckedCreateInput[] = [];
  if (lotIds.length === 0) return { mapping, creates };
  const lots = await prisma.productionLot.findMany({ where: { id: { in: lotIds } } });
  if (lots.length !== lotIds.length || lots.some((l) => l.orderId !== originOrderId)) throw new GroupSyncError("That lot doesn't belong to this order.", 400);
  for (const t of targets) {
    const m = new Map<string, string>();
    for (const lot of lots) {
      const existing = await prisma.productionLot.findFirst({ where: { orderId: t.order.id, lotNo: lot.lotNo }, select: { id: true } });
      if (existing) {
        m.set(lot.id, existing.id);
      } else {
        const id = randomUUID();
        creates.push({ id, orderId: t.order.id, poId: null, lotNo: lot.lotNo, fabricType: lot.fabricType, notes: lot.notes, createdBy: userId });
        m.set(lot.id, id);
      }
    }
    mapping.set(t.order.id, m);
  }
  return { mapping, creates };
}

/**
 * Decides what a POST of production rows actually writes. Returns the rows
 * unchanged (sync: null) for any entry that is not in a group.
 *
 * Throws GroupSyncError - before anything is written - when the entry IS
 * grouped but cannot be mirrored safely.
 */
export async function planGroupedCreate(rows: GroupTxnInput[], userId: string): Promise<PlannedCreate> {
  const untouched: PlannedCreate = { rows: rows.map((r) => ({ ...r, groupId: null, groupLinkId: null })), originRowCount: rows.length, lotCreates: [], sync: null, audit: [] };

  // Job Work is its own, assignment-free kind of entry (see JobWorkPage); the
  // group mirrors Data Input entries only.
  if (rows.length === 0 || rows.some((r) => r.isJobWork)) return untouched;

  const sectionIds = Array.from(new Set(rows.map((r) => r.sectionId)));
  // One lookup: the stage rows, and each one's order's group links. An order in
  // no group has none, and the entry goes straight back untouched.
  const sections = await prisma.orderStagePlan.findMany({
    where: { id: { in: sectionIds } },
    select: { id: true, orderId: true, key: true, label: true, formType: true, order: { select: { groupLinks: { select: { stageKey: true, groupId: true } } } } },
  });
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const pairs = Array.from(new Map(rows.map((r) => [`${r.orderId}::${r.sectionId}`, r])).values());
  const anyLinked = pairs.some((r) => {
    const s = sectionById.get(r.sectionId);
    return !!s && s.order.groupLinks.some((l) => l.stageKey === s.key);
  });
  if (!anyLinked) return untouched;

  // From here the entry is grouped. Keep the rule simple: one order, one
  // stage per save, so exactly one group fans out and nothing is written twice.
  if (pairs.length !== 1) throw new GroupSyncError("An entry for a grouped stage has to be saved for one order and one stage at a time.", 400);
  const origin = rows[0];
  const section = sectionById.get(origin.sectionId);
  if (!section || section.orderId !== origin.orderId) throw new GroupSyncError("This entry doesn't match the order's stage plan.", 400);
  // Only stages whose data is production rows come through here; a stage that
  // keeps its data elsewhere never writes these.
  if (groupSyncKind(section) !== "ledger") return untouched;

  const ctx = await loadContext(origin.orderId, section.key, section.order.groupLinks.find((l) => l.stageKey === section.key)?.groupId);
  if (!ctx) return untouched;

  const wantedSizes = Array.from(new Set(rows.map((r) => r.sizeCode).filter((s): s is string => !!s)));
  const targets = await resolveTargets(ctx, { unit: origin.unit, sizeCodes: wantedSizes });
  const lotIds = Array.from(new Set(rows.map((r) => r.lotId).filter((l): l is string => !!l)));
  const { mapping, creates } = await mapLots(origin.orderId, lotIds, targets, userId);

  const out: PlannedCreate["rows"] = [];
  const siblingRows: PlannedCreate["rows"] = [];
  for (const r of rows) {
    const groupLinkId = randomUUID();
    out.push({ ...r, groupId: ctx.groupId, groupLinkId });
    for (const t of targets) {
      // poId stays null on a sibling: a PO belongs to ONE order, and data
      // entry is order-wide everywhere else in the app anyway.
      siblingRows.push({ ...r, orderId: t.order.id, sectionId: t.sectionId, poId: null, lotId: r.lotId ? (mapping.get(t.order.id)?.get(r.lotId) ?? null) : null, groupId: ctx.groupId, groupLinkId });
    }
  }

  const total = rows.reduce((sum, r) => sum + (r.qtyOut || r.qtyIn || r.qtyRework || 0), 0);
  return {
    rows: [...out, ...siblingRows],
    originRowCount: out.length,
    lotCreates: creates,
    sync: { groupId: ctx.groupId, groupName: ctx.groupName, alsoSavedTo: ctx.others.map(asRef), rowsPerOrder: rows.length },
    audit: targets.map((t) =>
      audit(userId, { orderId: t.order.id, sectionId: t.sectionId }, "production_txn", null, "create", `Group entry from ${orderLabel(ctx.origin)} - ${rows.length} entr${rows.length === 1 ? "y" : "ies"}, ${total.toLocaleString()} ${origin.unit} (${ctx.groupName})`, rows.map((r) => r.notes).filter(Boolean).join(" · ") || null),
    ),
  };
}

/** The fields an edit may change - same set the txns PATCH route accepts. */
export type TxnPatch = Partial<{
  lotId: string | null;
  sizeCode: string | null;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  qtyRework: number;
  qtyCount: number;
  dcName: string | null;
  refName: string | null;
  docNo: string | null;
  entryDate: Date;
}>;

export interface PlannedUpdate {
  /** Each sibling and exactly what to write on it. */
  siblings: { id: string; orderId: string; sectionId: string | null; data: Record<string, unknown>; before: Record<string, unknown> }[];
  lotCreates: Prisma.ProductionLotUncheckedCreateInput[];
  audit: AuditInput[];
  sync: GroupSync | null;
}

const NO_UPDATE: PlannedUpdate = { siblings: [], lotCreates: [], audit: [], sync: null };

/**
 * Finds the other copies of a grouped entry that should follow an edit.
 * Returns `siblings: []` (nothing extra to do) for any row that is not part of
 * a live group entry.
 */
export async function planGroupedUpdate(existing: { id: string; orderId: string; sectionId: string; groupId: string | null; groupLinkId: string | null }, patch: TxnPatch, userId: string): Promise<PlannedUpdate> {
  if (!existing.groupId || !existing.groupLinkId) return NO_UPDATE;
  const section = await prisma.orderStagePlan.findUnique({ where: { id: existing.sectionId }, select: { key: true } });
  if (!section) return NO_UPDATE;
  const live = await liveSiblingOrders(existing, section.key);
  if (!live) return NO_UPDATE;

  const siblings = await prisma.productionTxn.findMany({
    where: { groupLinkId: existing.groupLinkId, groupId: existing.groupId, id: { not: existing.id }, orderId: { in: live.members.map((m) => m.id) } },
  });
  if (siblings.length === 0) return NO_UPDATE;

  if (patch.sizeCode) {
    for (const s of siblings) {
      if (!(await sizeCodesOf(s.orderId)).has(patch.sizeCode)) {
        const order = live.members.find((m) => m.id === s.orderId);
        throw new GroupSyncError(`${order ? orderLabel(order) : "A grouped order"} has no size ${patch.sizeCode}. Nothing was changed on any order.`);
      }
    }
  }

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) if (key !== "lotId" && value !== undefined) data[key] = value;

  const sectionIds = await sectionIdsFor(siblings.map((s) => s.orderId), section.key);

  // A lot is per order: move each copy onto ITS order's lot of the same number.
  let lotCreates: Prisma.ProductionLotUncheckedCreateInput[] = [];
  let lotFor: (orderId: string) => string | null | undefined = () => undefined;
  if (patch.lotId !== undefined) {
    if (patch.lotId === null) {
      lotFor = () => null;
    } else {
      const targets: Target[] = live.members.filter((m) => siblings.some((s) => s.orderId === m.id)).map((m) => ({ order: m, sectionId: sectionIds.get(m.id) ?? "" }));
      const mapped = await mapLots(existing.orderId, [patch.lotId], targets, userId);
      lotCreates = mapped.creates;
      lotFor = (orderId) => mapped.mapping.get(orderId)?.get(patch.lotId as string) ?? null;
    }
  }

  const originOrder = await originRef(existing.orderId);
  const from = originOrder ? orderLabel(originOrder) : "another order";

  const planned = siblings.map((s) => {
    const siblingData: Record<string, unknown> = { ...data };
    const lot = lotFor(s.orderId);
    if (lot !== undefined) siblingData.lotId = lot;
    return { id: s.id, orderId: s.orderId, sectionId: sectionIds.get(s.orderId) ?? null, data: siblingData, before: s as unknown as Record<string, unknown> };
  });

  return {
    siblings: planned,
    lotCreates,
    audit: planned.flatMap((p) => {
      const changes = diffAgainst(p.before, p.data);
      return Object.keys(changes).length === 0 ? [] : [audit(userId, p, "production_txn", p.id, "update", `Group entry corrected from ${from} (${live.groupName})`, null, changes)];
    }),
    sync: { groupId: existing.groupId, groupName: live.groupName, alsoUpdated: live.members.filter((m) => siblings.some((s) => s.orderId === m.id)).map(asRef) },
  };
}

// ---------------------------------------------------------------------------
// Stages whose own stage_entries row IS the data - Order Confirmation and
// Pattern Making
// ---------------------------------------------------------------------------

export interface GroupStageEntryInput {
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

export interface PlannedStageEntries {
  rows: (GroupStageEntryInput & { groupId: string | null; groupLinkId: string | null })[];
  originRowCount: number;
  sync: GroupSync | null;
  audit: AuditInput[];
}

/**
 * Order Confirmation and Pattern Making have no ledger - the stage entry (the
 * note, and Save Plan / Move Forward / Complete) is the whole of what is
 * recorded - so for these two the entry itself is what a group mirrors:
 * confirming one order confirms the others with the same note.
 *
 * Quantities are the one thing not copied across. They are what the stage
 * measured on THAT order: Order Confirmation records the order's own total
 * (worked out here the way the form does), and Pattern Making passes fabric
 * through without consuming any, so its figures are left at zero - the chain
 * falls back to the previous stage's, exactly as it does for a stage that
 * recorded nothing. Every other stage's Move Forward / Complete stays separate
 * on each order.
 */
export async function planGroupedStageEntries(inputs: GroupStageEntryInput[], userId: string): Promise<PlannedStageEntries> {
  const untouched: PlannedStageEntries = { rows: inputs.map((i) => ({ ...i, groupId: null, groupLinkId: null })), originRowCount: inputs.length, sync: null, audit: [] };
  if (inputs.length === 0) return untouched;

  const first = inputs[0];
  const section = await prisma.orderStagePlan.findUnique({ where: { id: first.sectionId }, select: { id: true, orderId: true, key: true, label: true, formType: true } });
  if (!section || section.orderId !== first.orderId || groupSyncKind(section) !== "stage_entry") return untouched;

  const ctx = await loadContext(first.orderId, section.key);
  if (!ctx) return untouched;
  if (inputs.some((i) => i.orderId !== first.orderId || i.sectionId !== first.sectionId)) throw new GroupSyncError("An entry for a grouped stage has to be saved for one order and one stage at a time.", 400);

  const targets = await resolveTargets(ctx);
  const totals = new Map<string, number>();
  if (section.key === "order_confirmation") for (const t of targets) totals.set(t.order.id, await productionTotalOf(t.order.id));

  const rows: PlannedStageEntries["rows"] = [];
  const siblings: PlannedStageEntries["rows"] = [];
  for (const input of inputs) {
    const groupLinkId = randomUUID();
    rows.push({ ...input, groupId: ctx.groupId, groupLinkId });
    for (const t of targets) {
      const own = totals.get(t.order.id) ?? 0;
      const scaled = (q: number) => (q > 0 ? own : 0);
      siblings.push({
        ...input,
        orderId: t.order.id,
        poId: null,
        sectionId: t.sectionId,
        qtyReceived: scaled(input.qtyReceived),
        qtyCompletedToday: scaled(input.qtyCompletedToday),
        qtyForwarded: scaled(input.qtyForwarded),
        qtyShortage: 0,
        qtyRejected: 0,
        qtyReturned: 0,
        groupId: ctx.groupId,
        groupLinkId,
      });
    }
  }

  const action = first.isCompleted ? "Completed" : first.isForwarded ? "Moved forward" : "Saved plan";
  return {
    rows: [...rows, ...siblings],
    originRowCount: rows.length,
    sync: { groupId: ctx.groupId, groupName: ctx.groupName, alsoSavedTo: ctx.others.map(asRef) },
    audit: targets.map((t) => audit(userId, { orderId: t.order.id, sectionId: t.sectionId }, "stage_entry", null, "create", `${ctx.stageLabel}: ${action} - from ${orderLabel(ctx.origin)} (${ctx.groupName})`, first.notes)),
  };
}

// ---------------------------------------------------------------------------
// Requirement -> entries families (materials, accessories)
//
// Both keep a list of named requirements per order, with typed entries against
// each. A requirement is mirrored as a new requirement on every member. An entry
// is mirrored onto the sibling's copy of ITS requirement: the one written
// through the same group (same link id) or, for a requirement that predates the
// group, the one with exactly the same name. No match - or more than one - is an
// error that stops the whole save; a requirement is never created implicitly and
// an entry is never attached by guesswork.
// ---------------------------------------------------------------------------

export interface CreatePlan<T> {
  groupId: string | null;
  groupLinkId: string | null;
  siblings: T[];
  audit: AuditInput[];
  sync: GroupSync | null;
}

function noCreatePlan<T>(): CreatePlan<T> {
  return { groupId: null, groupLinkId: null, siblings: [], audit: [], sync: null };
}

export type MaterialRequirementData = Omit<Prisma.MaterialRequirementUncheckedCreateInput, "id" | "orderId" | "groupId" | "groupLinkId" | "createdAt" | "updatedAt">;
export type MaterialEntryData = Omit<Prisma.MaterialEntryUncheckedCreateInput, "id" | "requirementId" | "groupId" | "groupLinkId" | "createdAt" | "updatedAt">;
export type AccessoryRequirementData = Omit<Prisma.AccessoryRequirementUncheckedCreateInput, "id" | "orderId" | "groupId" | "groupLinkId" | "createdAt">;
export type AccessoryEntryData = Omit<Prisma.AccessoryEntryUncheckedCreateInput, "id" | "requirementId" | "groupId" | "groupLinkId" | "createdAt">;

const MATERIAL_PLANNING = "raw_material_planning";
const ACCESSORIES = "accessories";

/** Which procurement stage a material entry belongs to (the same split the
 *  Tracking History uses). */
export function materialEntryStageKey(entryType: string): string {
  if (entryType === "dc") return "po_to_suppliers";
  if (entryType === "inward") return "raw_material_inward";
  return MATERIAL_PLANNING;
}

/** The other copies of an edited/deleted row, or null when it isn't a live group row. */
export interface RowsPlan {
  rows: { id: string; orderId: string; sectionId: string | null; before: Record<string, unknown> }[];
  audit: AuditInput[];
  sync: GroupSync | null;
}
const NO_ROWS: RowsPlan = { rows: [], audit: [], sync: null };

async function siblingRows<T extends { id: string; orderId: string }>(
  existing: { id: string; orderId: string; groupId: string | null; groupLinkId: string | null },
  stageKey: string,
  find: (args: { groupLinkId: string; groupId: string; excludeId: string; orderIds: string[] }) => Promise<T[]>,
): Promise<{ rows: T[]; live: LiveSiblings; sectionIds: Map<string, string> } | null> {
  const live = await liveSiblingOrders(existing, stageKey);
  if (!live) return null;
  const rows = await find({ groupLinkId: existing.groupLinkId!, groupId: existing.groupId!, excludeId: existing.id, orderIds: live.members.map((m) => m.id) });
  if (rows.length === 0) return null;
  return { rows, live, sectionIds: await sectionIdsFor(rows.map((r) => r.orderId), stageKey) };
}

async function buildRowsPlan<T extends { id: string; orderId: string }>(
  entity: string,
  action: "update" | "delete",
  found: { rows: T[]; live: LiveSiblings; sectionIds: Map<string, string> },
  groupId: string | null,
  userId: string,
  label: string,
  originOrderId: string,
  data?: Record<string, unknown>,
): Promise<RowsPlan> {
  const rows = found.rows.map((r) => ({ id: r.id, orderId: r.orderId, sectionId: found.sectionIds.get(r.orderId) ?? null, before: r as unknown as Record<string, unknown> }));
  const origin = await originRef(originOrderId);
  const from = origin ? orderLabel(origin) : "another order";
  const verb = action === "update" ? "corrected" : "removed";
  const audits = rows.flatMap((r) => {
    const changes = data ? diffAgainst(r.before, data) : undefined;
    if (data && Object.keys(changes ?? {}).length === 0) return [];
    return [audit(userId, r, entity, r.id, action, `${label} ${verb} from ${from} (${found.live.groupName})`, null, changes)];
  });
  const refs = found.live.members.filter((m) => rows.some((r) => r.orderId === m.id)).map(asRef);
  const base = { groupId: groupId ?? "", groupName: found.live.groupName };
  return { rows, audit: audits, sync: action === "update" ? { ...base, alsoUpdated: refs } : { ...base, alsoRemoved: refs } };
}

// ---- Materials: requirements ------------------------------------------------

export async function planMaterialRequirementCreate(orderId: string, data: MaterialRequirementData, userId: string): Promise<CreatePlan<Prisma.MaterialRequirementUncheckedCreateInput>> {
  const ctx = await loadContext(orderId, MATERIAL_PLANNING);
  if (!ctx) return noCreatePlan();
  const targets = await resolveTargets(ctx);
  const groupLinkId = randomUUID();

  for (const t of targets) {
    const dup = await prisma.materialRequirement.findFirst({ where: { orderId: t.order.id, category: data.category, name: { equals: data.name, mode: "insensitive" } } });
    if (dup) throw new GroupSyncError(`${orderLabel(t.order)} already has a ${data.category} requirement called "${data.name}". Nothing was saved to any order in the group.`);
  }

  return {
    groupId: ctx.groupId,
    groupLinkId,
    siblings: targets.map((t) => ({ ...data, orderId: t.order.id, poId: null, groupId: ctx.groupId, groupLinkId })),
    audit: targets.map((t) => audit(userId, { orderId: t.order.id, sectionId: t.sectionId }, "material_requirement", null, "create", `${ctx.stageLabel}: requirement "${data.name}" added from ${orderLabel(ctx.origin)} (${ctx.groupName})`)),
    sync: { groupId: ctx.groupId, groupName: ctx.groupName, alsoSavedTo: ctx.others.map(asRef) },
  };
}

export async function planMaterialRequirementChange(existing: { id: string; orderId: string; category: string; name: string; groupId: string | null; groupLinkId: string | null }, action: "update" | "delete", data: Record<string, unknown>, userId: string): Promise<RowsPlan> {
  const found = await siblingRows(existing, MATERIAL_PLANNING, ({ groupLinkId, groupId, excludeId, orderIds }) =>
    prisma.materialRequirement.findMany({ where: { groupLinkId, groupId, id: { not: excludeId }, orderId: { in: orderIds } } }),
  );
  if (!found) return NO_ROWS;
  if (action === "update" && (data.name !== undefined || data.category !== undefined)) {
    for (const r of found.rows) {
      const dup = await prisma.materialRequirement.findFirst({
        where: { orderId: r.orderId, id: { not: r.id }, category: (data.category as never) ?? r.category, name: { equals: (data.name as string) ?? r.name, mode: "insensitive" } },
      });
      if (dup) throw new GroupSyncError(`Another order in the group already has a requirement called "${(data.name as string) ?? r.name}". Nothing was changed on any order.`);
    }
  }
  return buildRowsPlan("material_requirement", action, found, existing.groupId, userId, `Requirement "${existing.name}"`, existing.orderId, action === "update" ? data : undefined);
}

// ---- Materials: entries -----------------------------------------------------

/** The sibling order's copy of a requirement - see the section comment above. */
async function siblingRequirementId(kind: "material" | "accessory", requirement: { id: string; groupLinkId: string | null; name: string; category?: string }, target: Target): Promise<string> {
  if (requirement.groupLinkId) {
    const linked =
      kind === "material"
        ? await prisma.materialRequirement.findFirst({ where: { orderId: target.order.id, groupLinkId: requirement.groupLinkId }, select: { id: true } })
        : await prisma.accessoryRequirement.findFirst({ where: { orderId: target.order.id, groupLinkId: requirement.groupLinkId }, select: { id: true } });
    if (linked) return linked.id;
  }
  const nameMatch = { orderId: target.order.id, name: { equals: requirement.name, mode: "insensitive" as const } };
  const matches =
    kind === "material"
      ? await prisma.materialRequirement.findMany({ where: { ...nameMatch, category: requirement.category as never }, select: { id: true } })
      : await prisma.accessoryRequirement.findMany({ where: nameMatch, select: { id: true } });
  if (matches.length === 1) return matches[0].id;
  const what = kind === "material" ? "requirement" : "accessory";
  throw new GroupSyncError(
    matches.length === 0
      ? `${orderLabel(target.order)} has no ${what} called "${requirement.name}". Add it there first, or group the stage that creates it. Nothing was saved to any order in the group.`
      : `${orderLabel(target.order)} has more than one ${what} called "${requirement.name}", so the entry can't be matched. Nothing was saved to any order in the group.`,
  );
}

export async function planMaterialEntryCreate(requirement: { id: string; orderId: string; groupLinkId: string | null; name: string; category: string }, entryType: string, data: MaterialEntryData, userId: string): Promise<CreatePlan<Prisma.MaterialEntryUncheckedCreateInput>> {
  const ctx = await loadContext(requirement.orderId, materialEntryStageKey(entryType));
  if (!ctx) return noCreatePlan();
  const targets = await resolveTargets(ctx);
  const groupLinkId = randomUUID();
  const siblings: Prisma.MaterialEntryUncheckedCreateInput[] = [];
  for (const t of targets) siblings.push({ ...data, requirementId: await siblingRequirementId("material", requirement, t), groupId: ctx.groupId, groupLinkId });
  return {
    groupId: ctx.groupId,
    groupLinkId,
    siblings,
    audit: targets.map((t) => audit(userId, { orderId: t.order.id, sectionId: t.sectionId }, "material_entry", null, "create", `${ctx.stageLabel}: ${entryType} of ${Number(data.qty).toLocaleString()} for "${requirement.name}" from ${orderLabel(ctx.origin)} (${ctx.groupName})`, (data.notes as string | null | undefined) ?? null)),
    sync: { groupId: ctx.groupId, groupName: ctx.groupName, alsoSavedTo: ctx.others.map(asRef) },
  };
}

export async function planMaterialEntryChange(existing: { id: string; entryType: string; groupId: string | null; groupLinkId: string | null; requirement: { orderId: string; name: string } }, action: "update" | "delete", data: Record<string, unknown>, userId: string): Promise<RowsPlan> {
  const found = await siblingRows({ id: existing.id, orderId: existing.requirement.orderId, groupId: existing.groupId, groupLinkId: existing.groupLinkId }, materialEntryStageKey(existing.entryType), async ({ groupLinkId, groupId, excludeId, orderIds }) => {
    const rows = await prisma.materialEntry.findMany({ where: { groupLinkId, groupId, id: { not: excludeId }, requirement: { orderId: { in: orderIds } } }, include: { requirement: { select: { orderId: true } } } });
    return rows.map((r) => ({ ...r, orderId: r.requirement.orderId }));
  });
  if (!found) return NO_ROWS;
  return buildRowsPlan("material_entry", action, found, existing.groupId, userId, `Entry for "${existing.requirement.name}"`, existing.requirement.orderId, action === "update" ? data : undefined);
}

// ---- Accessories ------------------------------------------------------------

export async function planAccessoryRequirementCreate(orderId: string, data: AccessoryRequirementData, userId: string): Promise<CreatePlan<Prisma.AccessoryRequirementUncheckedCreateInput>> {
  const ctx = await loadContext(orderId, ACCESSORIES);
  if (!ctx) return noCreatePlan();
  const targets = await resolveTargets(ctx);
  const groupLinkId = randomUUID();

  for (const t of targets) {
    const dup = await prisma.accessoryRequirement.findFirst({ where: { orderId: t.order.id, name: { equals: data.name, mode: "insensitive" } } });
    if (dup) throw new GroupSyncError(`${orderLabel(t.order)} already has an accessory called "${data.name}". Nothing was saved to any order in the group.`);
  }

  return {
    groupId: ctx.groupId,
    groupLinkId,
    siblings: targets.map((t) => ({ ...data, orderId: t.order.id, poId: null, groupId: ctx.groupId, groupLinkId })),
    audit: targets.map((t) => audit(userId, { orderId: t.order.id, sectionId: t.sectionId }, "accessory_requirement", null, "create", `Accessories: "${data.name}" added from ${orderLabel(ctx.origin)} (${ctx.groupName})`)),
    sync: { groupId: ctx.groupId, groupName: ctx.groupName, alsoSavedTo: ctx.others.map(asRef) },
  };
}

export async function planAccessoryRequirementChange(existing: { id: string; orderId: string; name: string; groupId: string | null; groupLinkId: string | null }, action: "update" | "delete", data: Record<string, unknown>, userId: string): Promise<RowsPlan> {
  const found = await siblingRows(existing, ACCESSORIES, ({ groupLinkId, groupId, excludeId, orderIds }) =>
    prisma.accessoryRequirement.findMany({ where: { groupLinkId, groupId, id: { not: excludeId }, orderId: { in: orderIds } } }),
  );
  if (!found) return NO_ROWS;
  if (action === "update" && data.name !== undefined) {
    for (const r of found.rows) {
      const dup = await prisma.accessoryRequirement.findFirst({ where: { orderId: r.orderId, id: { not: r.id }, name: { equals: data.name as string, mode: "insensitive" } } });
      if (dup) throw new GroupSyncError(`Another order in the group already has an accessory called "${data.name as string}". Nothing was changed on any order.`);
    }
  }
  return buildRowsPlan("accessory_requirement", action, found, existing.groupId, userId, `Accessory "${existing.name}"`, existing.orderId, action === "update" ? data : undefined);
}

export async function planAccessoryEntryCreate(requirement: { id: string; orderId: string; groupLinkId: string | null; name: string }, data: AccessoryEntryData, userId: string): Promise<CreatePlan<Prisma.AccessoryEntryUncheckedCreateInput>> {
  const ctx = await loadContext(requirement.orderId, ACCESSORIES);
  if (!ctx) return noCreatePlan();
  const targets = await resolveTargets(ctx);
  const groupLinkId = randomUUID();
  const siblings: Prisma.AccessoryEntryUncheckedCreateInput[] = [];
  for (const t of targets) siblings.push({ ...data, requirementId: await siblingRequirementId("accessory", requirement, t), groupId: ctx.groupId, groupLinkId });
  return {
    groupId: ctx.groupId,
    groupLinkId,
    siblings,
    audit: targets.map((t) => audit(userId, { orderId: t.order.id, sectionId: t.sectionId }, "accessory_entry", null, "create", `Accessories: ${data.entryType} of ${Number(data.qty).toLocaleString()} for "${requirement.name}" from ${orderLabel(ctx.origin)} (${ctx.groupName})`, (data.notes as string | null | undefined) ?? null)),
    sync: { groupId: ctx.groupId, groupName: ctx.groupName, alsoSavedTo: ctx.others.map(asRef) },
  };
}

export async function planAccessoryEntryChange(existing: { id: string; groupId: string | null; groupLinkId: string | null; requirement: { orderId: string; name: string } }, action: "update" | "delete", data: Record<string, unknown>, userId: string): Promise<RowsPlan> {
  const found = await siblingRows({ id: existing.id, orderId: existing.requirement.orderId, groupId: existing.groupId, groupLinkId: existing.groupLinkId }, ACCESSORIES, async ({ groupLinkId, groupId, excludeId, orderIds }) => {
    const rows = await prisma.accessoryEntry.findMany({ where: { groupLinkId, groupId, id: { not: excludeId }, requirement: { orderId: { in: orderIds } } }, include: { requirement: { select: { orderId: true } } } });
    return rows.map((r) => ({ ...r, orderId: r.requirement.orderId }));
  });
  if (!found) return NO_ROWS;
  return buildRowsPlan("accessory_entry", action, found, existing.groupId, userId, `Entry for "${existing.requirement.name}"`, existing.requirement.orderId, action === "update" ? data : undefined);
}
