import "server-only";
import { prisma } from "./prisma";
import { groupSyncKind, stageUnit } from "../orderGroups";
import { stageQtyLabels } from "../stageLabels";
import type { GroupTotals, GroupTotalsMember, GroupTotalsMetric, GroupTotalsStage } from "../groupTotals";

/**
 * Builds the group-level view (see lib/groupTotals.ts): every member's own
 * records, added up per stage at the moment of asking. Read-only - it writes
 * nothing, so it can never merge or overwrite an individual record, and it
 * follows the group's current links, so removing a group (or an order, or a
 * stage) removes its totals the same instant.
 */

const num = (v: unknown) => Number(v) || 0;

export async function computeGroupTotals(groupId: string): Promise<GroupTotals | null> {
  const group = await prisma.orderGroup.findUnique({
    where: { id: groupId },
    include: { links: { include: { order: { select: { id: true, ioNo: true, style: true, color: true } } } } },
  });
  if (!group || group.links.length === 0) return null;

  const orderIds = Array.from(new Set(group.links.map((l) => l.orderId)));
  const stageKeys = Array.from(new Set(group.links.map((l) => l.stageKey)));

  const plans = await prisma.orderStagePlan.findMany({
    where: { orderId: { in: orderIds }, key: { in: stageKeys } },
    select: { id: true, orderId: true, key: true, label: true, seq: true, unitType: true, noLotTracking: true, formType: true },
  });
  const planOf = (orderId: string, key: string) => plans.find((p) => p.orderId === orderId && p.key === key);
  type Working = GroupTotalsMember & { _plan: (typeof plans)[number] };

  // One lookup per ledger of record, for every member and stage at once.
  const ledgerSectionIds = plans.filter((p) => groupSyncKind(p) === "ledger").map((p) => p.id);
  const allSectionIds = plans.map((p) => p.id);
  const [txnSums, requirements, accessoryReqs, stageEntrySums] = await Promise.all([
    ledgerSectionIds.length
      ? prisma.productionTxn.groupBy({
          by: ["sectionId", "txnType", "unit"],
          where: { sectionId: { in: ledgerSectionIds } },
          _sum: { qtyIn: true, qtyOut: true, qtyRejected: true, qtyRework: true },
        })
      : Promise.resolve([]),
    prisma.materialRequirement.findMany({ where: { orderId: { in: orderIds } }, include: { entries: { select: { entryType: true, qty: true } } } }),
    prisma.accessoryRequirement.findMany({ where: { orderId: { in: orderIds } }, include: { entries: { select: { entryType: true, qty: true } } } }),
    prisma.stageEntry.groupBy({
      by: ["sectionId", "isCompleted", "isForwarded"],
      where: { sectionId: { in: allSectionIds } },
      _count: { _all: true },
    }),
  ]);

  const stages: GroupTotalsStage[] = [];

  for (const key of stageKeys) {
    const memberLinks = group.links.filter((l) => l.stageKey === key);
    const memberPlans = memberLinks.map((l) => planOf(l.orderId, key)).filter((p): p is NonNullable<typeof p> => !!p);
    if (memberPlans.length === 0) continue;
    const first = memberPlans[0];
    const kind = groupSyncKind(first);
    const labels = stageQtyLabels(key);
    const unit = stageUnit(first);
    const stageLabel = first.label;

    const members: Working[] = memberLinks
      .flatMap((l) => {
        const plan = planOf(l.orderId, key);
        return plan ? [{ orderId: l.orderId, ioNo: l.order.ioNo, style: l.order.style, color: l.order.color, values: {} as Record<string, number>, _plan: plan }] : [];
      })
      .sort((x, y) => (x.color ?? "").localeCompare(y.color ?? ""));

    let metrics: GroupTotalsMetric[] = [];

    if (kind === "ledger") {
      // One row per (section, type, unit) already; read each member's own.
      const rowsOf = (sectionId: string, wantUnit: string) => txnSums.filter((r) => r.sectionId === sectionId && r.unit === wantUnit);
      let roundTrip = ["embroidery", "lot_send_receive"].includes(first.formType);
      for (const m of members) {
        const rows = rowsOf(m._plan.id, unit);
        const sum = (type: string, field: "qtyIn" | "qtyOut" | "qtyRejected" | "qtyRework") => rows.filter((r) => r.txnType === type).reduce((t, r) => t + num(r._sum[field]), 0);
        const sent = sum("send", "qtyIn");
        const received = sum("receive", "qtyOut");
        if (sent > 0 || received > 0) roundTrip = true;
        m.values = {
          sent,
          received,
          withVendor: Math.max(sent - received, 0),
          input: sum("process", "qtyIn"),
          output: sum("process", "qtyOut"),
          rejected: ["send", "receive", "process"].reduce((t, type) => t + sum(type, "qtyRejected"), 0),
          reworkPending: Math.max(sum("rework", "qtyIn") - sum("rework", "qtyOut"), 0),
        };
      }
      const any = (k: string) => members.some((m) => m.values[k] > 0);
      if (roundTrip) {
        metrics = [
          { key: "sent", label: labels.in === "In" ? "Sent" : labels.in, unit },
          { key: "received", label: labels.out === "Out" ? "Received" : labels.out, unit, tone: "good" },
          { key: "withVendor", label: "With vendor", unit, tone: "warn" },
        ];
      } else {
        metrics = [];
        if (any("input")) metrics.push({ key: "input", label: labels.in === "In" ? "Input" : labels.in, unit });
        metrics.push({ key: "output", label: labels.out === "Out" ? "Output" : labels.out, unit, tone: "good" });
      }
      if (any("rejected")) metrics.push({ key: "rejected", label: labels.rejected, unit, tone: "bad" });
      if (any("reworkPending")) metrics.push({ key: "reworkPending", label: "Rework pending", unit, tone: "warn" });
    } else if (kind === "material") {
      for (const m of members) {
        const reqs = requirements.filter((r) => r.orderId === m.orderId);
        const entrySum = (types: string[]) => reqs.reduce((t, r) => t + r.entries.filter((e) => types.includes(e.entryType)).reduce((s, e) => s + num(e.qty), 0), 0);
        const required = reqs.reduce((t, r) => t + num(r.requiredQty), 0);
        const planned = entrySum(["dc"]);
        const received = entrySum(["inward", "receipt"]);
        m.values = { required, planned, received, balance: Math.max(planned - received, 0) };
      }
      metrics = [
        { key: "required", label: "Required", unit: "KG" },
        { key: "planned", label: "Planned", unit: "KG" },
        { key: "received", label: "Received", unit: "KG", tone: "good" },
        { key: "balance", label: "Still owed", unit: "KG", tone: "warn" },
      ];
    } else if (kind === "accessory") {
      const units = new Set<string>();
      for (const m of members) {
        const reqs = accessoryReqs.filter((r) => r.orderId === m.orderId);
        for (const r of reqs) units.add(r.unit);
        const entrySum = (type: string) => reqs.reduce((t, r) => t + r.entries.filter((e) => e.entryType === type).reduce((s, e) => s + num(e.qty), 0), 0);
        m.values = { required: reqs.reduce((t, r) => t + num(r.requiredQty), 0), purchased: entrySum("purchase"), inward: entrySum("inward"), dispatched: entrySum("dispatch") };
      }
      const u = units.size === 1 ? Array.from(units)[0] : units.size > 1 ? "mixed units" : "";
      metrics = [
        { key: "required", label: "Required", unit: u },
        { key: "purchased", label: "Purchased", unit: u },
        { key: "inward", label: "Inward", unit: u },
        { key: "dispatched", label: "Dispatched", unit: u, tone: "good" },
      ];
    } else {
      // Order Confirmation / Pattern Making: the stage entry is the record.
      for (const m of members) {
        const rows = stageEntrySums.filter((r) => r.sectionId === m._plan.id);
        const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((t, r) => t + r._count._all, 0);
        m.values = { completed: count((r) => r.isCompleted) > 0 ? 1 : 0, forwarded: count((r) => r.isForwarded) > 0 ? 1 : 0, entries: count(() => true) };
      }
      metrics = [
        { key: "forwarded", label: "Moved forward", unit: "orders", tone: "warn" },
        { key: "completed", label: "Completed", unit: "orders", tone: "good" },
        { key: "entries", label: "Entries", unit: "" },
      ];
    }

    const totals: Record<string, number> = {};
    for (const metric of metrics) totals[metric.key] = members.reduce((t, m) => t + (m.values[metric.key] ?? 0), 0);

    stages.push({
      stageKey: key,
      stageLabel,
      metrics,
      members: members.map(({ _plan, ...m }) => {
        void _plan;
        return m;
      }),
      totals,
    });
  }

  const seqOf = (key: string) => Math.min(...plans.filter((p) => p.key === key).map((p) => p.seq));
  stages.sort((a, b) => seqOf(a.stageKey) - seqOf(b.stageKey));

  return { groupId: group.id, groupName: group.name, stages };
}
