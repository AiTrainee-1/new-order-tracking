"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import { useNow, useTnaOverview } from "@/hooks/useTna";
import { TNA_STATUS_META, computeTna, type TnaRecord, type TnaResult, type TnaStatus } from "@/lib/tna";
import { TNA_FILTER_TABS, exportTnaCsv, matchesTnaFilter, overlapsRange, recordSearchText, type TnaFilter } from "@/lib/tnaView";
import { Button } from "@/components/ui/Button";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { Card } from "@/components/ui/Card";
import { FilterBar, FilterSummary, type FilterChip } from "@/components/ui/FilterBar";
import { FilterIcon, FilterSelect } from "@/components/ui/FilterSelect";
import { FilterTabs } from "@/components/ui/FilterTabs";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { Loader } from "@/components/ui/Loader";
import { HealthOverviewCard, SummaryCard } from "@/components/ui/OverviewCards";
import { SearchInput } from "@/components/ui/SearchInput";
import { AccentCard, PageHero, SectionTitle } from "@/components/ui/SectionCard";
import { CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { TnaCanvas } from "./TnaCanvas";
import { TnaDetailModal } from "./TnaDetailModal";
import { TnaNav } from "./TnaNav";
import { TnaRecordsTable } from "./TnaRecordsTable";
import { TnaStatusPill } from "./TnaStatusChip";

const ALL = "all";
type ViewMode = "timeline" | "records";

/** Overview segments, healthiest first (the bar draws them in this order). */
const SEGMENT_ORDER: TnaStatus[] = ["completed_early", "completed_on_time", "in_progress", "upcoming", "completed_grace", "grace", "completed_late", "critical"];

/** Short names for the overview's count tiles - the full status wording is too long for them. */
const SEGMENT_LABEL: Record<TnaStatus, string> = {
  completed_early: "Early",
  completed_on_time: "On time",
  in_progress: "In progress",
  upcoming: "Upcoming",
  completed_grace: "Done in grace",
  grace: "In grace",
  completed_late: "Done late",
  critical: "Overdue",
};

const FILTER_KEYS: string[] = ["all", "attention", "delayed", "due_soon", "completed", ...SEGMENT_ORDER];

export function TnaDashboard() {
  const { appUser } = useAuth();
  const who = appUser?.id ?? "anon";
  const { data: all = [], isLoading, isError } = useTnaOverview();
  const now = useNow(30_000);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Kept for the life of the browser tab, like the other list pages.
  const [search, setSearch] = usePersistedState(`ot:tna:${who}:search`, "");
  const [buyerId, setBuyerId] = usePersistedState(`ot:tna:${who}:buyer`, "");
  const [ioNo, setIoNo] = usePersistedState(`ot:tna:${who}:io`, ALL);
  const [orderId, setOrderId] = usePersistedState(`ot:tna:${who}:order`, ALL);
  const [stageKey, setStageKey] = usePersistedState(`ot:tna:${who}:stage`, ALL);
  const [filter, setFilter] = usePersistedState<TnaFilter>(`ot:tna:${who}:filter`, "all", (v) => FILTER_KEYS.includes(String(v)));
  const [from, setFrom] = usePersistedState(`ot:tna:${who}:from`, "");
  const [to, setTo] = usePersistedState(`ot:tna:${who}:to`, "");
  const [view, setView] = usePersistedState<ViewMode>(`ot:tna:${who}:view`, "timeline", (v) => v === "timeline" || v === "records");
  const [selected, setSelected] = useState<TnaRecord | null>(null);
  const [showAllAttention, setShowAllAttention] = useState(false);

  // Hidden orders aren't live work - leave them out, as everywhere else.
  const live = useMemo(() => all.filter((r) => !r.order?.isHidden), [all]);

  // Narrow by everything EXCEPT the status first; the status tabs and the
  // overview then count within that, like the Orders page.
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return live.filter(
      (r) =>
        (!buyerId || r.order?.buyer?.id === buyerId) &&
        (ioNo === ALL || r.order?.ioNo === ioNo) &&
        (orderId === ALL || r.orderId === orderId) &&
        (stageKey === ALL || r.stageKey === stageKey) &&
        (!q || recordSearchText(r).includes(q)) &&
        ((!from && !to) || overlapsRange(r, from, to)),
    );
  }, [live, search, buyerId, ioNo, orderId, stageKey, from, to]);

  const evaluated = useMemo(() => scoped.map((record) => ({ record, r: computeTna(record, now) })), [scoped, now]);

  const counts = useMemo(() => {
    const c: Record<TnaStatus, number> = { upcoming: 0, in_progress: 0, grace: 0, critical: 0, completed_early: 0, completed_on_time: 0, completed_grace: 0, completed_late: 0 };
    for (const e of evaluated) c[e.r.status]++;
    return c;
  }, [evaluated]);

  const tabCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of TNA_FILTER_TABS) out[t.key] = evaluated.filter((e) => matchesTnaFilter(e.r, t.key)).length;
    return out;
  }, [evaluated]);

  const visible = useMemo(() => evaluated.filter((e) => matchesTnaFilter(e.r, filter)).map((e) => e.record), [evaluated, filter]);

  // Pick-lists follow the choices above them.
  const buyerScoped = useMemo(() => live.filter((r) => !buyerId || r.order?.buyer?.id === buyerId), [live, buyerId]);
  const ioOptions = useMemo(() => Array.from(new Set(buyerScoped.map((r) => r.order?.ioNo).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [buyerScoped]);
  const orderOptions = useMemo(() => {
    const by = new Map<string, string>();
    for (const r of buyerScoped) {
      if (ioNo !== ALL && r.order?.ioNo !== ioNo) continue;
      if (r.order && !by.has(r.orderId)) by.set(r.orderId, `IO ${r.order.ioNo} · ${r.order.style}${r.order.color ? ` · ${r.order.color}` : ""}`);
    }
    return [...by.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  }, [buyerScoped, ioNo]);
  const stageOptions = useMemo(() => {
    const by = new Map<string, { label: string; seq: number }>();
    for (const r of live) if (!by.has(r.stageKey) || r.stageSeq < by.get(r.stageKey)!.seq) by.set(r.stageKey, { label: r.stageLabel, seq: r.stageSeq });
    return [...by.entries()].sort((a, b) => a[1].seq - b[1].seq).map(([key, v]) => ({ value: key, label: v.label }));
  }, [live]);

  const attention = useMemo(
    () => evaluated.filter((e) => e.r.status === "critical" || e.r.status === "grace").sort((a, b) => TNA_STATUS_META[a.r.status].rank - TNA_STATUS_META[b.r.status].rank || b.r.delayMin - a.r.delayMin),
    [evaluated],
  );
  const ordersTracked = useMemo(() => new Set(scoped.map((r) => r.orderId)).size, [scoped]);

  const segments: HealthSegment[] = SEGMENT_ORDER.map((s) => ({ key: s, label: SEGMENT_LABEL[s], color: TNA_STATUS_META[s].color, count: counts[s], alert: s === "critical" || s === "grace" }));
  const anyFilter = !!(search.trim() || buyerId || ioNo !== ALL || orderId !== ALL || stageKey !== ALL || from || to || filter !== "all");
  // The status tab and the date range narrow the list too, so they get a visible chip like the rest (otherwise "0 of 38" looks unexplained).
  const statusLabel = filter === "all" ? null : (TNA_FILTER_TABS.find((t) => t.key === filter)?.label ?? TNA_STATUS_META[filter as TnaStatus]?.label ?? String(filter));
  const dateLabel = from || to ? `Planned ${from || "…"} → ${to || "…"}` : null;

  function selectStatus(key: string) {
    const next = (filter === key ? "all" : key) as TnaFilter;
    setFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function clearAll() {
    setSearch("");
    setBuyerId("");
    setIoNo(ALL);
    setOrderId(ALL);
    setStageKey(ALL);
    setFrom("");
    setTo("");
    setFilter("all");
  }

  // Shown in the canvas when the filters leave nothing - say so, and name the status filter, which is easy to leave on.
  const emptyState = (
    <div className="max-w-md rounded-2xl border border-dashed border-ink-200 bg-white/80 px-6 py-8 text-center">
      <p className="text-sm font-bold text-ink-800">No stages to show</p>
      <p className="mt-1 text-sm text-ink-500">
        {anyFilter ? `Nothing matches the filters you have set${statusLabel ? ` - the “${statusLabel}” status filter is on` : ""}.` : "No TNA is scheduled yet."}
      </p>
      {anyFilter && (
        <div className="mt-4">
          <Button size="sm" variant="secondary" onClick={clearAll}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );

  // A stage's full record - opened from the canvas, the table or the "needs attention" list.
  const detail = <TnaDetailModal record={selected} now={now} onClose={() => setSelected(null)} />;

  if (isLoading) return <Loader full label="Loading TNA…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load the TNA. Check the database connection.</p>;

  return (
    <div className="space-y-6">
      <PageHero
        icon="⏱️"
        iconBg="linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)"
        title="TNA - Time & Action"
        titleGradient="linear-gradient(100deg, #0D9488 0%, #2563EB 55%, #7C3AED 100%)"
        description="Every scheduled stage against what the floor actually did - on time, early, in its grace period, or overdue. Updates by itself as work is recorded."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => exportTnaCsv(visible, now)} disabled={visible.length === 0}>
              Export CSV
            </Button>
            <Link href="/admin/TNA/assign">
              <Button size="sm">+ Assign TNA</Button>
            </Link>
          </div>
        }
      />

      <TnaNav />

      {live.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-[0_12px_30px_-8px_rgba(13,148,136,0.45)]" style={{ backgroundImage: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)" }}>
            ⏱️
          </span>
          <p className="text-sm font-semibold text-ink-800">No TNA assigned yet</p>
          <p className="max-w-md text-sm text-ink-500">Pick an order and give its stages a start, an end and (optionally) some grace time. Orders without a TNA keep working exactly as they do now.</p>
          <Link href="/admin/TNA/assign">
            <Button size="sm">Assign the first TNA →</Button>
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <HealthOverviewCard
              tone="emerald"
              icon="⏱️"
              title="TNA health"
              subtitle="Click a status to see just those stages."
              headlineLabel="Stages tracked"
              headline={scoped.length}
              badge={counts.critical > 0 ? { tone: "bad", text: `${counts.critical} overdue` } : counts.grace > 0 ? { tone: "warn", text: `${counts.grace} in grace period` } : scoped.length > 0 ? { tone: "good", text: "Nothing overdue" } : null}
              segments={segments}
              total={scoped.length}
              ariaLabel={`TNA health: ${SEGMENT_ORDER.map((s) => `${counts[s]} ${TNA_STATUS_META[s].label.toLowerCase()}`).join(", ")}`}
              activeKey={SEGMENT_ORDER.includes(filter as TnaStatus) ? filter : null}
              onSelect={selectStatus}
              unitLabel="stages"
            />
            <SummaryCard
              tone="violet"
              icon="📋"
              title="At a glance"
              subtitle="For the stages showing."
              headline={ordersTracked}
              headlineLabel={ordersTracked === 1 ? "order tracked" : "orders tracked"}
              tiles={[
                { label: "Stages", value: scoped.length },
                { label: "Needs attention", value: attention.length, valueClass: attention.length > 0 ? "text-rose-600" : undefined },
                { label: "Due in 48h", value: evaluated.filter((e) => e.r.dueSoon).length, valueClass: "text-amber-600" },
                { label: "Completed", value: evaluated.filter((e) => e.r.isCompleted).length, valueClass: "text-emerald-700" },
              ]}
            />
          </div>

          {attention.length > 0 && (
            <AccentCard tone="rose">
              <CardHeader
                title={<SectionTitle icon="🚨" tone="rose">Needs attention now</SectionTitle>}
                subtitle={`${attention.length} stage${attention.length === 1 ? " is" : "s are"} past the deadline and still open. This stays here until each is completed.`}
              />
              <div className="space-y-2 px-6 py-5">
                {(showAllAttention ? attention : attention.slice(0, 5)).map(({ record, r }) => (
                  <AttentionRow key={record.id} record={record} r={r} onOpen={() => setSelected(record)} />
                ))}
                {attention.length > 5 && (
                  <button type="button" onClick={() => setShowAllAttention((v) => !v)} className="text-xs font-semibold text-brand hover:underline">
                    {showAllAttention ? "Show fewer" : `Show all ${attention.length}`}
                  </button>
                )}
              </div>
            </AccentCard>
          )}

          <div ref={resultsRef} className="scroll-mt-6 space-y-6">
            <FilterBar
              search={<SearchInput label="Find an order or stage" placeholder="Type an IO number, style, buyer, colour or stage…" value={search} onChange={(e) => setSearch(e.target.value)} />}
              filters={
                <>
                  <BuyerFilter
                    value={buyerId}
                    onChange={(v) => {
                      setBuyerId(v);
                      setIoNo(ALL);
                      setOrderId(ALL);
                    }}
                  />
                  <FilterSelect
                    label="IO"
                    icon={FilterIcon.order}
                    value={ioNo}
                    onChange={(v) => {
                      setIoNo(v);
                      setOrderId(ALL);
                    }}
                    neutralValue={ALL}
                    searchPlaceholder="Search IO numbers…"
                    options={[{ value: ALL, label: "All IOs" }, ...ioOptions.map((io) => ({ value: io, label: `IO ${io}` }))]}
                  />
                  <FilterSelect label="Order" icon={FilterIcon.order} value={orderId} onChange={setOrderId} neutralValue={ALL} searchPlaceholder="Search orders…" options={[{ value: ALL, label: `All orders (${orderOptions.length})` }, ...orderOptions.map(([id, label]) => ({ value: id, label }))]} />
                  <FilterSelect label="Stage" icon={FilterIcon.stage} value={stageKey} onChange={setStageKey} neutralValue={ALL} searchPlaceholder="Search stages…" options={[{ value: ALL, label: "All stages" }, ...stageOptions]} />
                </>
              }
              tabs={
                <div className="space-y-3">
                  <FilterTabs value={filter} onChange={setFilter} tabs={TNA_FILTER_TABS.map((t) => ({ ...t, count: tabCounts[t.key] ?? 0 }))} />
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-semibold text-ink-600">
                      Planned between
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-900" />
                    </label>
                    <label className="text-xs font-semibold text-ink-600">
                      and
                      <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="ml-2 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-900" />
                    </label>
                    {(from || to) && (
                      <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-xs font-semibold text-brand hover:underline">
                        Clear dates
                      </button>
                    )}
                  </div>
                </div>
              }
              footer={
                <FilterSummary
                  shown={visible.length}
                  total={live.length}
                  noun="stages"
                  chips={
                    [
                      buyerId && { key: "buyer", label: "Buyer", onRemove: () => setBuyerId("") },
                      ioNo !== ALL && { key: "io", label: `IO ${ioNo}`, onRemove: () => setIoNo(ALL) },
                      orderId !== ALL && { key: "order", label: orderOptions.find(([id]) => id === orderId)?.[1] ?? "One order", onRemove: () => setOrderId(ALL) },
                      stageKey !== ALL && { key: "stage", label: stageOptions.find((s) => s.value === stageKey)?.label ?? "Stage", onRemove: () => setStageKey(ALL) },
                      search.trim() && { key: "search", label: `“${search.trim()}”`, onRemove: () => setSearch("") },
                      statusLabel && { key: "status", label: `Status: ${statusLabel}`, onRemove: () => setFilter("all") },
                      dateLabel && { key: "dates", label: dateLabel, onRemove: () => { setFrom(""); setTo(""); } },
                    ].filter(Boolean) as FilterChip[]
                  }
                  onClear={anyFilter ? clearAll : undefined}
                />
              }
            />

            <Tabs
              value={view}
              onChange={setView}
              tabs={[
                { key: "timeline", label: "Timeline" },
                { key: "records", label: "Records" },
              ]}
            />

            {view === "timeline" ? (
              // The same pan-and-zoom canvas as the MD page (minimised orders, status lanes of cards when opened up),
              // sized to a window in this page. Its dialog lives inside it so it still shows when the canvas is full screen.
              <div className="h-[78vh] min-h-[540px]">
                <TnaCanvas records={visible} now={now} onSelect={setSelected} embedded empty={emptyState}>
                  {detail}
                </TnaCanvas>
              </div>
            ) : (
              <>
                <TnaRecordsTable records={visible} now={now} onSelect={setSelected} />
                {detail}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AttentionRow({ record, r, onOpen }: { record: TnaRecord; r: TnaResult; onOpen: () => void }) {
  const meta = TNA_STATUS_META[r.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/80 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_22px_-12px_rgba(15,23,42,0.35)]"
      style={{ borderColor: `${meta.color}55`, boxShadow: `inset 4px 0 0 ${meta.color}` }}
    >
      <span className="min-w-0 pl-1.5">
        <span className="block truncate text-sm font-bold text-ink-900">
          {record.stageLabel} <span className="font-medium text-ink-500">· IO {record.order?.ioNo} · {record.order?.style}</span>
        </span>
        <span className="block truncate text-xs font-semibold" style={{ color: meta.text }}>
          {r.headline}
        </span>
      </span>
      <TnaStatusPill status={r.status} />
    </button>
  );
}
