"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useMyWork, workBadge, type GateStatus, type WorkItem } from "@/hooks/useMyWork";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AccentCard, PageHero, SectionTitle } from "@/components/ui/SectionCard";
import { SearchInput } from "@/components/ui/SearchInput";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { matchesBuyer } from "@/lib/buyers";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { Badge } from "@/components/ui/Badge";
import { formatDisplayDate } from "@/lib/workflow";
import { GameLevelPath } from "@/components/dashboard/GameLevelPath";
import { BackButton } from "@/components/ui/BackButton";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { FilterBar, FilterSummary, type FilterChip } from "@/components/ui/FilterBar";
import { FilterIcon, FilterSelect } from "@/components/ui/FilterSelect";
import { useBuyers } from "@/hooks/useBuyers";
import { Tabs } from "@/components/ui/Tabs";
import { StageFormRouter } from "@/components/forms/stage/StageFormRouter";
import { GroupSyncBanner } from "@/components/groups/GroupSyncBanner";
import { AssignmentCard } from "@/components/dataInput/AssignmentCard";
import { AssignmentHero } from "@/components/dataInput/AssignmentHero";
import { WorkOverview, type WorkStatus } from "@/components/dataInput/WorkOverview";
import { type CardStatusTone } from "@/lib/theme";

/** Ordering priority for work lists: actionable first, done last. */
const GATE_PRIORITY: Record<GateStatus, number> = { active: 0, locked: 1, completed: 2 };

type StatusFilter = "all" | "active" | "locked" | "completed";
const ALL_ORDERS = "all";

const DATA_INPUT_FILTER_DEFAULTS: { query: string; orderId: string; buyerId: string; statusFilter: StatusFilter; page: number } = {
  query: "",
  orderId: ALL_ORDERS,
  buyerId: "",
  statusFilter: "all",
  page: 1,
};

const STATUS_TABS: { key: StatusFilter; label: string; tone?: "good" | "warn" | "neutral" }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Your Turn", tone: "warn" },
  { key: "locked", label: "Waiting", tone: "neutral" },
  { key: "completed", label: "Completed", tone: "good" },
];

