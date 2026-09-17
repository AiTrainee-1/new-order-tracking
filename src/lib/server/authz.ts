import "server-only";
import { prisma } from "./prisma";

/**
 * Application-layer authorization, replacing the Postgres RLS policies and
 * `SECURITY DEFINER` helper functions the old Supabase schema relied on
 * (`is_admin()`, `is_admin_or_md()`, `has_order_assignment()`,
 * `can_view_order()`, `can_enter_section()`, `can_enter_materials()`,
 * `can_create_orders()`, `can_job_work()`). Every Route Handler/Server
 * Action that used to depend on RLS must call the matching function here
 * before reading or writing data - there is no database-level backstop
 * anymore.
 */

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "admin";
}

export async function isAdminOrMd(userId: string): Promise<boolean> {
  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "admin" || user?.role === "md";
}

export async function hasOrderAssignment(userId: string, orderId: string): Promise<boolean> {
  const count = await prisma.userAssignment.count({ where: { userId, orderId } });
  return count > 0;
}

/** Does this user have a global stage-role default on any stage this order's plan includes? */
async function hasStageRoleOnOrder(userId: string, orderId: string, requireCanEnterData = false): Promise<boolean> {
  const plan = await prisma.orderStagePlan.findMany({
    where: { orderId },
    select: { stageDefinitionId: true },
  });
  if (plan.length === 0) return false;
  const count = await prisma.stageAssignment.count({
    where: {
      userId,
      stageDefinitionId: { in: plan.map((p) => p.stageDefinitionId) },
      ...(requireCanEnterData ? { canEnterData: true } : {}),
    },
  });
  return count > 0;
}

/** Quantity-layer visibility (production_txns, production_lots, material_*, audit_log). */
export async function canViewOrder(userId: string, orderId: string): Promise<boolean> {
  if (await isAdminOrMd(userId)) return true;
  if (await hasOrderAssignment(userId, orderId)) return true;
  return hasStageRoleOnOrder(userId, orderId);
}

/**
 * Can this user write to a specific stage on a specific order/PO?
 * `sectionId` is an OrderStagePlan id (the per-order stage row), matching
 * what StageEntry/ProductionTxn/UserAssignment.sectionId now point at.
 */
export async function canEnterSection(
  userId: string,
  orderId: string,
  poId: string | null,
  sectionId: string,
): Promise<boolean> {
  if (await isAdmin(userId)) return true;

  const direct = await prisma.userAssignment.count({
    where: {
      userId,
      orderId,
      sectionId,
      canEnterData: true,
      OR: [{ poId: null }, { poId: poId ?? undefined }],
    },
  });
  if (direct > 0) return true;

  const section = await prisma.orderStagePlan.findUnique({
    where: { id: sectionId },
    select: { stageDefinitionId: true },
  });
  if (!section) return false;

  const viaStageRole = await prisma.stageAssignment.count({
    where: { userId, stageDefinitionId: section.stageDefinitionId, canEnterData: true },
  });
  return viaStageRole > 0;
}

/** Can this user edit the yarn/fabric procurement ledger for this order? */
export async function canEnterMaterials(userId: string, orderId: string, poId: string | null): Promise<boolean> {
  if (await isAdmin(userId)) return true;

  const procurementSections = await prisma.orderStagePlan.findMany({
    where: { orderId, isProcurement: true },
    select: { id: true, stageDefinitionId: true },
  });
  if (procurementSections.length === 0) return false;

  const direct = await prisma.userAssignment.count({
    where: {
      userId,
      orderId,
      sectionId: { in: procurementSections.map((s) => s.id) },
      canEnterData: true,
      OR: [{ poId: null }, { poId: poId ?? undefined }],
    },
  });
  if (direct > 0) return true;

  const viaStageRole = await prisma.stageAssignment.count({
    where: {
      userId,
      stageDefinitionId: { in: procurementSections.map((s) => s.stageDefinitionId) },
      canEnterData: true,
    },
  });
  return viaStageRole > 0;
}

/** Can this user edit the accessories tracker for this order? */
export async function canEnterAccessories(userId: string, orderId: string, poId: string | null): Promise<boolean> {
  if (await isAdmin(userId)) return true;

  const accessorySections = await prisma.orderStagePlan.findMany({
    where: { orderId, key: "accessories" },
    select: { id: true, stageDefinitionId: true },
  });
  if (accessorySections.length === 0) return false;

  const direct = await prisma.userAssignment.count({
    where: {
      userId,
      orderId,
      sectionId: { in: accessorySections.map((s) => s.id) },
      canEnterData: true,
      OR: [{ poId: null }, { poId: poId ?? undefined }],
    },
  });
  if (direct > 0) return true;

  const viaStageRole = await prisma.stageAssignment.count({
    where: {
      userId,
      stageDefinitionId: { in: accessorySections.map((s) => s.stageDefinitionId) },
      canEnterData: true,
    },
  });
  return viaStageRole > 0;
}

export async function canCreateOrders(userId: string): Promise<boolean> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { role: true, canCreateOrders: true },
  });
  return user?.role === "admin" || user?.canCreateOrders === true;
}

export async function canJobWork(userId: string): Promise<boolean> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { role: true, canJobWork: true },
  });
  return user?.role === "admin" || user?.canJobWork === true;
}
