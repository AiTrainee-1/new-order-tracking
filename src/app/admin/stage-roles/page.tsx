"use client";

import { useStageDefinitions } from "@/hooks/useStageDefinitions";
import { useUsers } from "@/hooks/useUsers";
import { useStageAssignments } from "@/hooks/useStageAssignments";
import { Loader } from "@/components/ui/Loader";
import { StageRolesView } from "@/components/stageRoles/StageRolesView";

/** Stage Roles - the default assignees per stage. This route loads the
 *  catalog, the users and the current assignments; the layout and the
 *  assignment tools live in StageRolesView. */
export default function StageRolesPage() {
  const { data: stages, isLoading: stagesLoading, isError: stagesError } = useStageDefinitions();
  const { data: users, isLoading: usersLoading, isError: usersError } = useUsers();
  const { data: stageAssignments, isError: assignmentsError } = useStageAssignments();

  if (stagesLoading || usersLoading) return <Loader label="Loading stage roles…" />;
  // A failed assignments fetch would otherwise read as "nobody is assigned".
  if (!stages || !users || stagesError || usersError || assignmentsError) {
    return <p className="text-sm text-status-bad">Couldn&apos;t load stage roles. Check the database connection.</p>;
  }

  return <StageRolesView stages={stages} users={users} stageAssignments={stageAssignments ?? []} />;
}
