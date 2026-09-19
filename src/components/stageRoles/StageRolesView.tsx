"use client";

import { useMemo, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useUpdateUser } from "@/hooks/useUsers";
import { useUpsertStageAssignment, useDeleteStageAssignment } from "@/hooks/useStageAssignments";
import { PHASES, phaseOf } from "@/lib/stagePhases";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { AccentCard, SectionTitle } from "@/components/ui/SectionCard";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { HealthOverviewCard, SummaryCard } from "@/components/ui/OverviewCards";
import { StagePreviewSandbox } from "@/components/forms/stage/StagePreviewSandbox";
import type { StagePlanCatalogEntry } from "@/lib/stagePlan";
import type { PublicAppUser, StageAssignment } from "@/lib/types";

type Coverage = "covered" | "uncovered";
type CoverageFilter = "all" | Coverage;

/**
 * Stage Roles, given its data - split from the route so the layout can be
 * rendered without the fetches. The mutations (assign, remove, grant access)
 * are hooks inside the pieces that use them, exactly as before.
 *
 * An overview of which stages have a default assignee, the three
 * assignment tools, then every stage grouped by phase. The overview's bar and
 * tiles filter the list: click "Nobody assigned" to see just the gaps.
 */
export function StageRolesView({ stages, users, stageAssignments }: { stages: StagePlanCatalogEntry[]; users: PublicAppUser[]; stageAssignments: StageAssignment[] }) {
  const updateUser = useUpdateUser();
  /** Which stage's practice form is open, if any - one at a time, held here
   *  rather than per row so the modal never fights another one for the screen. */
  const [previewStage, setPreviewStage] = useState<StagePlanCatalogEntry | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CoverageFilter>("all");
  const resultsRef = useRef<HTMLDivElement>(null);

  const coveredIds = useMemo(() => new Set(stageAssignments.map((a) => a.stageDefinitionId)), [stageAssignments]);
  const isCovered = (s: StagePlanCatalogEntry) => coveredIds.has(s.id);
  const uncoveredStages = useMemo(() => stages.filter((s) => !coveredIds.has(s.id)), [stages, coveredIds]);
  const coveredCount = stages.length - uncoveredStages.length;

  // Search narrows the pool first; the tabs (and their counts) then operate
  // on whatever it left behind.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? stages.filter((s) => s.label.toLowerCase().includes(q)) : stages;
  }, [stages, search]);
  const counts = useMemo(() => {
    const uncovered = searched.filter((s) => !coveredIds.has(s.id)).length;
    return { all: searched.length, covered: searched.length - uncovered, uncovered };
  }, [searched, coveredIds]);
  const visible = useMemo(() => (filter === "all" ? searched : searched.filter((s) => (filter === "covered") === coveredIds.has(s.id))), [searched, filter, coveredIds]);

  function selectCoverage(coverage: Coverage) {
    const next = filter === coverage ? "all" : coverage;
    setFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const segments: HealthSegment[] = [
    { key: "covered", label: "Covered", color: "#059669", count: coveredCount },
    { key: "uncovered", label: "Nobody assigned", color: "#E11D48", count: uncoveredStages.length, alert: true },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <HealthOverviewCard
          tone="rose"
          icon="🎯"
          title="Stage coverage"
          subtitle="Default assignees per stage - applied to every order whose plan includes it."
          headlineLabel="Stages in the catalog"
          headline={stages.length}
          badge={uncoveredStages.length > 0 ? { tone: "bad", text: `${uncoveredStages.length} with nobody assigned` } : { tone: "good", text: "Every stage covered" }}
          segments={segments}
          total={stages.length}
          ariaLabel={`Stage coverage: ${coveredCount} covered, ${uncoveredStages.length} with nobody assigned`}
          activeKey={filter === "all" ? null : filter}
          onSelect={(key) => selectCoverage(key as Coverage)}
          unitLabel="stages"
        >
          {uncoveredStages.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Nobody assigned to these yet</p>
              <p className="mt-0.5 text-[11px] text-amber-800">Orders will still flow through them, but nobody will see the work on their list. Marked below.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {uncoveredStages.map((s) => (
                  <Badge key={s.id} tone="warn">
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </HealthOverviewCard>

        <SummaryCard
          tone="violet"
          icon="👥"
          title="Assignments"
          subtitle="Default roles across the stages."
          headline={stageAssignments.length}
          headlineLabel="default roles set"
          tiles={[
            { label: "Users", value: users.length },
            { label: "Can enter", value: stageAssignments.filter((a) => a.canEnterData).length },
            { label: "Order creators", value: users.filter((u) => u.canCreateOrders).length },
            { label: "Job work", value: users.filter((u) => u.canJobWork).length },
          ]}
        />
      </div>

      <BulkAssignCard stages={stages} users={users} assignments={stageAssignments} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OrderCreatorAccessCard users={users} onUpdate={updateUser} />
        <JobWorkAccessCard users={users} onUpdate={updateUser} />
      </div>

      <div ref={resultsRef} className="scroll-mt-6 space-y-6">
        <Card>
          <CardBody className="space-y-4">
            <SearchInput label="Find a stage" placeholder="Type a stage name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <FilterTabs
              value={filter}
              onChange={setFilter}
              tabs={[
                { key: "all", label: "All", count: counts.all },
                { key: "uncovered", label: "Nobody Assigned", count: counts.uncovered },
                { key: "covered", label: "Covered", count: counts.covered },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span>
                {visible.length} of {stages.length} stages
              </span>
              {(filter !== "all" || search.trim() !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                  className="font-semibold text-brand hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </CardBody>
        </Card>

        {visible.length === 0 && (
          <Card>
            <CardBody>
              <p className="py-6 text-center text-sm text-ink-500">No stages match these filters.</p>
            </CardBody>
          </Card>
        )}

        {PHASES.map((phase) => {
          const phaseStages = visible.filter((s) => phaseOf(s.key) === phase.key);
          if (phaseStages.length === 0) return null;
          const phaseUncovered = phaseStages.filter((s) => !isCovered(s)).length;
          return (
            <Card key={phase.key} className={`overflow-hidden border-l-4 ${phase.rail}`}>
              <div className={`flex items-center gap-3 px-5 py-3 ${phase.band}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm ${phase.chip}`} aria-hidden>
                  {phase.initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${phase.text}`}>{phase.label}</p>
                  <p className="text-xs text-ink-500">{phase.hint}</p>
                </div>
                {phaseUncovered > 0 && <Badge tone="warn">{phaseUncovered} uncovered</Badge>}
              </div>
              <div className="space-y-1 px-3 py-3">
                {phaseStages.map((stage) => (
                  <StageRoleRow key={stage.id} stage={stage} users={users} assignments={stageAssignments} onPreview={() => setPreviewStage(stage)} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Keyed on the stage id so switching stages rebuilds the sandbox from
          scratch rather than reusing the previous stage's practice data. */}
      <Modal open={!!previewStage} onClose={() => setPreviewStage(null)} title={previewStage ? `${previewStage.label} - practice form` : ""} widthClass="max-w-5xl">
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
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors ${rowsForStage.length === 0 ? "bg-amber-50/70" : "hover:bg-white/60"}`}>
      <div className="flex items-center gap-3">
        <span
          title={`Typical duration: ${stage.typicalDurationDays} day${stage.typicalDurationDays === 1 ? "" : "s"}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-ink-600 shadow-[0_4px_10px_-6px_rgba(30,41,90,0.5)]"
        >
          {stage.typicalDurationDays}d
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-800">{stage.label}</p>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${stage.unitType === "KG" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>{stage.unitType}</span>
            <Button size="sm" variant="ghost" className="!px-2 !py-0.5 text-brand hover:text-brand" onClick={onPreview}>
              Preview
            </Button>
          </div>
          {rowsForStage.length === 0 && <p className="text-xs text-amber-700">No default user yet - work at this stage won&apos;t appear on anyone&apos;s list.</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {rowsForStage.map((a) => {
          const user = users.find((u) => u.id === a.userId);
          return (
            <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white px-2 py-1 text-xs shadow-[0_4px_10px_-8px_rgba(30,41,90,0.5)]">
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
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={add} disabled={!addUserId}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Assigns one user as the default for every stage in the catalog in one
 *  go, instead of adding them stage-by-stage below. Each stage is still its
 *  own StageAssignment row underneath (upserted by userId+stageDefinitionId,
 *  same as the per-row "Add" button), so removing or adjusting one stage
 *  afterward works exactly like it always has. */
function BulkAssignCard({ stages, users, assignments }: { stages: StagePlanCatalogEntry[]; users: PublicAppUser[]; assignments: StageAssignment[] }) {
  const toast = useToast();
  const upsert = useUpsertStageAssignment();
  const [userId, setUserId] = useState("");
  const [canEnterData, setCanEnterData] = useState(true);
  const [running, setRunning] = useState(false);

  const existingCount = userId ? assignments.filter((a) => a.userId === userId).length : 0;

  async function assignAll() {
    if (!userId) return;
    setRunning(true);
    try {
      for (const stage of stages) {
        await upsert.mutateAsync({ userId, stageDefinitionId: stage.id, canEnterData });
      }
      const user = users.find((u) => u.id === userId);
      toast.success(`${user?.name ?? "User"} assigned to all ${stages.length} stages.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign every stage.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <AccentCard tone="sky">
      <CardHeader
        title={<SectionTitle icon="⚡" tone="sky">Assign All Stages</SectionTitle>}
        subtitle="Make one user the default assignee across every stage, in a single click."
      />
      <div className="px-6 py-5">
        <div className="flex flex-wrap items-end gap-2">
          <Select className="min-w-[12rem] flex-1" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select className="!w-40" value={canEnterData ? "enter" : "monitor"} onChange={(e) => setCanEnterData(e.target.value === "enter")}>
            <option value="enter">Can Enter Data</option>
            <option value="monitor">Monitor Only</option>
          </Select>
          <Button size="sm" disabled={!userId} isLoading={running} onClick={assignAll}>
            Assign to All {stages.length} Stages
          </Button>
        </div>
        {userId && existingCount > 0 && (
          <p className="mt-2 text-xs text-ink-500">
            Already the default on {existingCount} of {stages.length} stages - this fills in the rest and syncs the access level above across all of them.
          </p>
        )}
      </div>
    </AccentCard>
  );
}

type UpdateUser = ReturnType<typeof useUpdateUser>;

/** One "grant this permission to a user" card - the two access cards below
 *  differ only in the flag they flip and their wording. */
function AccessCard({
  tone,
  icon,
  title,
  description,
  emptyText,
  users,
  onUpdate,
  flag,
  grantedToast,
  removedToast,
}: {
  tone: "emerald" | "amber";
  icon: string;
  title: string;
  description: string;
  emptyText: string;
  users: PublicAppUser[];
  onUpdate: UpdateUser;
  flag: "canCreateOrders" | "canJobWork";
  grantedToast: (name: string) => string;
  removedToast: (name: string) => string;
}) {
  const toast = useToast();
  const [addUserId, setAddUserId] = useState("");
  const granted = users.filter((u) => u[flag]);
  const available = users.filter((u) => !u[flag] && u.role !== "admin" && u.role !== "md");

  return (
    <AccentCard tone={tone}>
      <CardHeader title={<SectionTitle icon={icon} tone={tone}>{title}</SectionTitle>} subtitle={`${granted.length} ${granted.length === 1 ? "person has" : "people have"} this access.`} />
      <div className="px-6 py-5">
        <p className="text-xs text-ink-500">{description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {granted.length === 0 && <p className="text-xs text-ink-400">{emptyText}</p>}
          {granted.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white px-2 py-1 text-xs shadow-[0_4px_10px_-8px_rgba(30,41,90,0.5)]">
              {u.name}
              <button
                onClick={async () => {
                  await onUpdate.mutateAsync({ id: u.id, [flag]: false });
                  toast.success(removedToast(u.name));
                }}
                className="text-ink-400 hover:text-status-bad"
                aria-label={`Remove ${u.name}`}
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
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!addUserId}
            onClick={async () => {
              const user = users.find((u) => u.id === addUserId);
              await onUpdate.mutateAsync({ id: addUserId, [flag]: true });
              toast.success(grantedToast(user?.name ?? "User"));
              setAddUserId("");
            }}
          >
            Grant
          </Button>
        </div>
      </div>
    </AccentCard>
  );
}

function OrderCreatorAccessCard({ users, onUpdate }: { users: PublicAppUser[]; onUpdate: UpdateUser }) {
  return (
    <AccessCard
      tone="emerald"
      icon="📝"
      title="Order Creator Access"
      description="Lets a user create new orders from their own Home page, using the exact same order-creation form Admin uses. Editing or deleting an order stays Admin-only."
      emptyText="Nobody has this yet - only Admin can create orders."
      users={users}
      onUpdate={onUpdate}
      flag="canCreateOrders"
      grantedToast={(name) => `${name} can now create orders.`}
      removedToast={(name) => `Removed order-creator access from ${name}.`}
    />
  );
}

function JobWorkAccessCard({ users, onUpdate }: { users: PublicAppUser[]; onUpdate: UpdateUser }) {
  return (
    <AccessCard
      tone="amber"
      icon="🧵"
      title="Job Work Access"
      description="Lets a user log externally-manufactured quantities against any order and any stage, kept separate from in-house production numbers."
      emptyText="Nobody has this yet - no job work is being logged."
      users={users}
      onUpdate={onUpdate}
      flag="canJobWork"
      grantedToast={(name) => `${name} can now log job work.`}
      removedToast={(name) => `Removed job-work access from ${name}.`}
    />
  );
}