function matchesQuery(item: WorkItem, query: string): boolean {
  if (!query) return true;
  const { assignment } = item;
  const haystack = [assignment.order?.style, assignment.order?.ioNo, assignment.order?.buyer?.name, assignment.order?.color, assignment.section?.label, assignment.po?.poNumber]
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

/** The one-line "what happens next" under an assignment's progress. */
function nextActionFor(item: WorkItem): string {
  const { assignment, orderProgress } = item;
  const currentStageLabel = orderProgress.stages[orderProgress.currentStageIndex]?.stage.label;
  if (!assignment.canEnterData) return "Monitor only - tap to view status";
  if (item.stageProgress?.isPartial) return `Moved on without completing - ${item.stageProgress.qtyPending.toLocaleString()} ${item.stageProgress.stage.unitType} still owed here`;
  if (item.gateStatus === "completed") return "Your part is done - you can still record late entries";
  if (item.gateStatus === "locked") return `Waiting - order is currently at "${currentStageLabel}"`;
  return "Your turn - tap to enter today's production data";
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
  const { data: buyers = [] } = useBuyers();
  const queryClient = useQueryClient();
  const resultsRef = useRef<HTMLDivElement>(null);

  // Which operation is open lives in the URL and nowhere else, so the
  // browser's Back/Forward buttons move between the list and an operation by
  // themselves. (It used to be copied into state, and only ever copied IN: going
  // Back to a URL with no assignment left the page stuck on the operation.)
  const selectedAssignmentId = searchParams.get("assignment") ?? "";
  // Kept for the life of the browser tab so opening an operation and coming
  // back (Change Order, the Back button, or the browser's) lands on the same
  // search results instead of an empty search.
  const [filters, patchFilters] = usePersistedFilters(`ot:user-data-input-filters:${appUser?.id ?? "anon"}`, DATA_INPUT_FILTER_DEFAULTS);
  const { query, buyerId, statusFilter, page, orderId: savedOrderId } = filters;

  const selected = workItems.find((w) => w.assignment.id === selectedAssignmentId);

  const searched = useMemo(() => workItems.filter((w) => matchesQuery(w, query) && (!w.assignment.order || matchesBuyer(w.assignment.order, buyerId))), [workItems, query, buyerId]);

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

  // A saved order pick that has since left this user's list must not leave the
  // page filtered to nothing.
  const orderId = orderOptions.some((o) => o.id === savedOrderId) ? savedOrderId : ALL_ORDERS;

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
    router.push(id ? `/user/data-input?assignment=${id}` : "/user/data-input");
  }

  function updateQuery(value: string) {
    patchFilters({ query: value, page: 1 });
  }

  function updateBuyer(value: string) {
    patchFilters({ buyerId: value, page: 1 });
  }

  function updateOrder(value: string) {
    patchFilters({ orderId: value, page: 1 });
  }

  function updateStatusFilter(value: StatusFilter) {
    patchFilters({ statusFilter: value, page: 1 });
  }

  /** A click on the overview should visibly do something: filter the list and bring it into
   *  view; clicking the same status again clears it. */
  function selectStatus(status: WorkStatus) {
    const next: StatusFilter = statusFilter === status ? "all" : status;
    updateStatusFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (isLoading) return <Loader full label="Loading your assignments…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load your assignments.</p>;

  const yourTurnCount = workItems.filter((w) => w.gateStatus === "active" && w.assignment.canEnterData).length;

  return (
    <div className="space-y-6">
      {!selected && (
        <PageHero
          icon="✍️"
          iconBg="linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)"
          title="Data Input"
          titleGradient="linear-gradient(100deg, #155EEF 0%, #7C3AED 60%, #DB2777 100%)"
          description="Find an order to view its workflow and log production movement."
          action={
            workItems.length > 0 ? (
              <span
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  yourTurnCount > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${yourTurnCount > 0 ? "animate-pulseSoft bg-amber-500" : "bg-emerald-500"}`} />
                {yourTurnCount > 0 ? `${yourTurnCount} need${yourTurnCount === 1 ? "s" : ""} your input` : "All caught up"}
              </span>
            ) : undefined
          }
        />
      )}

      {workItems.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-[0_12px_30px_-8px_rgba(124,58,237,0.45)]" style={{ backgroundImage: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)" }}>
            📋
          </span>
          <p className="text-sm font-semibold text-ink-800">No assignments yet</p>
          <p className="max-w-sm text-sm text-ink-500">Nothing has been assigned to you. Contact your Admin and your orders will show up here.</p>
        </Card>
      ) : selected ? (
        <SelectedAssignmentView item={selected} onChangeOrder={() => selectAssignment("")} onForwarded={() => queryClient.invalidateQueries({ queryKey: ["my_work_entries"] })} />
      ) : (
        <>
          <WorkOverview items={scoped} activeStatus={statusFilter === "all" ? null : statusFilter} onSelectStatus={selectStatus} />

          <div ref={resultsRef} className="scroll-mt-6 space-y-6">
            <FilterBar
              search={<SearchInput label="Find an order" placeholder="Type a style, IO number, color, PO, or section…" value={query} onChange={(e) => updateQuery(e.target.value)} autoFocus />}
              filters={
                <>
                  <BuyerFilter value={buyerId} onChange={updateBuyer} />
                  <FilterSelect
                    label="Choose Order"
                    icon={FilterIcon.order}
                    value={orderId}
                    onChange={updateOrder}
                    neutralValue={ALL_ORDERS}
                    searchPlaceholder="Search your orders…"
                    options={[{ value: ALL_ORDERS, label: `All orders (${orderOptions.length})` }, ...orderOptions.map((o) => ({ value: o.id, label: o.label }))]}
                  />
                </>
              }
              tabs={<FilterTabs value={statusFilter} onChange={updateStatusFilter} tabs={STATUS_TABS.map((t) => ({ ...t, count: tabCounts[t.key] }))} />}
              footer={
                <FilterSummary
                  shown={filtered.length}
                  total={workItems.length}
                  noun="assignments"
                  chips={
                    [
                      buyerId && { key: "buyer", label: `Buyer: ${buyers.find((b) => b.id === buyerId)?.name ?? "…"}`, onRemove: () => updateBuyer("") },
                      orderId !== ALL_ORDERS && { key: "order", label: orderOptions.find((o) => o.id === orderId)?.label ?? "One order", onRemove: () => updateOrder(ALL_ORDERS) },
                      query.trim() && { key: "search", label: `“${query.trim()}”`, onRemove: () => updateQuery("") },
                    ].filter(Boolean) as FilterChip[]
                  }
                  onClear={buyerId || orderId !== ALL_ORDERS || query.trim() || statusFilter !== "all" ? () => patchFilters({ query: "", buyerId: "", orderId: ALL_ORDERS, statusFilter: "all", page: 1 }) : undefined}
                />
              }
            />

            {filtered.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="py-6 text-center text-sm text-ink-500">No assignments match your search.</p>
                </CardBody>
              </Card>
            ) : (
              // As many columns as fit at a comfortable card width, like the Admin order grids.
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(380px,100%),1fr))] gap-5">
                {pageItems.map((item, i) => (
                  <AssignmentCard key={item.assignment.id} item={item} tone={assignmentCardTone(item)} nextAction={nextActionFor(item)} onOpen={() => selectAssignment(item.assignment.id)} index={i} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <Button variant="secondary" size="sm" onClick={() => patchFilters({ page: Math.max(1, currentPage - 1) })} disabled={currentPage <= 1}>
                  ← Previous
                </Button>
                <span className="text-xs font-medium text-ink-500">
                  Page {currentPage} of {totalPages}
                </span>
                <Button variant="secondary" size="sm" onClick={() => patchFilters({ page: Math.min(totalPages, currentPage + 1) })} disabled={currentPage >= totalPages}>
                  Next →
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SelectedAssignmentView({ item, onChangeOrder, onForwarded }: { item: WorkItem; onChangeOrder: () => void; onForwarded: () => void }) {
  const { assignment, orderProgress, gateStatus } = item;
  const order = assignment.order!;
  const gate = workBadge(item);
  const isPartial = item.stageProgress?.isPartial ?? false;
  const currentStage = orderProgress.stages[orderProgress.currentStageIndex]?.stage;
  const [activeTab, setActiveTab] = useState<"entry" | "details">("entry");
  const showDetails = activeTab === "details";

  return (
    <div className="space-y-6">
      <BackButton onClick={onChangeOrder} label="Change Order" />

      {/* Always-visible orientation: which order, which stage, how far along and
          when it is due. Everything else about the order lives one tab away -
          the data-entry form is the point of this page, not a recap of what's
          already on file. */}
      <AssignmentHero item={item} tone={assignmentCardTone(item)} badge={<Badge tone={gate.tone}>{gate.label}</Badge>} />

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
          <AccentCard tone="sky">
            <CardHeader title={<SectionTitle icon="📋" tone="sky">Order details</SectionTitle>} subtitle="What's on file for this order." />
            <div className="grid grid-cols-2 gap-2.5 px-6 py-5 sm:grid-cols-3">
              <Stat label="Style" value={order.style} />
              <Stat label="IO number" value={order.ioNo} />
              <Stat label="Color" value={order.color ?? "-"} />
              <Stat label="Buyer" value={order.buyer?.name ?? "-"} />
              <Stat label="Order quantity" value={`${order.totalQty.toLocaleString()} PCS`} />
              <Stat label="Delivery" value={formatDisplayDate(order.deliveryDate)} />
              {assignment.po && <Stat label="Purchase order" value={assignment.po.poNumber} />}
              {order.fabric && <Stat label="Fabric" value={order.fabric} />}
              {order.description && <Stat label="Description" value={order.description} />}
            </div>
          </AccentCard>

          {gateStatus === "completed" && item.stageProgress && (
            <AccentCard tone="emerald">
              <CardHeader title={<SectionTitle icon="✅" tone="emerald">Your stage summary</SectionTitle>} subtitle={assignment.section?.label} />
              <div className="grid grid-cols-2 gap-2.5 px-6 py-5 sm:grid-cols-4">
                <Stat label={`Qty (${item.stageProgress.stage.unitType})`} value={item.stageProgress.qtyReceived} />
                <Stat label="Forwarded" value={item.stageProgress.qtyForwarded} />
                <Stat label="Shortage" value={item.stageProgress.qtyShortage} tone={item.stageProgress.qtyShortage > 0 ? "bad" : undefined} />
                <Stat label="Last Update" value={formatDisplayDate(item.stageProgress.lastEntryDate)} />
              </div>
            </AccentCard>
          )}
        </>
      )}

      {isPartial && item.stageProgress && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-3 text-xs font-medium leading-relaxed text-amber-900">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">!</span>
          <p>
            This stage was moved on without being completed -{" "}
            <b>
              {item.stageProgress.qtyPending.toLocaleString()} {item.stageProgress.stage.unitType}
            </b>{" "}
            is still owed here. The next stage has already started; record the balance below and use <b>Completed – Move Forward</b> when it&apos;s finished.
          </p>
        </div>
      )}

      {/* Data entry stays available after a stage is completed. Marking a stage
          done is a statement about the handoff, not a lock - a late balance, a
          recount or a correction still has to be recordable, and the entries
          below are what the Output reconciliation is built from. */}
      {(gateStatus === "active" || gateStatus === "completed") && (
        <AccentCard tone={gateStatus === "completed" ? "emerald" : "violet"}>
          <CardHeader
            title={<SectionTitle icon="✍️" tone={gateStatus === "completed" ? "emerald" : "violet"}>{assignment.section?.label ?? "Data Entry"}</SectionTitle>}
            subtitle={gateStatus === "completed" ? "This stage is marked complete. You can still record late entries or corrections." : "This is the order's current stage - you can enter data now."}
            action={
              <div className="flex items-center gap-2">
                {gateStatus === "completed" && <Badge tone="good">Completed</Badge>}
                <Badge tone="brand">{assignment.section?.unitType}</Badge>
              </div>
            }
          />
          <div className="space-y-4 px-6 py-5">
            <GroupSyncBanner orderId={order.id} stageKey={assignment.section?.key} stageLabel={assignment.section?.label ?? "This stage"} formType={assignment.section?.formType} />
            <StageFormRouter order={order} assignment={assignment} stageProgress={item.stageProgress} onForwarded={onForwarded} showDetails={showDetails} />
          </div>
        </AccentCard>
      )}

      {gateStatus === "locked" && (
        <AccentCard tone="slate">
          <div className="px-6 py-8">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/80 bg-white/70 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-[0_12px_30px_-8px_rgba(71,85,105,0.45)]" style={{ backgroundImage: "linear-gradient(135deg, #94A3B8 0%, #475569 100%)" }}>
                ⏳
              </span>
              <p className="text-sm font-bold text-ink-800">Not your turn yet</p>
              <p className="max-w-md px-4 text-sm text-ink-500">
                This order is currently at <span className="font-semibold text-ink-700">{currentStage?.label}</span>. Your assigned stage,{" "}
                <span className="font-semibold text-ink-700">{assignment.section?.label}</span>, hasn&apos;t been reached yet - it&apos;ll unlock as soon as the stage before it moves anything on,
                whether or not that stage is finished.
              </p>
            </div>
          </div>
        </AccentCard>
      )}

      <AccentCard tone="violet">
        <CardHeader
          title={<SectionTitle icon="🧭" tone="violet">Complete order workflow</SectionTitle>}
          subtitle={`Currently at: ${currentStage?.label ?? "-"} · ${orderProgress.completedStagesCount}/${orderProgress.stages.length} stages completed`}
        />
        <div className="px-6 py-5">
          <GameLevelPath
            stages={orderProgress.stages}
            currentStageIndex={orderProgress.currentStageIndex}
            selectedIndex={orderProgress.stages.findIndex((s) => s.stage.id === assignment.sectionId)}
            onSelect={() => {}}
            orderId={order.id}
          />
        </div>
      </AccentCard>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${tone === "bad" ? "text-status-bad" : "text-ink-900"}`} title={String(value)}>
        {value}
      </p>
    </div>
  );
}
