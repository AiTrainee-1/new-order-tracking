"use client";

import type { WorkItem } from "@/hooks/useMyWork";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { HealthOverviewCard, SummaryCard } from "@/components/ui/OverviewCards";
import { cardStatusAccent } from "@/lib/theme";

export type WorkStatus = "active" | "locked" | "completed";

/**
 * The headline numbers for a person's own work, in the same two-card shape as
 * the Admin Orders overview: where all their assignments stand (the shared
 * health bar - click a status to filter the list below), and what the workload
 * is made of. Counts follow whatever search / buyer / order scope is applied,
 * exactly as the tabs under the filter bar do.
 */
export function WorkOverview({
  items,
  activeStatus,
  onSelectStatus,
}: {
  items: WorkItem[];
  activeStatus: WorkStatus | null;
  onSelectStatus: (status: WorkStatus) => void;
}) {
  const counts: Record<WorkStatus, number> = { active: 0, locked: 0, completed: 0 };
  let owed = 0;
  let monitor = 0;
  const orders = new Set<string>();
  for (const w of items) {
    counts[w.gateStatus]++;
    if (w.stageProgress?.isPartial) owed++;
    if (!w.assignment.canEnterData) monitor++;
    orders.add(w.assignment.order?.id ?? w.assignment.id);
  }

  // Healthiest first, as the bar expects: done, waiting, then what needs doing.
  const segments: HealthSegment[] = [
    { key: "completed", label: "Completed", color: cardStatusAccent.completed, count: counts.completed },
    { key: "locked", label: "Waiting", color: "#94A3B8", count: counts.locked },
    { key: "active", label: "Your turn", color: cardStatusAccent.yourTurn, count: counts.active },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <HealthOverviewCard
        tone="amber"
        icon="✍️"
        title="Your work at a glance"
        subtitle="Click a status to see just those assignments."
        headlineLabel="Assignments"
        headline={items.length}
        badge={counts.active > 0 ? { tone: "warn", text: `${counts.active} need${counts.active === 1 ? "s" : ""} your input` } : items.length > 0 ? { tone: "good", text: "All caught up" } : null}
        segments={segments}
        total={items.length}
        ariaLabel={`Your work: ${counts.active} your turn, ${counts.locked} waiting, ${counts.completed} completed`}
        activeKey={activeStatus}
        onSelect={(key) => onSelectStatus(key as WorkStatus)}
        unitLabel="assignments"
      />
      <SummaryCard
        tone="sky"
        icon="🧵"
        title="My workload"
        subtitle="Across your assigned stages."
        headline={orders.size}
        headlineLabel={orders.size === 1 ? "order" : "orders"}
        tiles={[
          { label: "Stages", value: items.length },
          { label: "Your turn", value: counts.active, valueClass: counts.active > 0 ? "text-amber-600" : undefined },
          { label: "Owe a balance", value: owed, valueClass: owed > 0 ? "text-amber-600" : undefined },
          { label: "Monitor only", value: monitor },
        ]}
      />
    </div>
  );
}
