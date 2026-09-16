"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useStageDefinitions } from "@/hooks/useStageDefinitions";
import { useUsers, useUpdateUser } from "@/hooks/useUsers";
import { useStageAssignments, useUpsertStageAssignment, useDeleteStageAssignment } from "@/hooks/useStageAssignments";
import { PHASES, phaseOf } from "@/lib/stagePhases";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { StagePreviewSandbox } from "@/components/forms/stage/StagePreviewSandbox";
import type { StagePlanCatalogEntry } from "@/lib/stagePlan";
import type { PublicAppUser, StageAssignment } from "@/lib/types";

export default function StageRolesPage() {
  const { data: stages, isLoading: stagesLoading } = useStageDefinitions();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: stageAssignments } = useStageAssignments();
  const updateUser = useUpdateUser();
  /** Which stage's practice form is open, if any - one at a time, held here
   *  rather than per row so the modal never fights another one for the screen. */
  const [previewStage, setPreviewStage] = useState<StagePlanCatalogEntry | null>(null);

  if (stagesLoading || usersLoading) return <Loader label="Loading stage roles…" />;
  if (!stages || !users) return null;

  const covered = new Set(stageAssignments?.map((a) => a.stageDefinitionId)).size;
  const uncoveredStages = stages.filter((s) => !stageAssignments?.some((a) => a.stageDefinitionId === s.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Stage Roles</h1>
        <p className="mt-1 text-sm text-ink-600">
          Default assignees per stage - applied automatically to every order whose plan includes that stage.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Stages covered" value={`${covered}/${stages.length}`} tone="brand" />
        <StatCard label="Nobody assigned" value={uncoveredStages.length} tone={uncoveredStages.length ? "bad" : "good"} />
        <StatCard label="Roles set" value={stageAssignments?.length ?? 0} />
        <StatCard label="Users available" value={users.length} />
      </div>

      {uncoveredStages.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">{uncoveredStages.length} stage(s) with nobody assigned</p>
          <p className="mt-1 text-xs text-amber-800">
            Orders will still flow through them, but nobody will see the work on their list. Marked below.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {uncoveredStages.map((s) => (
              <Badge key={s.id} tone="warn">{s.label}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OrderCreatorAccessCard users={users} onUpdate={updateUser} />
        <JobWorkAccessCard users={users} onUpdate={updateUser} />
      </div>

      {PHASES.map((phase) => {
        const phaseStages = stages.filter((s) => phaseOf(s.key) === phase.key);
        if (phaseStages.length === 0) return null;
        const phaseUncovered = phaseStages.filter((s) => uncoveredStages.some((u) => u.id === s.id)).length;
        return (
          <Card key={phase.key} className={`border-l-4 ${phase.rail}`}>
            <div className={`flex items-center justify-between rounded-t-2xl px-6 py-3 ${phase.band}`}>
              <div>
                <p className={`text-sm font-bold ${phase.text}`}>{phase.label}</p>
                <p className="text-xs text-ink-500">{phase.hint}</p>
              </div>
              {phaseUncovered > 0 && <Badge tone="warn">{phaseUncovered} uncovered</Badge>}
            </div>
            <div className="divide-y divide-ink-100 px-6 py-2">
              {phaseStages.map((stage) => (
                <StageRoleRow
                  key={stage.id}
                  stage={stage}
                  users={users}
                  assignments={stageAssignments ?? []}
                  onPreview={() => setPreviewStage(stage)}
                />
              ))}
            </div>
          </Card>
        );
      })}

      {/* Keyed on the stage id so switching stages rebuilds the sandbox from
          scratch rather than reusing the previous stage's practice data. */}
      <Modal
        open={!!previewStage}
        onClose={() => setPreviewStage(null)}
        title={previewStage ? `${previewStage.label} - practice form` : ""}
        widthClass="max-w-5xl"
      >
        {previewStage && <StagePreviewSandbox key={previewStage.id} stage={previewStage} />}
      </Modal>
    </div>
  );
}

function StageRoleRow({
  stage,
  users,
  assignments,
  onPreview,
}: {
  stage: StagePlanCatalogEntry;
  users: PublicAppUser[];
  assignments: StageAssignment[];
  onPreview: () => void;
}) {
  const toast = useToast();
  const upsert = useUpsertStageAssignment();
  const del = useDeleteStageAssignment();
  const [addUserId, setAddUserId] = useState("");

  const rowsForStage = assignments.filter((a) => a.stageDefinitionId === stage.id);
  const assignedUserIds = new Set(rowsForStage.map((a) => a.userId));
  const availableUsers = users.filter((u) => !assignedUserIds.has(u.id));

  async function add() {
    if (!addUserId) return;
    await upsert.mutateAsync({ userId: addUserId, stageDefinitionId: stage.id, canEnterData: true });
    toast.success(`Added to ${stage.label}.`);
    setAddUserId("");
  }

  async function toggleAccess(a: StageAssignment) {
    await upsert.mutateAsync({ userId: a.userId, stageDefinitionId: a.stageDefinitionId, canEnterData: !a.canEnterData });
  }

  async function remove(a: StageAssignment) {
    await del.mutateAsync(a.id);
    toast.success(`Removed from ${stage.label}.`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-600">
          {stage.typicalDurationDays}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-800">{stage.label}</p>
            <Button size="sm" variant="ghost" className="!px-2 !py-0.5 text-brand hover:text-brand" onClick={onPreview}>
              Preview
            </Button>
          </div>
          <span className="text-[10px] font-semibold uppercase text-ink-400">{stage.unitType}</span>
          {rowsForStage.length === 0 && (
            <p className="text-xs text-amber-700">No default user yet - work at this stage won&apos;t appear on anyone&apos;s list.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {rowsForStage.map((a) => {
          const user = users.find((u) => u.id === a.userId);
          return (
            <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2 py-1 text-xs">
              {user?.name ?? "Unknown"}
              <button onClick={() => toggleAccess(a)}>
                <Badge tone={a.canEnterData ? "neutral" : "info"}>{a.canEnterData ? "Can Enter" : "Monitor"}</Badge>
              </button>
              <button onClick={() => remove(a)} className="text-ink-400 hover:text-status-bad" aria-label="Remove">
                ×
              </button>
            </span>
          );
        })}

        <Select className="!w-40" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
          <option value="">Add a user…</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={add} disabled={!addUserId}>
          Add
        </Button>
      </div>
    </div>
  );
}

function OrderCreatorAccessCard({ users, onUpdate }: { users: PublicAppUser[]; onUpdate: ReturnType<typeof useUpdateUser> }) {
  const toast = useToast();
  const [addUserId, setAddUserId] = useState("");
  const granted = users.filter((u) => u.canCreateOrders);
  const available = users.filter((u) => !u.canCreateOrders && u.role !== "admin" && u.role !== "md");

  return (
    <Card className="p-5">
      <p className="text-sm font-bold text-ink-900">Order Creator Access</p>
      <p className="mt-1 text-xs text-ink-500">
        Lets a user create new orders from their own Home page, using the exact same order-creation form Admin uses.
        Editing or deleting an order stays Admin-only.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {granted.length === 0 && <p className="text-xs text-ink-400">Nobody has this yet - only Admin can create orders.</p>}
        {granted.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2 py-1 text-xs">
            {u.name}
            <button
              onClick={async () => {
                await onUpdate.mutateAsync({ id: u.id, canCreateOrders: false });
                toast.success(`Removed order-creator access from ${u.name}.`);
              }}
              className="text-ink-400 hover:text-status-bad"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Select className="flex-1" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
          <option value="">Grant to…</option>
          {available.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          disabled={!addUserId}
          onClick={async () => {
            const user = users.find((u) => u.id === addUserId);
            await onUpdate.mutateAsync({ id: addUserId, canCreateOrders: true });
            toast.success(`${user?.name} can now create orders.`);
            setAddUserId("");
          }}
        >
          Grant
        </Button>
      </div>
    </Card>
  );
}

function JobWorkAccessCard({ users, onUpdate }: { users: PublicAppUser[]; onUpdate: ReturnType<typeof useUpdateUser> }) {
  const toast = useToast();
  const [addUserId, setAddUserId] = useState("");
  const granted = users.filter((u) => u.canJobWork);
  const available = users.filter((u) => !u.canJobWork && u.role !== "admin" && u.role !== "md");

  return (
    <Card className="p-5">
      <p className="text-sm font-bold text-ink-900">Job Work Access</p>
      <p className="mt-1 text-xs text-ink-500">
        Lets a user log externally-manufactured quantities against any order and any stage, kept separate from
        in-house production numbers.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {granted.length === 0 && <p className="text-xs text-ink-400">Nobody has this yet - no job work is being logged.</p>}
        {granted.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2 py-1 text-xs">
            {u.name}
            <button
              onClick={async () => {
                await onUpdate.mutateAsync({ id: u.id, canJobWork: false });
                toast.success(`Removed job-work access from ${u.name}.`);
              }}
              className="text-ink-400 hover:text-status-bad"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Select className="flex-1" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
          <option value="">Grant to…</option>
          {available.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          disabled={!addUserId}
          onClick={async () => {
            const user = users.find((u) => u.id === addUserId);
            await onUpdate.mutateAsync({ id: addUserId, canJobWork: true });
            toast.success(`${user?.name} can now log job work.`);
            setAddUserId("");
          }}
        >
          Grant
        </Button>
      </div>
    </Card>
  );
}
