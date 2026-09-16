"use client";

import { useMemo } from "react";
import { useUsers } from "@/hooks/useUsers";
import { useAssignments } from "@/hooks/useAssignments";
import { useStageAssignments } from "@/hooks/useStageAssignments";
import { useStageDefinitions } from "@/hooks/useStageDefinitions";
import { Badge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { StatCard } from "@/components/ui/StatCard";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, type CardStatusTone } from "@/lib/theme";
import type { PublicAppUser } from "@/lib/types";

interface AssignedWork {
  label: string;
  /** From a global Stage Roles default (applies to every order whose plan
   * includes the stage) rather than a one-off assignment scoped to a
   * specific order/PO. */
  isDefault: boolean;
}

/**
 * MD's Users view - a directory, not a data table: one card per person,
 * showing exactly what they're on right now.
 *
 * "Assigned work" folds together BOTH ways a person ends up covering a
 * section - an explicit per-order row from Assign Work (user_assignments,
 * whose section already carries its own label since it's a frozen
 * OrderStagePlan row) and a global default from Stage Roles
 * (stage_assignments, keyed by the catalog stageDefinitionId and resolved
 * against the stage catalog here). Deduped by label rather than by section
 * id, since the same catalog stage's id differs across every order's own
 * plan now - what this card answers is "what does this person do", not
 * "how many order-rows are they on".
 */
export default function MdUsersPage() {
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();
  const { data: stageDefaults, isLoading: defaultsLoading } = useStageAssignments();
  const { data: catalog, isLoading: catalogLoading } = useStageDefinitions();

  const catalogById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of catalog ?? []) map.set(s.id, s.label);
    return map;
  }, [catalog]);

  const workByUser = useMemo(() => {
    const map = new Map<string, Map<string, AssignedWork>>();
    function add(userId: string, label: string | null | undefined, isDefault: boolean) {
      if (!label) return;
      if (!map.has(userId)) map.set(userId, new Map());
      const byLabel = map.get(userId)!;
      // A default doesn't override a more specific per-order assignment, or
      // vice versa - either way it's the same stage, so first one wins.
      if (!byLabel.has(label)) byLabel.set(label, { label, isDefault });
    }
    for (const a of assignments ?? []) add(a.userId, a.section?.label, false);
    for (const sa of stageDefaults ?? []) add(sa.userId, catalogById.get(sa.stageDefinitionId), true);

    const result = new Map<string, AssignedWork[]>();
    for (const [userId, byLabel] of map) {
      result.set(userId, Array.from(byLabel.values()).sort((a, b) => a.label.localeCompare(b.label)));
    }
    return result;
  }, [assignments, stageDefaults, catalogById]);

  if (usersLoading || assignmentsLoading || defaultsLoading || catalogLoading) {
    return <Loader full label="Loading users…" />;
  }

  const list = users ?? [];
  const activeCount = list.filter((u) => u.isActive).length;
  const unassignedCount = list.filter((u) => (workByUser.get(u.id) ?? []).length === 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Users</h1>
        <p className="text-sm text-ink-500">Every account and exactly what production section(s) they&apos;re working on.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Users" value={list.length} tone="brand" icon="👥" />
        <StatCard label="Active Accounts" value={activeCount} tone="good" icon="✓" />
        <StatCard label="Unassigned" value={unassignedCount} tone={unassignedCount ? "warn" : "good"} icon="⧗" />
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-ink-100 bg-white/70 px-4 py-10 text-center text-sm text-ink-500">No user accounts yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((u) => (
            <UserWorkCard key={u.id} user={u} work={workByUser.get(u.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserWorkCard({ user, work }: { user: PublicAppUser; work: AssignedWork[] }) {
  const tone: CardStatusTone = work.length > 0 ? "completed" : "notStarted";

  return (
    <div style={cardStatusSoftBg[tone]} className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl border ${cardStatusBorder[tone]} p-4 ${cardStatusShadow[tone]}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cardStatusAccent[tone] }} />

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-md" style={{ backgroundColor: cardStatusAccent[tone] }}>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
          <p className="truncate text-xs text-ink-600">@{user.username}</p>
        </div>
        <Badge tone={user.isActive ? "good" : "bad"}>{user.isActive ? "Active" : "Inactive"}</Badge>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Role</span>
        <Badge tone="brand">{user.role}</Badge>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Assigned Work</p>
        {work.length === 0 ? (
          <p className="text-xs text-ink-400">No section assigned yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {work.map((w) => (
              <Badge key={w.label} tone={w.isDefault ? "info" : "neutral"}>
                {w.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
