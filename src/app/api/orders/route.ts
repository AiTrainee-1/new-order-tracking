import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canCreateOrders } from "@/lib/server/authz";
import { serializeForJson } from "@/lib/server/serialize";
import { validateStagePlan, type StagePlanCatalogEntry } from "@/lib/stagePlan";

interface CreatePoSizeBody {
  sizeCode: string;
  sortOrder: number;
  quantity: number;
}

interface CreatePoBody {
  poNumber: string;
  quantity: number;
  cutQuantity?: number | null;
  extraPercent?: number;
  deliveryDate?: string | null;
  sizes: CreatePoSizeBody[];
}

interface CreateOrderBody {
  ioNo: string;
  style: string;
  description?: string | null;
  color?: string | null;
  fabric?: string | null;
  buyerId?: string | null;
  deliveryDate?: string | null;
  imageId?: string | null;
  purchaseOrders: CreatePoBody[];
  stagePlan: {
    stages: { stageDefinitionId: string; seq: number }[];
    sizeOriginStageDefinitionId: string | null;
    lotOriginStageDefinitionId: string | null;
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const includeHidden = request.nextUrl.searchParams.get("includeHidden") === "true";

  const includeStagePlan = request.nextUrl.searchParams.get("includeStagePlan") === "true";

  const isAdminSession = auth.session.role === "admin";

  const orders = await prisma.order.findMany({
    where: includeHidden
      ? isAdminSession
        ? {}
        : { OR: [{ isHidden: false }, { isHidden: true, createdBy: auth.session.userId }] }
      : { isHidden: false },
    orderBy: { createdAt: "desc" },
    include: {
      buyer: { select: { id: true, name: true } },
      purchaseOrders: { select: { id: true, orderId: true, quantity: true, cutQuantity: true, extraPercent: true, poNumber: true, deliveryDate: true, createdAt: true } },
      ...(includeStagePlan ? { stagePlan: { orderBy: { seq: "asc" as const } } } : {}),
    },
  });

  return NextResponse.json({ orders: serializeForJson(orders) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  if (!(await canCreateOrders(auth.session.userId))) {
    return apiError(403, "You don't have permission to create orders.");
  }

  const body = (await request.json().catch(() => null)) as CreateOrderBody | null;
  if (!body || !body.ioNo?.trim() || !body.style?.trim()) {
    return apiError(400, "ioNo and style are required.");
  }
  if (!Array.isArray(body.purchaseOrders) || body.purchaseOrders.length === 0) {
    return apiError(400, "At least one purchase order is required.");
  }
  if (!body.stagePlan || !Array.isArray(body.stagePlan.stages) || body.stagePlan.stages.length === 0) {
    return apiError(400, "A stage plan is required.");
  }

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

  const totalQty = body.purchaseOrders.reduce((sum, po) => sum + (Number(po.quantity) || 0), 0);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        ioNo: body.ioNo.trim(),
        style: body.style.trim(),
        description: body.description ?? null,
        color: body.color ?? null,
        fabric: body.fabric ?? null,
        buyerId: body.buyerId || null,
        imageId: body.imageId ?? null,
        totalQty,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        createdBy: auth.session.userId,
      },
    });

    for (const po of body.purchaseOrders) {
      await tx.purchaseOrder.create({
        data: {
          orderId: created.id,
          poNumber: po.poNumber.trim(),
          quantity: po.quantity,
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
      data: validation.rows.map((row) => ({
        orderId: created.id,
        stageDefinitionId: row.stageDefinitionId,
        seq: row.seq,
        key: row.catalog.key,
        label: row.catalog.label,
        unitType: row.catalog.unitType,
        typicalDurationDays: row.catalog.typicalDurationDays,
        formType: row.catalog.formType,
        noLotTracking: row.catalog.noLotTracking,
        isOrderOrigin: row.catalog.isOrderOrigin,
        isProcurement: row.catalog.isProcurement,
        procurementRank: row.catalog.procurementRank,
        isLotOrigin: row.isLotOrigin,
        isSizeOrigin: row.isSizeOrigin,
        isPassthrough: row.catalog.isPassthrough,
        isFinalOutput: row.catalog.isFinalOutput,
        isFabricCheckpoint: row.catalog.isFabricCheckpoint,
        drawsMaterialBaseline: row.catalog.drawsMaterialBaseline,
        includeInLossRows: row.catalog.includeInLossRows,
      })),
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
