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
  const { data: stages, isLoading: stagesLoading } = useStageDefinitions();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: stageAssignments } = useStageAssignments();

  if (stagesLoading || usersLoading) return <Loader label="Loading stage roles…" />;
  if (!stages || !users) return null;

  return <StageRolesView stages={stages} users={users} stageAssignments={stageAssignments ?? []} />;
}
