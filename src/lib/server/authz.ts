import "server-only";
import { prisma } from "./prisma";
import { passwordVersion, type SessionPayload } from "./session";

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
 * A user's role, active flag and password fingerprint are looked up on every request (session validation,
 * then every admin/MD endpoint and the first step of every permission check) - one more round trip, in
 * series, before any real work. They change rarely, so a server instance remembers them for a few seconds.
 * A role change, deactivation or password reset therefore takes effect within USER_TTL_MS on other
 * instances; the instance that made the change forgets the user at once (forgetUser).
 */
const USER_TTL_MS = 15_000;

interface UserState {
  role: string;
  isActive: boolean;
  pwv: string;
  canCreateOrders: boolean;
  canJobWork: boolean;
}
const userCache = new Map<string, { state: UserState | null; at: number }>();

async function userState(userId: string): Promise<UserState | null> {
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.state;
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, passwordHash: true, canCreateOrders: true, canJobWork: true },
  });
  const state = user
    ? { role: user.role, isActive: user.isActive, pwv: await passwordVersion(user.passwordHash), canCreateOrders: user.canCreateOrders, canJobWork: user.canJobWork }
    : null;
  if (userCache.size > 500) userCache.clear();
  userCache.set(userId, { state, at: Date.now() });
  return state;
}

/** Drop a user's cached state - call after changing their role, active flag, capabilities or password. */
export function forgetUser(userId: string) {
  userCache.delete(userId);
}

/**
 * Is this signed token still good? The JWT only proves who signed in and when; the account must also still
 * exist, still be active, and still have the password it was signed in with (a reset ends older sessions).
 */
export async function isSessionCurrent(session: SessionPayload): Promise<boolean> {
  const state = await userState(session.userId);
  return !!state && state.isActive && state.pwv === session.pwv;
}

