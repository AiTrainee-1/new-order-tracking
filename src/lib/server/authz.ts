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

/**
 * A user's role is looked up in the database on almost every request (every admin/MD endpoint, and the
 * first step of every permission check) - one more round trip, in series, before any real work. It changes
 * rarely, so a server instance remembers it for a few seconds. A role change therefore takes effect within
 * ROLE_TTL_MS, not instantly.
 */
const ROLE_TTL_MS = 15_000;
const roleCache = new Map<string, { role: string | undefined; at: number }>();

async function roleOf(userId: string): Promise<string | undefined> {
  const hit = roleCache.get(userId);
  if (hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.role;
  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { role: true } });
  if (roleCache.size > 500) roleCache.clear();
  roleCache.set(userId, { role: user?.role, at: Date.now() });
  return user?.role;
}

export async function isAdmin(userId: string): Promise<boolean> {
  return (await roleOf(userId)) === "admin";
}

export async function isAdminOrMd(userId: string): Promise<boolean> {
  const role = await roleOf(userId);
  return role === "admin" || role === "md";
}

export async function hasOrderAssignment(userId: string, orderId: string): Promise<boolean> {
  const count = await prisma.userAssignment.count({ where: { userId, orderId } });
  return count > 0;
}

/** Does this user have a global stage-role default on any stage this order's plan includes? */
async function hasStageRoleOnOrder(userId: string, orderId: string, requireCanEnterData = false): Promise<boolean> {
  const count = await prisma.stageAssignment.count({
    where: {
      userId,
      ...(requireCanEnterData ? { canEnterData: true } : {}),
      stageDefinition: { orderStagePlans: { some: { orderId } } },
    },
  });
  return count > 0;
}

/** Quantity-layer visibility (production_txns, production_lots, material_*, audit_log). */
export async function canViewOrder(userId: string, orderId: string): Promise<boolean> {
  // Three independent questions - asked together (one round trip), not one after another.
  const [privileged, assigned, viaStageRole] = await Promise.all([isAdminOrMd(userId), hasOrderAssignment(userId, orderId), hasStageRoleOnOrder(userId, orderId)]);
  return privileged || assigned || viaStageRole;
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
  // Admin, a direct assignment, or a stage-role default: asked together rather than one after another.
  const [admin, direct, viaStageRole] = await Promise.all([
    isAdmin(userId),
    prisma.userAssignment.count({
      where: {
        userId,
        orderId,
        sectionId,
        canEnterData: true,
        OR: [{ poId: null }, { poId: poId ?? undefined }],
      },
    }),
    prisma.stageAssignment.count({
      where: { userId, canEnterData: true, stageDefinition: { orderStagePlans: { some: { id: sectionId } } } },
    }),
  ]);
  return admin || direct > 0 || viaStageRole > 0;
}

/** Can this user edit the yarn/fabric procurement ledger for this order? */
export async function canEnterMaterials(userId: string, orderId: string, poId: string | null): Promise<boolean> {
  const [admin, procurementSections] = await Promise.all([
    isAdmin(userId),
    prisma.orderStagePlan.findMany({
      where: { orderId, isProcurement: true },
      select: { id: true, stageDefinitionId: true },
    }),
  ]);
  if (admin) return true;
  if (procurementSections.length === 0) return false;

  const [direct, viaStageRole] = await Promise.all([
    prisma.userAssignment.count({
      where: {
        userId,
        orderId,
        sectionId: { in: procurementSections.map((s) => s.id) },
        canEnterData: true,
        OR: [{ poId: null }, { poId: poId ?? undefined }],
      },
    }),
    prisma.stageAssignment.count({
      where: {
        userId,
        stageDefinitionId: { in: procurementSections.map((s) => s.stageDefinitionId) },
        canEnterData: true,
      },
    }),
  ]);
  return direct > 0 || viaStageRole > 0;
}

/** Can this user edit the accessories tracker for this order? */
export async function canEnterAccessories(userId: string, orderId: string, poId: string | null): Promise<boolean> {
  const [admin, accessorySections] = await Promise.all([
    isAdmin(userId),
    prisma.orderStagePlan.findMany({
      where: { orderId, key: "accessories" },
      select: { id: true, stageDefinitionId: true },
    }),
  ]);
  if (admin) return true;
  if (accessorySections.length === 0) return false;

  const [direct, viaStageRole] = await Promise.all([
    prisma.userAssignment.count({
      where: {
        userId,
        orderId,
        sectionId: { in: accessorySections.map((s) => s.id) },
        canEnterData: true,
        OR: [{ poId: null }, { poId: poId ?? undefined }],
      },
    }),
    prisma.stageAssignment.count({
      where: {
        userId,
        stageDefinitionId: { in: accessorySections.map((s) => s.stageDefinitionId) },
        canEnterData: true,
      },
    }),
  ]);
  return direct > 0 || viaStageRole > 0;
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
