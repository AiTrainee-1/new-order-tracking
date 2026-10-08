"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TNA_STATUS_META, TNA_STATUS_ORDER, type TnaRecord } from "@/lib/tna";
import { DAY, MONTH_BAND_COLORS, buildGroups, computeRange, gridBackground, monthBands, ticksFor, weekendStarts } from "@/lib/tnaTimeline";
import { TnaChip } from "./TnaStatusChip";
import { TnaHoverCard, TnaRowBars, type RowHover } from "./TnaRowBars";

const LABEL_W = 272;
const ROW_H = 48;
const HEAD_H = 46;

type Scale = "auto" | "day" | "week" | "month";
const PX_PER_DAY: Record<Exclude<Scale, "auto">, number> = { day: 46, week: 17, month: 6 };

/**
 * The TNA as a timeline, one lane per stage grouped by order:
 *
 *   planned window   - the soft bar from planned start to planned end
 *   grace zone       - hatched extension after the deadline (the excess time)
 *   actual progress  - the solid bar beneath: first activity -> completion (or now)
 *   completion       - a diamond at the moment the stage was completed
 *   now              - the vertical line; everything left of it has happened
 *
 * Colours are the status: green completed on time / early, yellow upcoming,
 * blue on plan, orange in grace, red overdue / critical. (The MD page shows the
 * same picture as a pan-and-zoom canvas - TnaCanvas.)
 */
