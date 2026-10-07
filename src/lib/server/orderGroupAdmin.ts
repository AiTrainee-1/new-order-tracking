import "server-only";
import { prisma } from "./prisma";
import { stageUnit, type OrderGroupView } from "../orderGroups";

/** Server helpers for the admin-only group management routes. */

export class GroupInputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const GROUP_INCLUDE = {
  links: { include: { order: { select: { id: true, ioNo: true, style: true, color: true, buyer: { select: { name: true } } } } } },
} as const;

type GroupWithLinks = Awaited<ReturnType<typeof findGroups>>[number];

function findGroups(where?: { id?: string }) {
  // A group whose every order has been deleted has nothing left to show or copy.
  return prisma.orderGroup.findMany({ where: { ...where, links: { some: {} } }, include: GROUP_INCLUDE, orderBy: { createdAt: "desc" } });
}

/** Every group (or one), shaped for the UI. `entryCount` counts each saved
 *  entry once, however many orders it landed on. */
export async function loadGroupViews(id?: string): Promise<OrderGroupView[]> {
  const groups = await findGroups(id ? { id } : undefined);
  const linked = await prisma.productionTxn.findMany({
    where: { groupId: id ? id : { not: null } },
    select: { groupId: true, groupLinkId: true },
    distinct: ["groupId", "groupLinkId"],
  });
  const counts = new Map<string, number>();
  for (const r of linked) if (r.groupId) counts.set(r.groupId, (counts.get(r.groupId) ?? 0) + 1);
  return groups.map((g) => toView(g, counts.get(g.id) ?? 0));
}

function toView(g: GroupWithLinks, entryCount: number): OrderGroupView {
  const members = new Map<string, OrderGroupView["members"][number]>();
  const stageKeys = new Set<string>();
  let buyerName: string | null = null;
  for (const l of g.links) {
    stageKeys.add(l.stageKey);
    buyerName = l.order.buyer?.name ?? buyerName;
    if (!members.has(l.order.id)) members.set(l.order.id, { orderId: l.order.id, ioNo: l.order.ioNo, style: l.order.style, color: l.order.color });
  }
  return {
    id: g.id,
    name: g.name,
    ioNo: g.ioNo,
    buyerName,
    stageKeys: Array.from(stageKeys),
    members: Array.from(members.values()),
    entryCount,
    createdAt: g.createdAt.toISOString(),
  };
}

export interface ValidatedGroup {
  ioNo: string;
  orders: { id: string; ioNo: string; style: string; color: string | null }[];
  /** catalog key -> label, in the order the keys were given */
  stages: { key: string; label: string }[];
}

/**
 * Checks a proposed group, and throws a GroupInputError saying exactly what is
 * wrong. A group is only ever created from a state that passes ALL of this:
 *  - at least two distinct, existing orders, all under one IO and one buyer;
 *  - at least one stage, and every order has it in its own plan;
 *  - every chosen stage is counted in the same unit on every order (every stage
 *    can be grouped - the server mirrors each kind of stage its own way);
 *  - none of those (order, stage) pairs already belongs to another group.
 */
export async function validateGroupInput(input: { orderIds: unknown; stageKeys: unknown }, excludeGroupId?: string): Promise<ValidatedGroup> {
  const orderIds = Array.isArray(input.orderIds) ? Array.from(new Set(input.orderIds.filter((x): x is string => typeof x === "string"))) : [];
  const stageKeys = Array.isArray(input.stageKeys) ? Array.from(new Set(input.stageKeys.filter((x): x is string => typeof x === "string"))) : [];

  if (orderIds.length < 2) throw new GroupInputError("Select at least two orders to group.");
  if (stageKeys.length === 0) throw new GroupInputError("Select at least one stage for the group.");

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, ioNo: true, style: true, color: true, buyerId: true, stagePlan: true },
  });
  if (orders.length !== orderIds.length) throw new GroupInputError("One or more of the selected orders no longer exists.");

  const label = (o: { ioNo: string; style: string; color: string | null }) => `IO ${o.ioNo} · ${o.style}${o.color ? ` / ${o.color}` : ""}`;

  const ioNo = orders[0].ioNo;
  if (orders.some((o) => o.ioNo !== ioNo)) throw new GroupInputError("Only orders under the same IO number can be grouped together.");
  if (orders.some((o) => o.buyerId !== orders[0].buyerId)) throw new GroupInputError("Only orders for the same buyer can be grouped together.");

  const stages: ValidatedGroup["stages"] = [];
  for (const key of stageKeys) {
    const rows = orders.map((o) => ({ order: o, plan: o.stagePlan.find((p) => p.key === key) }));
    const missing = rows.find((r) => !r.plan);
    if (missing) throw new GroupInputError(`${label(missing.order)} doesn't have the "${key.replace(/_/g, " ")}" stage in its plan.`);
    const plans = rows.map((r) => r.plan!);
    if (new Set(plans.map((p) => stageUnit(p))).size > 1) throw new GroupInputError(`${plans[0].label} is counted in different units across these orders, so it can't be grouped.`);
    stages.push({ key, label: plans[0].label });
  }

  const clashes = await prisma.orderGroupLink.findMany({
    where: { orderId: { in: orderIds }, stageKey: { in: stageKeys }, ...(excludeGroupId ? { groupId: { not: excludeGroupId } } : {}) },
    include: { group: { select: { name: true } }, order: { select: { ioNo: true, style: true, color: true } } },
  });
  if (clashes.length > 0) {
    const c = clashes[0];
    const stageLabel = stages.find((s) => s.key === c.stageKey)?.label ?? c.stageKey;
    throw new GroupInputError(`${label(c.order)} is already in the group "${c.group.name}" for ${stageLabel}. An order's stage can only be in one group.`, 409);
  }

  return { ioNo, orders: orders.map((o) => ({ id: o.id, ioNo: o.ioNo, style: o.style, color: o.color })), stages };
}

export function defaultGroupName(v: ValidatedGroup): string {
  return `IO ${v.ioNo} · ${v.stages.map((s) => s.label).join(", ")}`.slice(0, 100);
}
