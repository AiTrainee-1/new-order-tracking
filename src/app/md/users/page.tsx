"use client";

import { useMemo } from "react";
import { useUsers } from "@/hooks/useUsers";
import { useAssignments } from "@/hooks/useAssignments";
import { useStageAssignments } from "@/hooks/useStageAssignments";
import { useStageDefinitions } from "@/hooks/useStageDefinitions";
import { Loader } from "@/components/ui/Loader";
import { UsersMdView, type AssignedWork } from "@/components/users/UsersMdView";

/**
 * MD's Users view - a directory, not a data table: one card per person,
 * showing exactly what they're on right now (see UsersMdView for the layout).
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

  // A stage counts as covered once anyone's work carries its label.
  const stageCoverage = useMemo(() => {
    const covered = new Set<string>();
    for (const work of workByUser.values()) for (const w of work) covered.add(w.label);
    const stages = catalog ?? [];
    return { covered: stages.filter((s) => covered.has(s.label)).length, total: stages.length };
  }, [workByUser, catalog]);

  if (usersLoading || assignmentsLoading || defaultsLoading || catalogLoading) {
    return <Loader full label="Loading users…" />;
  }

  return <UsersMdView users={users ?? []} workByUser={workByUser} stageCoverage={stageCoverage} />;
}