export function TnaTimeline({ records, now, onSelect }: { records: TnaRecord[]; now: number; onSelect?: (record: TnaRecord) => void }) {
  const [scale, setScale] = useState<Scale>("auto");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<RowHover | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);

  const groups = useMemo(() => buildGroups(records, now), [records, now]);
  const { lo, hi } = useMemo(() => computeRange(records, now), [records, now]);

  const days = Math.round((hi - lo) / DAY);
  const resolved: Exclude<Scale, "auto"> = scale !== "auto" ? scale : days <= 42 ? "day" : days <= 150 ? "week" : "month";
  const ppd = PX_PER_DAY[resolved];
  const width = days * ppd;
  const x = (ms: number) => ((ms - lo) / DAY) * ppd;

  // Open on "now" the first time, not on the far left.
  useEffect(() => {
    if (didScroll.current || !scrollRef.current || records.length === 0) return;
    didScroll.current = true;
    scrollRef.current.scrollLeft = Math.max(x(now) - 220, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);

  function jumpToNow() {
    if (scrollRef.current) scrollRef.current.scrollTo({ left: Math.max(x(now) - 220, 0), behavior: "smooth" });
  }

  const months = useMemo(() => monthBands(lo, hi), [lo, hi]);
  const ticks = useMemo(() => ticksFor(lo, hi, ppd), [lo, hi, ppd]);
  const weekendBlocks = useMemo(() => weekendStarts(lo, hi, ppd), [lo, hi, ppd]);
  const gridStyle = gridBackground(ppd);
  const nowX = x(now);

  function toggle(orderId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  if (records.length === 0) {
    return <p className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-4 py-10 text-center text-sm text-ink-500">No scheduled stages match these filters.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-600">
          {TNA_STATUS_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: TNA_STATUS_META[s].color }} />
              {TNA_STATUS_META[s].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-dashed border-orange-400" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(249,115,22,0.35) 0 3px, transparent 3px 6px)" }} />
            Grace (excess) time
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={jumpToNow} className="rounded-lg border border-white/80 bg-white px-2.5 py-1 text-xs font-semibold text-brand shadow-sm hover:bg-brand/5">
            Jump to now
          </button>
          <div className="inline-flex rounded-lg border border-white/80 bg-white/70 p-0.5 text-xs font-semibold">
            {(["auto", "day", "week", "month"] as Scale[]).map((s) => (
              <button key={s} type="button" onClick={() => setScale(s)} className={`rounded-md px-2.5 py-1 capitalize ${scale === s ? "bg-brand text-white shadow-sm" : "text-ink-600 hover:text-ink-900"}`}>
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(collapsed.size === 0 ? new Set(groups.map((g) => g.orderId)) : new Set())}
            className="rounded-lg border border-white/80 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50"
          >
            {collapsed.size === 0 ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[72vh] overflow-auto rounded-2xl border border-white/80 bg-white/80 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.12)]">
        <div style={{ width: LABEL_W + width, minWidth: "100%" }} className="relative">
          {/* ---- header: month bands + ticks */}
          <div className="sticky top-0 z-30 flex" style={{ height: HEAD_H }}>
            <div className="sticky left-0 z-40 flex shrink-0 items-center border-b border-r border-ink-100 bg-ink-800 px-4 text-xs font-bold uppercase tracking-wide text-white" style={{ width: LABEL_W }}>
              Order / stage
            </div>
            <div className="relative shrink-0 border-b border-ink-100 bg-white" style={{ width }}>
              {months.map((m, i) => (
                <div
                  key={m.start}
                  className="absolute top-0 flex h-6 items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-bold text-white"
                  style={{ left: x(m.start), width: x(m.end) - x(m.start), backgroundColor: MONTH_BAND_COLORS[i % MONTH_BAND_COLORS.length], borderRight: "1px solid rgba(255,255,255,0.6)" }}
                >
                  {x(m.end) - x(m.start) > 70 ? m.label : x(m.end) - x(m.start) > 34 ? m.label.slice(0, 3) : ""}
                </div>
              ))}
              {ticks.map((t) => (
                <div key={t.at} className={`absolute top-6 flex h-[22px] flex-col items-center justify-center text-[10px] font-semibold leading-none ${t.weekend ? "bg-ink-100/70 text-ink-400" : "text-ink-600"}`} style={{ left: x(t.at), width: ppd * t.spanDays }}>
                  {t.label}
                </div>
              ))}
              <div className="absolute top-0 z-10 flex h-full flex-col items-center" style={{ left: nowX }}>
                <span className="mt-[26px] -translate-x-1/2 rounded bg-rose-600 px-1 text-[9px] font-bold leading-4 text-white">NOW</span>
              </div>
            </div>
          </div>

          {/* ---- body */}
          <div className="relative">
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.orderId);
              const counts = { late: 0, warn: 0, done: 0 };
              for (const r of g.rows) {
                if (r.result.status === "critical" || r.result.status === "completed_late") counts.late++;
                else if (r.result.status === "grace" || r.result.status === "completed_grace") counts.warn++;
                if (r.result.isCompleted) counts.done++;
              }
              return (
                <div key={g.orderId}>
                  {/* order header row */}
                  <div className="flex border-b border-ink-100 bg-ink-50/80" style={{ height: 42 }}>
                    <button
                      type="button"
                      onClick={() => toggle(g.orderId)}
                      className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-ink-100 bg-ink-50 px-3 text-left"
                      style={{ width: LABEL_W }}
                      aria-expanded={!isCollapsed}
                    >
                      <span className={`text-ink-500 transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▶</span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-extrabold text-ink-900">
                          IO {g.order.ioNo} · {g.order.style}
                        </span>
                        <span className="block truncate text-[10px] text-ink-500">
                          {[g.order.color, g.order.buyer?.name].filter(Boolean).join(" · ") || "-"} · {counts.done}/{g.rows.length} done
                          {counts.late > 0 && <span className="font-bold text-rose-600"> · {counts.late} late</span>}
                          {counts.warn > 0 && <span className="font-bold text-orange-600"> · {counts.warn} warning</span>}
                        </span>
                      </span>
                    </button>
                    <div className="relative shrink-0" style={{ width, ...gridStyle }}>
                      {isCollapsed &&
                        g.rows.map((r) => (
                          <div
                            key={r.record.id}
                            className="absolute top-[15px] h-3 rounded-sm opacity-90"
                            style={{ left: x(new Date(r.record.plannedStart).getTime()), width: Math.max(x(new Date(r.record.plannedEnd).getTime()) - x(new Date(r.record.plannedStart).getTime()), 4), backgroundColor: TNA_STATUS_META[r.result.status].color }}
                            title={`${r.record.stageLabel}: ${TNA_STATUS_META[r.result.status].label}`}
                          />
                        ))}
                    </div>
                  </div>

                  {/* stage rows */}
                  {!isCollapsed &&
                    g.rows.map(({ record, result }) => {
                      const meta = TNA_STATUS_META[result.status];
                      return (
                        <div key={record.id} className="group flex border-b border-ink-100/70 hover:bg-brand/[0.03]" style={{ height: ROW_H }}>
                          <button
                            type="button"
                            onClick={() => onSelect?.(record)}
                            className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-ink-100 bg-white px-3 text-left group-hover:bg-ink-50"
                            style={{ width: LABEL_W }}
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: meta.color }}>
                              {record.stageSeq}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-ink-900">{record.stageLabel}</span>
                              <TnaChip result={result} className="mt-0.5" />
                            </span>
                          </button>
                          <div className="relative shrink-0" style={{ width, ...gridStyle }}>
                            {weekendBlocks.map((t) => (
                              <span key={t} className="absolute inset-y-0 bg-ink-100/40" style={{ left: x(t), width: ppd }} />
                            ))}
                            <TnaRowBars record={record} result={result} ppd={ppd} lo={lo} now={now} onSelect={onSelect} onHover={setHover} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
            {/* now line */}
            <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-rose-500/70" style={{ left: LABEL_W + nowX }} />
          </div>
        </div>
      </div>

      {hover && <TnaHoverCard hover={hover} />}
    </div>
  );
}
