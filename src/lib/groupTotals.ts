/**
 * The group-level view of an Order Group: for each stage it covers, every member
 * order's own figures side by side, and their sum.
 *
 * It is a VIEW, not data. Nothing is stored for it: the server adds up each
 * member's own records at the moment it is asked, using the group's CURRENT
 * members and stages. So
 *   - records entered individually before the group existed are included (the
 *     view never cared who or what wrote a row);
 *   - the instant a group is dissolved, or an order or stage leaves it, the view
 *     for that order/stage is gone - while every individual record is untouched,
 *     because the view never wrote any.
 *
 * "Total" is the sum of the orders' own figures. (An entry made through the group
 * is saved to each member as that member's own record, so it counts once per
 * member here, exactly as it does on each member's own page.)
 */

export interface GroupTotalsMetric {
  key: string;
  label: string;
  unit: string;
  /** How to colour the figure. */
  tone?: "good" | "bad" | "warn" | "info";
}

export interface GroupTotalsMember {
  orderId: string;
  ioNo: string;
  style: string;
  color: string | null;
  /** metric key -> this order's own figure */
  values: Record<string, number>;
}

export interface GroupTotalsStage {
  stageKey: string;
  stageLabel: string;
  metrics: GroupTotalsMetric[];
  members: GroupTotalsMember[];
  /** metric key -> the sum across members */
  totals: Record<string, number>;
}

export interface GroupTotals {
  groupId: string;
  groupName: string;
  stages: GroupTotalsStage[];
}
