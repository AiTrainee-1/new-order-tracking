import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError, badDateError } from "@/lib/server/http";
import { canCreateOrders, canSeeAllOrders, isAdmin, visibleOrderWhere } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { validateStagePlan, type StagePlanCatalogEntry } from "@/lib/stagePlan";
import { parseBody } from "@/lib/server/validation";
import { orderCreateBody, poQuantity, stagePlanFields } from "@/lib/server/orderInput";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const includeHidden = request.nextUrl.searchParams.get("includeHidden") === "true";

  const includeStagePlan = request.nextUrl.searchParams.get("includeStagePlan") === "true";

  const userId = auth.session.userId;
  // The role in the token is only what it was at sign-in; ask the database (authz) instead.
  const [isAdminSession, seesAll] = await Promise.all([isAdmin(userId), canSeeAllOrders(userId)]);

  const hiddenFilter: Prisma.OrderWhereInput = includeHidden
    ? isAdminSession
      ? {}
      : { OR: [{ isHidden: false }, { isHidden: true, createdBy: userId }] }
    : { isHidden: false };
  // A floor user without an all-orders view (canSeeAllOrders) only ever gets the orders they can open.
  const base: Prisma.OrderWhereInput = seesAll ? hiddenFilter : { AND: [hiddenFilter, visibleOrderWhere(userId)] };

  // ?mine=true - only the orders this person's work can involve: ones they are assigned to, or that have a stage
  // they hold a stage-role default for. A floor user's "My Work" needs nothing else, and the full list (every order
  // with every stage) is well over a megabyte they would otherwise download on a phone.
  const mine = request.nextUrl.searchParams.get("mine") === "true";
  const where: Prisma.OrderWhereInput = mine
    ? {
        AND: [
          base,
          {
            OR: [
              { userAssignments: { some: { userId } } },
              { stagePlan: { some: { stageDefinition: { stageAssignments: { some: { userId } } } } } },
            ],
          },
        ],
      }
    : base;

  // The orders, their buyers, POs and stage plans are independent lookups (the children are found by the same
  // filter, not by waiting for the orders) - so they go out together. An `include` would run them one after
  // another, a database round trip apiece.
  const [rows, buyers, purchaseOrders, stagePlans] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" } }),
    prisma.buyer.findMany({ select: { id: true, name: true } }),
    prisma.purchaseOrder.findMany({
      where: { order: where },
      orderBy: [{ createdAt: "asc" }, { poNumber: "asc" }], // a fixed order: without one, Postgres returns rows in whatever order they sit on disk
      select: { id: true, orderId: true, quantity: true, cutQuantity: true, extraPercent: true, poNumber: true, deliveryDate: true, createdAt: true },
    }),
    includeStagePlan ? prisma.orderStagePlan.findMany({ where: { order: where }, orderBy: { seq: "asc" } }) : Promise.resolve(null),
  ]);

  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const posByOrder = new Map<string, typeof purchaseOrders>();
  for (const po of purchaseOrders) posByOrder.set(po.orderId, [...(posByOrder.get(po.orderId) ?? []), po]);
  const plansByOrder = new Map<string, NonNullable<typeof stagePlans>>();
  for (const sp of stagePlans ?? []) plansByOrder.set(sp.orderId, [...(plansByOrder.get(sp.orderId) ?? []), sp]);

  const orders = rows.map((o) => ({
    ...o,
    buyer: o.buyerId ? (buyerById.get(o.buyerId) ?? null) : null,
    purchaseOrders: posByOrder.get(o.id) ?? [],
    ...(stagePlans ? { stagePlan: plansByOrder.get(o.id) ?? [] } : {}),
  }));

  return NextResponse.json({ orders: serializeForJson(orders) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  if (!(await canCreateOrders(auth.session.userId))) {
    return apiError(403, "You don't have permission to create orders.");
  }

  const parsed = parseBody(orderCreateBody, await request.json().catch(() => null));
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const badDate = badDateError(["delivery date", body.deliveryDate], ...body.purchaseOrders.map((po): [string, unknown] => [`delivery date of PO ${po.poNumber}`, po.deliveryDate]));
  if (badDate) return badDate;

  const catalogRows = await prisma.stageDefinition.findMany({ where: { isActive: true } });
  const catalog: StagePlanCatalogEntry[] = catalogRows;

  const validation = validateStagePlan(
    {
      stages: body.stagePlan.stages,
      sizeOriginStageDefinitionId: body.stagePlan.sizeOriginStageDefinitionId,
      lotOriginStageDefinitionId: body.stagePlan.lotOriginStageDefinitionId,
    },
    catalog,
  );
  if (!validation.ok) {
    return apiError(400, validation.error);
  }

  if (body.buyerId && !(await prisma.buyer.findUnique({ where: { id: body.buyerId }, select: { id: true } }))) {
    return apiError(400, "That buyer no longer exists - pick another or add it again.");
  }
  if (body.imageId && !(await prisma.orderImage.findUnique({ where: { id: body.imageId }, select: { id: true } }))) {
    return apiError(400, "That image is no longer available - upload it again.");
  }

  const totalQty = body.purchaseOrders.reduce((sum, po) => sum + poQuantity(po), 0);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        ioNo: body.ioNo.trim(),
        style: body.style.trim(),
        description: body.description,
        color: body.color,
        fabric: body.fabric,
        buyerId: body.buyerId,
        imageId: body.imageId,
        totalQty,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        createdBy: auth.session.userId,
      },
    });

    for (const po of body.purchaseOrders) {
      await tx.purchaseOrder.create({
        data: {
          orderId: created.id,
          poNumber: po.poNumber,
          quantity: poQuantity(po),
          cutQuantity: po.cutQuantity ?? null,
          extraPercent: po.extraPercent ?? 0,
          deliveryDate: po.deliveryDate ? new Date(po.deliveryDate) : null,
          sizeQuantities: {
            create: po.sizes.map((s) => ({
              sizeCode: s.sizeCode,
              sortOrder: s.sortOrder,
              quantity: s.quantity,
            })),
          },
        },
      });
    }

    await tx.orderStagePlan.createMany({
      data: validation.rows.map((row) => ({ orderId: created.id, stageDefinitionId: row.stageDefinitionId, ...stagePlanFields(row) })),
    });

    return created;
  }, {
    // Order + every PO (each with its size rows) + the stage plan, one round
    // trip apiece to a remote database - Prisma's 5s default interactive
    // transaction timeout is too short for a large order (P2028 -> 500).
    timeout: 30000,
  });

  return NextResponse.json({ order: serializeForJson(order) }, { status: 201 });
}
