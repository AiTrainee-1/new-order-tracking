import { effectiveSection } from "./dualUnit";
import type { ChainSection } from "./types";

/**
 * Order groups - the pieces both the Grouping page and the stage views share.
 *
 * A group is a set of orders (always under one IO and one buyer) plus a set of
 * stage KEYS (printing, stone, accessories...). Data entered on any member at
 * one of those stages is written to every member (see
 * lib/server/orderGroups.ts). Orders that are in no group never touch any of
 * this.
 *
 * Every stage can be grouped. What differs is where that stage keeps its data,
 * which is what `groupSyncKind` names - the server mirrors each kind its own
 * way, but the rules (admin-defined, all-or-nothing, only between current
 * members) are the same.
 */

export interface OrderGroupMember {
  orderId: string;
  ioNo: string;
  style: string;
  color: string | null;
}

export interface OrderGroupView {
  id: string;
  name: string;
  ioNo: string;
  buyerName: string | null;
  /** Catalog keys of the stages the group covers. */
  stageKeys: string[];
  members: OrderGroupMember[];
  /** How many entries (counted once each, not once per order) were saved
   *  through the group. */
  entryCount: number;
  createdAt: string;
}

/** Where a stage keeps what the user types into it. */
export type GroupSyncKind =
  /** production_txns rows - Knitting through Packing. */
  | "ledger"
  /** The stage's own stage_entries row IS the data - Order Confirmation and
   *  Pattern Making, which have no ledger of their own. */
  | "stage_entry"
  /** material_requirements / material_entries - Raw Material Planning,
   *  Purchase Order to Suppliers, Raw Material Inward. */
  | "material"
  /** accessory_requirements / accessory_entries - Accessories. */
  | "accessory";

export function groupSyncKind(section: Pick<ChainSection, "formType">): GroupSyncKind {
  switch (section.formType) {
    case "confirmation":
    case "simple_confirm":
      return "stage_entry";
    case "material_planning":
    case "supplier_dc":
    case "material_inward":
      return "material";
    case "accessories":
      return "accessory";
    default:
      return "ledger";
  }
}

/** The unit a stage is counted in, as every other part of the app reads it
 *  (Bit Cutting is always KG, whatever an older plan row froze). */
export function stageUnit(section: Pick<ChainSection, "key" | "unitType" | "noLotTracking">): string {
  return effectiveSection(section).unitType;
}

/** The group `orderId` belongs to at the stage with this catalog key, if any. */
export function groupForStage(groups: readonly OrderGroupView[] | undefined, orderId: string, stageKey: string): OrderGroupView | null {
  for (const g of groups ?? []) {
    if (g.stageKeys.includes(stageKey) && g.members.some((m) => m.orderId === orderId)) return g;
  }
  return null;
}

/** Every grouped stage of one order, keyed by catalog stage key. */
export function groupsByStageKey(groups: readonly OrderGroupView[] | undefined, orderId: string): Map<string, OrderGroupView> {
  const map = new Map<string, OrderGroupView>();
  for (const g of groups ?? []) {
    if (!g.members.some((m) => m.orderId === orderId)) continue;
    for (const key of g.stageKeys) map.set(key, g);
  }
  return map;
}

export function memberLabel(m: OrderGroupMember): string {
  return `${m.style}${m.color ? ` / ${m.color}` : ""}`;
}

/** The other orders in a group, as a short readable list. */
export function otherMembers(group: OrderGroupView, orderId: string): OrderGroupMember[] {
  return group.members.filter((m) => m.orderId !== orderId);
}
