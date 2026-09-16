"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useMyWork, workBadge, type GateStatus, type WorkItem } from "@/hooks/useMyWork";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/FormControls";
import { SearchInput } from "@/components/ui/SearchInput";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { orderImageUrl } from "@/lib/imageUrl";
import { formatDisplayDate } from "@/lib/workflow";
import { GameLevelPath } from "@/components/dashboard/GameLevelPath";
import { NextStagesStrip } from "@/components/dashboard/NextStagesStrip";
import { BackButton } from "@/components/ui/BackButton";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Tabs } from "@/components/ui/Tabs";
import { StageFormRouter } from "@/components/forms/stage/StageFormRouter";
import { cardStatusAccent, cardStatusBorder, cardStatusLabel, cardStatusShadow, cardStatusSoftBg, type CardStatusTone } from "@/lib/theme";

/** Ordering priority for work lists: actionable first, done last. */
const GATE_PRIORITY: Record<GateStatus, number> = { active: 0, locked: 1, completed: 2 };

type StatusFilter = "all" | "active" | "locked" | "completed";
const ALL_ORDERS = "all";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Your Turn" },
  { key: "locked", label: "Waiting" },
  { key: "completed", label: "Completed" },
];

function matchesQuery(item: WorkItem, query: string): boolean {
  if (!query) return true;
  const { assignment } = item;
  const haystack = [assignment.order?.style, assignment.order?.ioNo, assignment.order?.color, assignment.section?.label, assignment.po?.poNumber]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesStatus(item: WorkItem, status: StatusFilter): boolean {
  if (status === "all") return true;
  return item.gateStatus === status;
}

/** Orange wins outright - it's the one state that means "act now." Otherwise
 * the same grey/blue/green ladder as the order cards: not started, started,
 * completed. */
function assignmentCardTone(item: WorkItem): CardStatusTone {
  if (item.gateStatus === "active") return "yourTurn";
  if (item.gateStatus === "completed") return "completed";
  return item.orderProgress.completedStagesCount > 0 ? "started" : "notStarted";
}

const PAGE_SIZE = 8;

export default function DataInputPage() {
  return (
    <Suspense fallback={<Loader full label="Loading…" />}>
      <DataInputPageInner />
    </Suspense>
  );
}

function DataInputPageInner() {
  const { appUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workItems, isLoading, isError } = useMyWork(appUser?.id);
  const queryClient = useQueryClient();

  const [selectedAssignmentId, setSelectedAssignmentId] = useState(searchParams.get("assignment") ?? "");
  const [query, setQuery] = useState("");
  const [orderId, setOrderId] = useState(ALL_ORDERS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fromUrl = searchParams.get("assignment");
    if (fromUrl && fromUrl !== selectedAssignmentId) setSelectedAssignmentId(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selected = workItems.find((w) => w.assignment.id === selectedAssignmentId);

  const searched = useMemo(() => workItems.filter((w) => matchesQuery(w, query)), [workItems, query]);

  // Every order the user has any assignment in, regardless of the current
  // search or status tab - a stable pick list, same as the Home page's.
  const orderOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; ioNo: string }>();
    for (const w of workItems) {
      const order = w.assignment.order;
      if (!order || byId.has(order.id)) continue;
      byId.set(order.id, { id: order.id, label: `${order.style} · IO ${order.ioNo}${order.color ? ` · ${order.color}` : ""}`, ioNo: order.ioNo });
    }
    return Array.from(byId.values()).sort((a, b) => a.ioNo.localeCompare(b.ioNo, undefined, { numeric: true }));
  }, [workItems]);

  const scoped = useMemo(() => (orderId === ALL_ORDERS ? searched : searched.filter((w) => w.assignment.order?.id === orderId)), [searched, orderId]);

  // Grouped by order so every row belonging to the same order stays
  // together, in that order's own stage sequence, instead of one global
  // priority sort that scatters a single order's rows apart from each
  // other. Which order comes first still favours actionable work: an
  // order with any Your-Turn row floats above one that's all Waiting/Done.
  const filtered = useMemo(() => {
    const items = scoped.filter((w) => matchesStatus(w, statusFilter));

    const byOrder = new Map<string, WorkItem[]>();
    for (const w of items) {
      const oid = w.assignment.order?.id ?? w.assignment.id;
      if (!byOrder.has(oid)) byOrder.set(oid, []);
      byOrder.get(oid)!.push(w);
    }
    for (const group of byOrder.values()) {
      group.sort((a, b) => (a.assignment.section?.seq ?? 0) - (b.assignment.section?.seq ?? 0));
    }

    return Array.from(byOrder.values())
      .sort((a, b) => {
        const aPriority = Math.min(...a.map((w) => GATE_PRIORITY[w.gateStatus]));
        const bPriority = Math.min(...b.map((w) => GATE_PRIORITY[w.gateStatus]));
        if (aPriority !== bPriority) return aPriority - bPriority;
        return (a[0].assignment.order?.ioNo ?? "").localeCompare(b[0].assignment.order?.ioNo ?? "", undefined, { numeric: true });
      })
      .flat();
  }, [scoped, statusFilter]);
  // Scoped to the chosen order, so the tabs count within it - "Your Turn"
  // means your turn on THIS order, not across every assignment.
  const tabCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: scoped.length, active: 0, locked: 0, completed: 0 };
    for (const w of scoped) counts[w.gateStatus]++;
    return counts;
  }, [scoped]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function selectAssignment(id: string) {
    setSelectedAssignmentId(id);
    router.push(id ? `/user/data-input?assignment=${id}` : "/user/data-input");
  }

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateOrder(value: string) {
    setOrderId(value);
    setPage(1);
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  if (isLoading) return <Loader full label="Loading your assignments…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load your assignments.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Data Input</h1>
        <p className="text-sm text-ink-500">Find an order to view its workflow and log production movement.</p>
      </div>

      {workItems.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">You have no assignments yet. Contact your Admin.</p>
          </CardBody>
        </Card>
      ) : selected ? (
        <SelectedAssignmentView item={selected} onChangeOrder={() => selectAssignment("")} onForwarded={() => queryClient.invalidateQueries({ queryKey: ["my_work_entries"] })} />
      ) : (
        <>
          <Card>
            <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
              <SearchInput label="Find an order" placeholder="Type a style, IO number, color, PO, or section…" value={query} onChange={(e) => updateQuery(e.target.value)} autoFocus />
              <Select label="Choose Order" value={orderId} onChange={(e) => updateOrder(e.target.value)}>
                <option value={ALL_ORDERS}>All orders ({orderOptions.length})</option>
                {orderOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </CardBody>
          </Card>

          <FilterTabs value={statusFilter} onChange={updateStatusFilter} tabs={STATUS_TABS.map((t) => ({ ...t, count: tabCounts[t.key] }))} />

          <p className="text-xs text-ink-500">
            {filtered.length} matching assignment{filtered.length === 1 ? "" : "s"}
          </p>

          <div className="space-y-3">
            {pageItems.map((item) => {
              const { assignment, orderProgress } = item;
              const order = assignment.order;
              const imageUrl = orderImageUrl(order?.imageId);
              const currentStageLabel = orderProgress.stages[orderProgress.currentStageIndex]?.stage.label;
              const nextAction = !assignment.canEnterData
                ? "Monitor only - tap to view status"
                : item.stageProgress?.isPartial
                  ? `Moved on without completing - ${item.stageProgress.qtyPending.toLocaleString()} ${item.stageProgress.stage.unitType} still owed here`
                  : item.gateStatus === "completed"
                    ? "Your part is done - you can still record late entries"
                    : item.gateStatus === "locked"
                      ? `Waiting - order is currently at "${currentStageLabel}"`
                      : "Your turn - tap to enter today's production data";

              const tone = assignmentCardTone(item);

              return (
                <button
                  key={item.assignment.id}
                  type="button"
                  onClick={() => selectAssignment(item.assignment.id)}
                  style={cardStatusSoftBg[tone]}
                  className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border ${cardStatusBorder[tone]} p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 ${cardStatusShadow[tone]}`}
                >
                  <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: cardStatusAccent[tone] }} />

                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-2 ring-inset" style={{ boxShadow: `inset 0 0 0 2px ${cardStatusAccent[tone]}33` }}>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={order?.style} className="h-full w-full object-cover" />
                    ) : (
                      <GarmentPlaceholder className="h-6 w-6 text-ink-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-ink-900">
                        {order?.style} - {assignment.section?.label}
                      </p>
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: cardStatusAccent[tone] }}>
                        {cardStatusLabel[tone]}
                      </span>
                    </div>
                    <p className="truncate text-xs text-ink-600">
                      IO {order?.ioNo} · {order?.color}
                      {assignment.po ? ` · PO ${assignment.po.poNumber}` : ""}
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={orderProgress.overallProgressPct} showLabel size="sm" />
                    </div>
                    <div className="mt-2">
                      <NextStagesStrip stages={orderProgress.stages} currentStageIndex={orderProgress.currentStageIndex} />
                    </div>
                    <p className={`mt-1.5 text-xs font-semibold ${item.stageProgress?.isPartial ? "text-amber-700" : "text-ink-800"}`}>{nextAction}</p>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <Card>
                <CardBody>
                  <p className="text-sm text-ink-500">No assignments match your search.</p>
                </CardBody>
              </Card>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                ← Previous
              </Button>
              <span className="text-xs text-ink-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SelectedAssignmentView({ item, onChangeOrder, onForwarded }: { item: WorkItem; onChangeOrder: () => void; onForwarded: () => void }) {
  const { assignment, orderProgress, gateStatus } = item;
  const order = assignment.order!;
  const imageUrl = orderImageUrl(order.imageId);
  const gate = workBadge(item);
  const isPartial = item.stageProgress?.isPartial ?? false;
  const currentStage = orderProgress.stages[orderProgress.currentStageIndex]?.stage;
  const [activeTab, setActiveTab] = useState<"entry" | "details">("entry");
  const showDetails = activeTab === "details";

  return (
    <div className="space-y-6">
      <BackButton onClick={onChangeOrder} label="Change Order" />

      {/* Compact, always-visible orientation strip. Everything else about the
          order lives one tab away - the data-entry form is the point of this
          page, not a recap of what's already on file. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink-900">
            {order.style} - {assignment.section?.label}
          </p>
          <p className="truncate text-xs text-ink-500">
            IO {order.ioNo}
            {assignment.po ? ` · PO ${assignment.po.poNumber}` : ""}
          </p>
        </div>
        <Badge tone={gate.tone}>{gate.label}</Badge>
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: "entry", label: "Data Entry" },
          { key: "details", label: "Order Details" },
        ]}
      />

      {/* Order Details tab surfaces the reference material - order info,
          this stage's running totals, and (via showDetails on the form
          below) each form's own summary/reference content. Data Entry stays
          on the compact view. Either way the work itself - the entries
          history and add-entry row inside StageFormRouter - stays reachable
          on both tabs; only the surrounding reference content toggles. */}
      {activeTab === "details" && (
        <>
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white/70">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
                  ) : (
                    <GarmentPlaceholder className="h-7 w-7 text-ink-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink-900">{order.style}</p>
                  <p className="truncate text-xs text-ink-500">
                    IO {order.ioNo} · {order.color}
                    {assignment.po ? ` · PO ${assignment.po.poNumber}` : ""} · Delivery {formatDisplayDate(order.deliveryDate)}
                  </p>
                </div>
              </div>
              <ProgressBar value={orderProgress.overallProgressPct} showLabel />
            </CardBody>
          </Card>

          {gateStatus === "completed" && item.stageProgress && (
            <Card>
              <CardHeader title="Your Stage Summary" subtitle={assignment.section?.label} />
              <CardBody>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label={`Qty (${item.stageProgress.stage.unitType})`} value={item.stageProgress.qtyReceived} />
                  <Stat label="Forwarded" value={item.stageProgress.qtyForwarded} />
                  <Stat label="Shortage" value={item.stageProgress.qtyShortage} tone={item.stageProgress.qtyShortage > 0 ? "bad" : undefined} />
                  <Stat label="Last Update" value={formatDisplayDate(item.stageProgress.lastEntryDate)} />
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {isPartial && item.stageProgress && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          This stage was moved on without being completed -{" "}
          <b>
            {item.stageProgress.qtyPending.toLocaleString()} {item.stageProgress.stage.unitType}
          </b>{" "}
          is still owed here. The next stage has already started; record the balance below and use <b>Completed – Move Forward</b> when it&apos;s finished.
        </p>
      )}

      {/* Data entry stays available after a stage is completed. Marking a stage
          done is a statement about the handoff, not a lock - a late balance, a
          recount or a correction still has to be recordable, and the entries
          below are what the Output reconciliation is built from. */}
      {(gateStatus === "active" || gateStatus === "completed") && (
        <Card>
          <CardHeader
            title={assignment.section?.label ?? "Data Entry"}
            subtitle={gateStatus === "completed" ? "This stage is marked complete. You can still record late entries or corrections." : "This is the order's current stage - you can enter data now."}
            action={
              <div className="flex items-center gap-2">
                {gateStatus === "completed" && <Badge tone="good">Completed</Badge>}
                <Badge tone="brand">{assignment.section?.unitType}</Badge>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <StageFormRouter order={order} assignment={assignment} stageProgress={item.stageProgress} onForwarded={onForwarded} showDetails={showDetails} />
          </CardBody>
        </Card>
      )}

      {gateStatus === "locked" && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-2 rounded-xl bg-ink-50 py-10 text-center">
              <span className="text-3xl">⏳</span>
              <p className="text-sm font-semibold text-ink-800">Not your turn yet</p>
              <p className="max-w-sm text-sm text-ink-500">
                This order is currently at <span className="font-medium text-ink-700">{currentStage?.label}</span>. Your assigned stage,{" "}
                <span className="font-medium text-ink-700">{assignment.section?.label}</span>, hasn&apos;t been reached yet - it&apos;ll unlock as soon as the stage before it moves anything on,
                whether or not that stage is finished.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Complete Order Workflow" subtitle={`Currently at: ${currentStage?.label ?? "-"} · ${orderProgress.completedStagesCount}/${orderProgress.stages.length} stages completed`} />
        <CardBody>
          <GameLevelPath
            stages={orderProgress.stages}
            currentStageIndex={orderProgress.currentStageIndex}
            selectedIndex={orderProgress.stages.findIndex((s) => s.stage.id === assignment.sectionId)}
            onSelect={() => {}}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" }) {
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${tone === "bad" ? "text-status-bad" : "text-ink-900"}`}>{value}</p>
    </div>
  );
}
