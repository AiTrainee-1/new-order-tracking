import type { AppUser as PrismaAppUser } from "@/generated/prisma/client";

/**
 * AppUser as sent to the client: everything except the bcrypt hash, with
 * Prisma's `Date` fields converted to ISO strings - a hand-written client
 * type rather than a `Date`-carrying `Omit<PrismaAppUser, ...>`, since every
 * other type in this file is deliberately plain/framework-agnostic (see the
 * module comment further down) and a value that has gone through
 * fetch().json() is a string, never a live Date instance.
 * passwordPlain IS included deliberately - see AppUser.passwordPlain in
 * prisma/schema.prisma for why.
 */
export interface PublicAppUser {
  id: string;
  name: string;
  username: string;
  passwordPlain: string;
  role: string;
  phone: string | null;
  isMonitorOnly: boolean;
  isActive: boolean;
  canCreateOrders: boolean;
  canJobWork: boolean;
  lastActivityAt: string | null;
  createdAt: string;
}

export function toPublicAppUser(user: PrismaAppUser): PublicAppUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    passwordPlain: user.passwordPlain,
    role: user.role,
    phone: user.phone,
    isMonitorOnly: user.isMonitorOnly,
    isActive: user.isActive,
    canCreateOrders: user.canCreateOrders,
    canJobWork: user.canJobWork,
    lastActivityAt: user.lastActivityAt ? user.lastActivityAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Domain types for the production chain / gating layer (src/lib/chain.ts,
// src/lib/progress.ts). Deliberately plain, hand-written types decoupled
// from Prisma's generated types (same architecture the previous app used
// with its own src/lib/types.ts) - chain.ts and progress.ts should be
// framework-agnostic, easy to unit test, and immune to churn in the ORM
// layer. Route Handlers are responsible for mapping Prisma rows (camelCase,
// Decimal quantities) into these shapes (camelCase, plain `number`
// quantities) before calling buildProductionChain/buildOrderProgress.
// ---------------------------------------------------------------------------

export type UnitType = "KG" | "PCS";

export type StageFormType =
  | "confirmation"
  | "material_planning"
  | "supplier_dc"
  | "material_inward"
  | "knitting"
  | "lot_send_receive"
  | "lot_process"
  | "lot_inspection"
  | "fabric_store"
  | "simple_confirm"
  | "cutting"
  | "panel_check"
  | "embroidery"
  | "sewing"
  | "garment_qc"
  | "garment_process"
  | "packing"
  | "accessories";

export type TransferType = "none" | "branch" | "unit" | "outside" | "others";
export type MaterialCategory = "yarn" | "fabric";
export type MaterialEntryType = "plan" | "dc" | "receipt" | "inward";
export type AccessoryEntryType = "purchase" | "inward" | "dispatch";
export type TxnType = "process" | "send" | "receive" | "rework";
export type AuditAction = "create" | "update" | "delete";

/**
 * One row of a specific order's chosen + ordered stage plan - what
 * chain.ts/progress.ts iterate over instead of the old global, fixed
 * `workflow_stages` list. `id` is what every ledger's `sectionId` points at.
 * The boolean/rank fields are frozen copies of the catalog StageDefinition
 * at order-creation time - see prisma/schema.prisma's OrderStagePlan model
 * comment for the full rationale.
 */
export interface ChainSection {
  id: string;
  stageDefinitionId: string;
  seq: number;
  key: string;
  label: string;
  unitType: UnitType;
  formType: StageFormType;
  typicalDurationDays: number;
  noLotTracking: boolean;
  isOrderOrigin: boolean;
  isProcurement: boolean;
  procurementRank: number | null;
  isLotOrigin: boolean;
  isSizeOrigin: boolean;
  isPassthrough: boolean;
  isFinalOutput: boolean;
  isFabricCheckpoint: boolean;
  drawsMaterialBaseline: boolean;
  includeInLossRows: boolean;
}

export interface ProductionTxn {
  id: string;
  orderId: string;
  poId: string | null;
  sectionId: string;
  lotId: string | null;
  sizeCode: string | null;
  txnType: TxnType;
  unit: UnitType;
  qtyIn: number;
  qtyOut: number;
  qtyRejected: number;
  qtyRework: number;
  refName: string | null;
  docNo: string | null;
  entryDate: string;
  notes: string | null;
  enteredBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  isJobWork: boolean;
}

export interface ProductionLot {
  id: string;
  orderId: string;
  poId: string | null;
  lotNo: string;
  fabricType: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface MaterialRequirement {
  id: string;
  orderId: string;
  poId: string | null;
  category: MaterialCategory;
  name: string;
  requiredQty: number;
  unit: string;
  supplier: string | null;
  sortOrder: number;
  isCompleted: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface Order {
  id: string;
  ioNo: string;
  style: string;
  description: string | null;
  color: string | null;
  fabric: string | null;
  /** The buyer this order is for - null on orders created before buyers existed. */
  buyerId?: string | null;
  buyer?: { id: string; name: string } | null;
  imageId: string | null;
  totalQty: number;
  cutQuantity: number | null;
  deliveryDate: string | null;
  createdBy: string | null;
  isHidden: boolean;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  orderId: string;
  poNumber: string;
  quantity: number;
  cutQuantity: number | null;
  extraPercent: number;
  deliveryDate: string | null;
  createdAt: string;
}

export interface PoSizeQuantity {
  id: string;
  poId: string;
  sizeCode: string;
  sortOrder: number;
  quantity: number;
  createdAt: string;
}

export interface UserAssignment {
  id: string;
  userId: string;
  orderId: string;
  poId: string | null;
  sectionId: string;
  unitName: string | null;
  canEnterData: boolean;
  createdAt: string;
}

export interface AssignmentWithDetails extends UserAssignment {
  order: Order;
  po: PurchaseOrder | null;
  section: ChainSection;
  user: Pick<PublicAppUser, "id" | "name" | "username" | "phone">;
}

export interface StageAssignment {
  id: string;
  userId: string;
  stageDefinitionId: string;
  canEnterData: boolean;
  createdAt: string;
}

export interface StageEntry {
  id: string;
  orderId: string;
  poId: string | null;
  sectionId: string;
  entryDate: string;
  unitType: UnitType;
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
  transferType: TransferType;
  transferTo: string | null;
  notes: string | null;
  enteredBy: string;
  forwardedToUserId: string | null;
  createdAt: string;
}

export interface AuditLogRow {
  id: string;
  orderId: string | null;
  poId: string | null;
  sectionId: string | null;
  entity: string;
  entityId: string | null;
  action: AuditAction;
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  notes: string | null;
  userId: string;
  createdAt: string;
}

export interface MaterialEntry {
  id: string;
  requirementId: string;
  entryType: MaterialEntryType;
  qty: number;
  entryDate: string;
  supplier: string | null;
  docNo: string | null;
  docDate: string | null;
  lotRef: string | null;
  notes: string | null;
  enteredBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

/** One size's quantity within a size-wise accessory requirement or entry -
 *  see AccessoryRequirement.sizeBreakdown's own comment in schema.prisma. */
export interface AccessorySizeQty {
  sizeCode: string;
  quantity: number;
}

export interface AccessoryRequirement {
  id: string;
  orderId: string;
  poId: string | null;
  name: string;
  requiredQty: number;
  unit: string;
  requiredDate: string | null;
  sortOrder: number;
  /** Non-null only when this accessory was raised size-wise; every
   *  AccessoryEntry against it then carries the same sizes forward. */
  sizeBreakdown: AccessorySizeQty[] | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** No updatedBy/updatedAt on either accessory model - deliberate, see
 *  prisma/schema.prisma's Accessories module comment: these are permanent
 *  once created, unlike MaterialRequirement/MaterialEntry above. */
export interface AccessoryEntry {
  id: string;
  requirementId: string;
  entryType: AccessoryEntryType;
  qty: number;
  entryDate: string;
  vendor: string | null;
  docNo: string | null;
  sentTo: string | null;
  sizeBreakdown: AccessorySizeQty[] | null;
  notes: string | null;
  enteredBy: string;
  createdAt: string;
}