/** The user's current role - undefined for a missing or deactivated account, so every role check fails. */
async function roleOf(userId: string): Promise<string | undefined> {
  const state = await userState(userId);
  return state?.isActive ? state.role : undefined;
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

/**
 * Can this user see a whole-account view of orders (every order, not just the ones their work touches)?
 * Admin and MD oversee everything; a Job Work user may log against ANY order (see JobWorkPage), so they
 * need to find any order too.
 */
export async function canSeeAllOrders(userId: string): Promise<boolean> {
  const [privileged, jobWork] = await Promise.all([isAdminOrMd(userId), canJobWork(userId)]);
  return privileged || jobWork;
}

/** Order visibility - the order itself, and its quantity layer (production_txns, production_lots, material_*, audit_log). */
export async function canViewOrder(userId: string, orderId: string): Promise<boolean> {
  // Independent questions - asked together (one round trip), not one after another.
  const [allOrders, assigned, viaStageRole, created] = await Promise.all([
    canSeeAllOrders(userId),
    hasOrderAssignment(userId, orderId),
    hasStageRoleOnOrder(userId, orderId),
    prisma.order.count({ where: { id: orderId, createdBy: userId } }),
  ]);
  return allOrders || assigned || viaStageRole || created > 0;
}

/** canViewOrder for several orders at once - true only when every one of them is visible. */
export async function canViewOrders(userId: string, orderIds: string[]): Promise<boolean> {
  const ids = Array.from(new Set(orderIds));
  if (ids.length === 0 || (await canSeeAllOrders(userId))) return true;
  const visible = await prisma.order.count({ where: { id: { in: ids }, ...visibleOrderWhere(userId) } });
  return visible === ids.length;
}

/** The orders a user without canSeeAllOrders can see, as a Prisma filter: assigned, via a stage role, or created by them. */
export function visibleOrderWhere(userId: string) {
  return {
    OR: [
      { userAssignments: { some: { userId } } },
      { stagePlan: { some: { stageDefinition: { stageAssignments: { some: { userId } } } } } },
      { createdBy: userId },
    ],
  };
}

/**
 * The assignment rows that cover a write to `poId`: an order-wide assignment (poId null) always does; a
 * PO-scoped one covers its own PO - and also order-level rows (poId null). Those are not "the whole order"
 * in any sense that matters here: every copy an Order Group mirrors onto a sibling order is saved with no PO
 * (a PO belongs to one order), so a PO-scoped user on that sibling must still be able to correct it. What a
 * PO-scoped user can never do is write against a DIFFERENT PO.
 */
function poScope(poId: string | null) {
  return poId ? { OR: [{ poId: null }, { poId }] } : {};
}

/** Does the PO (when one is named) belong to this order? A write naming another order's PO is refused outright. */
async function poBelongsToOrder(orderId: string, poId: string | null): Promise<boolean> {
  if (!poId) return true;
  return (await prisma.purchaseOrder.count({ where: { id: poId, orderId } })) > 0;
}

/**
 * Can this user write to a specific stage on a specific order/PO?
 * `sectionId` is an OrderStagePlan id (the per-order stage row), matching
 * what StageEntry/ProductionTxn/UserAssignment.sectionId now point at. The
 * section and the PO must both belong to `orderId` - otherwise a right on one
 * order's stage could be used to write rows onto another order.
 */
export async function canEnterSection(
  userId: string,
  orderId: string,
  poId: string | null,
  sectionId: string,
): Promise<boolean> {
  // Shape checks, admin, a direct assignment, or a stage-role default: asked together rather than one after another.
  const [sectionOnOrder, poOnOrder, admin, direct, viaStageRole] = await Promise.all([
    prisma.orderStagePlan.count({ where: { id: sectionId, orderId } }),
    poBelongsToOrder(orderId, poId),
    isAdmin(userId),
    prisma.userAssignment.count({
      where: { userId, orderId, sectionId, canEnterData: true, ...poScope(poId) },
    }),
    prisma.stageAssignment.count({
      where: { userId, canEnterData: true, stageDefinition: { orderStagePlans: { some: { id: sectionId, orderId } } } },
    }),
  ]);
  if (sectionOnOrder === 0 || !poOnOrder) return false;
  return admin || direct > 0 || viaStageRole > 0;
}

/** canEnterSection for every distinct order/PO/stage a batch of rows writes to - true only when all are allowed. */
export async function canEnterSections(
  userId: string,
  rows: { orderId: string; poId: string | null; sectionId: string }[],
): Promise<boolean> {
  const targets = Array.from(new Map(rows.map((r) => [`${r.orderId}|${r.poId ?? ""}|${r.sectionId}`, r])).values());
  if (targets.length === 0) return false;
  const results = await Promise.all(targets.map((t) => canEnterSection(userId, t.orderId, t.poId, t.sectionId)));
  return results.every(Boolean);
}

/**
 * Shared shape of canEnterMaterials/canEnterAccessories: admin, or a data-entry assignment (direct or via a
 * stage-role default) on one of the order's stages picked out by `sectionWhere`.
 */
async function canEnterLedger(
  userId: string,
  orderId: string,
  poId: string | null,
  sectionWhere: { isProcurement: true } | { key: string },
): Promise<boolean> {
  const [admin, poOnOrder, sections] = await Promise.all([
    isAdmin(userId),
    poBelongsToOrder(orderId, poId),
    prisma.orderStagePlan.findMany({
      where: { orderId, ...sectionWhere },
      select: { id: true, stageDefinitionId: true },
    }),
  ]);
  if (!poOnOrder) return false;
  if (admin) return true;
  if (sections.length === 0) return false;

  const [direct, viaStageRole] = await Promise.all([
    prisma.userAssignment.count({
      where: {
        userId,
        orderId,
        sectionId: { in: sections.map((s) => s.id) },
        canEnterData: true,
        ...poScope(poId),
      },
    }),
    prisma.stageAssignment.count({
      where: {
        userId,
        stageDefinitionId: { in: sections.map((s) => s.stageDefinitionId) },
        canEnterData: true,
      },
    }),
  ]);
  return direct > 0 || viaStageRole > 0;
}

/** Can this user edit the yarn/fabric procurement ledger for this order? */
export async function canEnterMaterials(userId: string, orderId: string, poId: string | null): Promise<boolean> {
  return canEnterLedger(userId, orderId, poId, { isProcurement: true });
}

/** Can this user edit the accessories tracker for this order? */
export async function canEnterAccessories(userId: string, orderId: string, poId: string | null): Promise<boolean> {
  return canEnterLedger(userId, orderId, poId, { key: "accessories" });
}

export async function canCreateOrders(userId: string): Promise<boolean> {
  const state = await userState(userId);
  return !!state?.isActive && (state.role === "admin" || state.canCreateOrders);
}

export async function canJobWork(userId: string): Promise<boolean> {
  const state = await userState(userId);
  return !!state?.isActive && (state.role === "admin" || state.canJobWork);
}

/**
 * Does every row's stage - and its PO and lot, when named - belong to the order the row names? The structural
 * half of canEnterSection, for grants such as Job Work that are not tied to an assignment, and for lots, which
 * canEnterSection does not look at.
 */
export async function sectionsBelongToOrders(
  rows: { orderId: string; poId: string | null; sectionId: string; lotId?: string | null }[],
): Promise<boolean> {
  const sectionIds = Array.from(new Set(rows.map((r) => r.sectionId)));
  const poIds = Array.from(new Set(rows.flatMap((r) => (r.poId ? [r.poId] : []))));
  const lotIds = Array.from(new Set(rows.flatMap((r) => (r.lotId ? [r.lotId] : []))));
  const [sections, pos, lots] = await Promise.all([
    prisma.orderStagePlan.findMany({ where: { id: { in: sectionIds } }, select: { id: true, orderId: true } }),
    poIds.length ? prisma.purchaseOrder.findMany({ where: { id: { in: poIds } }, select: { id: true, orderId: true } }) : Promise.resolve([]),
    lotIds.length ? prisma.productionLot.findMany({ where: { id: { in: lotIds } }, select: { id: true, orderId: true } }) : Promise.resolve([]),
  ]);
  const sectionOrder = new Map(sections.map((s) => [s.id, s.orderId]));
  const poOrder = new Map(pos.map((p) => [p.id, p.orderId]));
  const lotOrder = new Map(lots.map((l) => [l.id, l.orderId]));
  return rows.every(
    (r) =>
      sectionOrder.get(r.sectionId) === r.orderId &&
      (!r.poId || poOrder.get(r.poId) === r.orderId) &&
      (!r.lotId || lotOrder.get(r.lotId) === r.orderId),
  );
}

/**
 * Can this user enter production data anywhere on this order (admin, or a data-entry assignment / stage-role
 * default on any of its stages)? For records that belong to the order rather than one stage, such as lots.
 */
export async function canEnterAnySection(userId: string, orderId: string, poId: string | null): Promise<boolean> {
  const [admin, poOnOrder, direct, viaStageRole] = await Promise.all([
    isAdmin(userId),
    poBelongsToOrder(orderId, poId),
    prisma.userAssignment.count({ where: { userId, orderId, canEnterData: true, ...poScope(poId) } }),
    hasStageRoleOnOrder(userId, orderId, true),
  ]);
  if (!poOnOrder) return false;
  return admin || direct > 0 || viaStageRole;
}

/**
 * Can this user change anything on this order at all - enter data on one of its stages, log Job Work against
 * it, or manage it as its creator? The bar for writing an audit-trail row about the order.
 */
export async function canWriteToOrder(userId: string, orderId: string): Promise<boolean> {
  const [anySection, jobWork, created] = await Promise.all([
    canEnterAnySection(userId, orderId, null),
    canJobWork(userId),
    prisma.order.count({ where: { id: orderId, createdBy: userId } }),
  ]);
  return anySection || jobWork || created > 0;
}
