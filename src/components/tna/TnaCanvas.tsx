"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { TNA_STATUS_META, TNA_STATUS_ORDER, type TnaRecord, type TnaStatus } from "@/lib/tna";
import { DAY, MONTH_BAND_COLORS, buildGroups, computeRange, gridBackground, monthBands, ticksFor, weekendStarts, type TnaGroup, type TnaRow } from "@/lib/tnaTimeline";
import { CARD_H, CARD_W, connectorPath, laneLayout } from "@/lib/tnaBoard";
import { startOfDay } from "@/lib/tnaFormat";
import { TnaHoverCard, TnaOrderCard, type RowHover } from "./TnaRowBars";
import { TnaFlowCard, TnaFlowLinks, type FlowLink } from "./TnaFlowCard";

const HEAD_H = 54;
const GROUP_H = 44;
// A stage card starts at its planned start and is wider than a short stage, so the world runs a card's width past the last date.
const RIGHT_ROOM = CARD_W + 24;
const BASE_PPD = 46; // 100% zoom = a day is 46px wide
// Zoomed out no further than this: every date along the top always has room for its own number.
const MIN_PPD = 20;
const MAX_PPD = 190;
// A little room under the last row so it can be scrolled clear of the floating controls.
const BOTTOM_ROOM = 72;

/** How far down the rows can be scrolled: not at all when they all fit. */
const maxScrollY = (totalH: number, visH: number) => (totalH + BOTTOM_ROOM > visH ? totalH + BOTTOM_ROOM - visH : 0);

interface View {
  /** Identifies the data window this view belongs to - change the data and the view starts over. */
  key: string;
  ppd: number;
  /** How far the body is scrolled (px) - the time/rows at the top-left of the visible area. */
  sx: number;
  sy: number;
}

/** A stage's card, placed in the world: `x` along the time axis, `y` from the top of the whole canvas. */
type PlacedCard = { row: TnaRow; x: number; y: number };

/**
 * Each order is one "band": its header row and, when opened up, its status lanes share a background that
 * alternates white / grey down the page.
 */
type Item =
  | { kind: "group"; group: TnaGroup; y: number; h: number; band: number; collapsed: boolean }
  | { kind: "lane"; orderId: string; status: TnaStatus; y: number; h: number; band: number; cards: PlacedCard[] };

const bandColor = (band: number) => (band % 2 === 0 ? "#FFFFFF" : "#F1F5F9");
/** The line between one order and the next. */
const ORDER_DIVIDER = "2px solid #94A3B8";
/** An open order's header row is a shade darker than its own stages (a black tint works on both band colours); a minimised order is just its band colour. */
const HEADER_TINT = "bg-ink-900/[0.05]";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The TNA timeline as a full-screen graphical workspace - pan and zoom it like
 * a canvas:
 *
 *   drag            move around (anywhere on the chart; the header drags sideways, the names drag up/down)
 *   mouse wheel     move up/down - Shift+wheel or a trackpad swipe moves sideways
 *   Ctrl + wheel    zoom toward the cursor (a trackpad pinch does the same; two fingers pinch on a touch screen)
 *   arrow keys      move, + / - zoom, 0 fit everything, T jump to today, F full screen
 *   click an order  its card (photo + schedule summary); the arrow beside it shows/hides its stages
 *
 * `embedded` is for a canvas sitting inside a page that scrolls (the Admin TNA view): the mouse wheel then moves
 * the canvas only while it has room to move and otherwise scrolls the page on, so the page never gets stuck
 * under the pointer. (Ctrl + wheel still zooms, and dragging still moves it.)
 *
 * `empty` replaces the "nothing to show" message - a page that owns the filters can say which ones are
 * hiding everything, and offer to clear them.
 *
 * `children` are rendered inside the canvas itself - pop-ups (a stage's detail dialog) that have to stay
 * visible in full screen, where the browser draws nothing outside the full-screen element.
 *
 * The order/stage names and the date header stay pinned (like frozen panes) so
 * you always know what you are looking at, while the chart between them moves.
 * It fills whatever space its parent gives it.
 */
export function TnaCanvas({ records, now, onSelect, filters, children, embedded = false, empty }: { records: TnaRecord[]; now: number; onSelect: (record: TnaRecord) => void; filters?: ReactNode; children?: ReactNode; embedded?: boolean; empty?: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Every order opens minimised (one row of stage bars); this holds the ones opened up to show their stages.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<RowHover | null>(null);
  // The order card is opened by clicking an order (never on hover) and stays until dismissed.
  const [orderCard, setOrderCard] = useState<{ orderId: string; x: number; y: number } | null>(null);
  // The overview map is for big screens; on a phone it would cover the chart.
  const [showMap, setShowMap] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  const [showLegend, setShowLegend] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panning, setPanning] = useState(false);

  const groups = useMemo(() => buildGroups(records, now), [records, now]);
  const { lo, hi } = useMemo(() => computeRange(records, now), [records, now]);
  const days = (hi - lo) / DAY;
  const rangeKey = `${lo}-${hi}-${groups.length}`;
  const labelW = size.w > 0 && size.w < 640 ? 148 : 264;
  const visW = Math.max(size.w - labelW, 0);
  const visH = Math.max(size.h - HEAD_H, 0);

  // The view is DERIVED until the first interaction: 100% zoom (every date readable) with today
  // near the left - scroll to see the rest. Recomputed whenever the data window changes.
  const initial = useMemo<View>(() => {
    const nowX = ((now - lo) / DAY) * BASE_PPD;
    const fitsAll = days * BASE_PPD <= visW;
    return { key: rangeKey, ppd: BASE_PPD, sx: fitsAll ? 0 : Math.max(nowX - visW * 0.3, 0), sy: 0 };
  }, [rangeKey, visW, days, lo, now]);
  const [stored, setStored] = useState<View | null>(null);
  const raw = stored && stored.key === rangeKey ? stored : initial;

  // Everything laid out top to bottom: each order's header row and, for the opened-up ones, a lane per
  // status holding that status's cards. The cards' sideways positions (and so how many stack up in a
  // lane) depend on the zoom, so the layout follows it.
  const { items, totalH } = useMemo(() => {
    const out: Item[] = [];
    let y = 0;
    let band = 0;
    for (const g of groups) {
      const isCollapsed = !expanded.has(g.orderId);
      const lanes = isCollapsed ? [] : laneLayout(g.rows, lo, raw.ppd);
      const h = GROUP_H + lanes.reduce((sum, l) => sum + l.h, 0);
      out.push({ kind: "group", group: g, y, h, band, collapsed: isCollapsed });
      let laneY = y + GROUP_H;
      for (const lane of lanes) {
        out.push({ kind: "lane", orderId: g.orderId, status: lane.status, y: laneY, h: lane.h, band, cards: lane.cards.map((c) => ({ row: c.row, x: c.x, y: laneY + c.top })) });
        laneY += lane.h;
      }
      y += h;
      band++;
    }
    return { items: out, totalH: y };
  }, [groups, expanded, lo, raw.ppd]);

  // Never scrolled past the content: no blank strip above or to the left of it, whatever was dragged
  // earlier (before orders were hidden, collapsed or filtered away, say).
  const view: View = { ...raw, sx: clamp(raw.sx, 0, Math.max(days * raw.ppd + RIGHT_ROOM - visW, 0)), sy: clamp(raw.sy, 0, maxScrollY(totalH, visH)) };

  const totalW = days * view.ppd;
  const worldW = totalW + RIGHT_ROOM;
  const x = useCallback((ms: number) => ((ms - lo) / DAY) * view.ppd, [lo, view.ppd]);

  // ---- the view, always kept within bounds
  // Event handlers read the latest view and sizes through refs (they outlive any one render);
  // the refs are refreshed after every commit.
  const viewRef = useRef(view);
  const dims = useRef({ visW, visH, totalH, days, lo, labelW });
  useEffect(() => {
    viewRef.current = view;
    dims.current = { visW, visH, totalH, days, lo, labelW };
  });

  const apply = useCallback(
    (next: { ppd: number; sx: number; sy: number }) => {
      const d = dims.current;
      const ppd = clamp(next.ppd, MIN_PPD, MAX_PPD);
      const w = d.days * ppd;
      const updated: View = {
        key: viewRef.current.key,
        ppd,
        sx: clamp(next.sx, 0, Math.max(w + RIGHT_ROOM - d.visW, 0)),
        sy: clamp(next.sy, 0, maxScrollY(d.totalH, d.visH)),
      };
      // Update the working copy right away too, so a burst of wheel events builds on itself
      // instead of each starting from the last painted view.
      viewRef.current = updated;
      setStored(updated);
      setHinted(true);
    },
    [],
  );

  /** Zoom by `factor` keeping the time under `anchorX` (px from the left of the chart area) where it is. */
  const zoomAt = useCallback(
    (factor: number, anchorX: number) => {
      const v = viewRef.current;
      const ppd = clamp(v.ppd * factor, MIN_PPD, MAX_PPD);
      const k = ppd / v.ppd;
      apply({ ppd, sx: (anchorX + v.sx) * k - anchorX, sy: v.sy });
    },
    [apply],
  );

  /** The chart area's size right now, measured from the element (state can lag a frame behind, or be unset in a background tab). */
  const liveVisW = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? Math.max(rect.width - dims.current.labelW, 0) : dims.current.visW;
  }, []);

  const fit = useCallback(() => {
    const d = dims.current;
    const ppd = clamp((liveVisW() - 48) / d.days, MIN_PPD, MAX_PPD);
    apply({ ppd, sx: 0, sy: 0 });
  }, [apply, liveVisW]);

  const goToday = useCallback(() => {
    const d = dims.current;
    const v = viewRef.current;
    apply({ ppd: v.ppd, sx: ((Date.now() - d.lo) / DAY) * v.ppd - liveVisW() / 2, sy: v.sy });
  }, [apply, liveVisW]);

  // ---- size of the area (the canvas is absent while there is nothing to draw, so watch for it appearing)
  const hasCanvas = records.length > 0;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasCanvas]);

  // ---- wheel: move, or zoom with Ctrl/Cmd (also what a trackpad pinch sends). Needs a non-passive listener.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const zooming = e.ctrlKey || e.metaKey;
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      if (!zooming && e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      const v = viewRef.current;
      if (embedded && !zooming) {
        // In a page that scrolls, take the wheel only while there is somewhere left to move; after that, let the page have it.
        const d = dims.current;
        const canMove = clamp(v.sx + dx, 0, Math.max(d.days * v.ppd + RIGHT_ROOM - d.visW, 0)) !== v.sx || clamp(v.sy + dy, 0, maxScrollY(d.totalH, d.visH)) !== v.sy;
        if (!canMove) return;
      }
      e.preventDefault();
      // The chart moves under a resting pointer, so a card for whatever was there a moment ago would be stale.
      setHover(null);
      setOrderCard(null);
      if (zooming) {
        const rect = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * unit * 0.0022), e.clientX - rect.left - dims.current.labelW);
        return;
      }
      apply({ ppd: v.ppd, sx: v.sx + dx, sy: v.sy + dy });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [apply, zoomAt, hasCanvas, embedded]);

  // ---- drag to move; two fingers to pinch-zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; zone: "body" | "header" | "labels"; active: boolean } | null>(null);
  const pinch = useRef<{ dist: number } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();
    viewportRef.current?.focus({ preventScroll: true });
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const zone = py < HEAD_H ? "header" : px < dims.current.labelW ? "labels" : "body";
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    drag.current = { x: e.clientX, y: e.clientY, sx: v.sx, sy: v.sy, zone, active: false };
    suppressClick.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = e.currentTarget.getBoundingClientRect();
      zoomAt(dist / pinch.current.dist, (a.x + b.x) / 2 - rect.left - dims.current.labelW);
      pinch.current.dist = dist;
      suppressClick.current = true;
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active && Math.hypot(dx, dy) < 5) return; // still a click
    if (!d.active) {
      d.active = true;
      suppressClick.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setPanning(true);
      setHover(null);
    }
    const v = viewRef.current;
    apply({ ppd: v.ppd, sx: d.zone === "labels" ? v.sx : d.sx - dx, sy: d.zone === "header" ? v.sy : d.sy - dy });
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setPanning(false);
      // The click that follows a drag must not open anything - clear the flag once it has passed.
      setTimeout(() => (suppressClick.current = false), 0);
    }
  };

  const select = useCallback((record: TnaRecord) => {
    if (suppressClick.current) return;
    setOrderCard(null);
    onSelect(record);
  }, [onSelect]);

  /** Click an order: show its card there (click it again to put it away). */
  const openOrder = useCallback((orderId: string, x: number, y: number) => {
    if (suppressClick.current) return;
    setHover(null);
    setOrderCard((cur) => (cur?.orderId === orderId ? null : { orderId, x, y }));
  }, []);

  const toggleGroup = useCallback((orderId: string) => {
    if (suppressClick.current) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const v = viewRef.current;
    const step = e.shiftKey ? 480 : 120;
    const anchor = liveVisW() / 2;
    switch (e.key) {
      case "ArrowLeft": apply({ ppd: v.ppd, sx: v.sx - step, sy: v.sy }); break;
      case "ArrowRight": apply({ ppd: v.ppd, sx: v.sx + step, sy: v.sy }); break;
      case "ArrowUp": apply({ ppd: v.ppd, sx: v.sx, sy: v.sy - step }); break;
      case "ArrowDown": apply({ ppd: v.ppd, sx: v.sx, sy: v.sy + step }); break;
      case "+": case "=": zoomAt(1.25, anchor); break;
      case "-": case "_": zoomAt(0.8, anchor); break;
      case "0": fit(); break;
      case "t": case "T": goToday(); break;
      case "f": case "F": toggleFullscreen(); break;
      default: return;
    }
    e.preventDefault();
  };

  // ---- the order card goes away on a click anywhere else (clicking another order swaps it), or Escape
  const cardOpen = orderCard !== null;
  useEffect(() => {
    if (!cardOpen) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-order-card],[data-order-trigger]")) return;
      setOrderCard(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOrderCard(null);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [cardOpen]);

  // ---- full screen
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  function toggleFullscreen() {
    // A browser may refuse (no user gesture, or not allowed here) - that's fine, nothing else depends on it.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else rootRef.current?.requestFullscreen?.()?.catch(() => undefined);
  }

  const months = useMemo(() => monthBands(lo, hi), [lo, hi]);
  const ticks = useMemo(() => ticksFor(lo, hi, view.ppd, true), [lo, hi, view.ppd]);
  const weekends = useMemo(() => weekendStarts(lo, hi, view.ppd), [lo, hi, view.ppd]);
  const nowX = x(now);
  const todayAt = startOfDay(now);
  const cardGroup = orderCard ? groups.find((g) => g.orderId === orderCard.orderId) : undefined;
  const zoomPct = Math.round((view.ppd / BASE_PPD) * 100);
  // A floating card inside the page, so it never touches the sidebar; full screen drops the frame.
  const frame = `flex h-full min-h-0 flex-col overflow-clip ${isFullscreen ? "" : "rounded-2xl border border-white/80 shadow-[0_18px_44px_-20px_rgba(30,41,90,0.35)]"}`;

  if (records.length === 0) {
    return (
      <div ref={rootRef} className={`${frame} bg-white/70`}>
        {filters}
        <div className="flex flex-1 items-center justify-center p-6">
          {empty ?? <p className="max-w-sm rounded-2xl border border-dashed border-ink-200 bg-white/70 px-6 py-10 text-center text-sm text-ink-500">No scheduled stages match these filters.</p>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`${frame} bg-[#EEF2FA]`}>
      {filters}

      <div className="relative min-h-0 flex-1">
        <div
          ref={viewportRef}
          tabIndex={0}
          role="application"
          aria-label="TNA timeline canvas. Drag to move, Control and scroll to zoom, arrow keys to move, plus and minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onMouseDown={(e) => e.button === 1 && e.preventDefault()}
          onKeyDown={onKeyDown}
          className={`absolute inset-0 touch-none select-none overflow-clip bg-white/85 outline-none ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        >
          {/* The layers below are clipped with overflow: clip, not hidden - a hidden box can still be scrolled by
              the browser (focusing or clicking a control that is off-screen scrolls it into view), which would
              slide the names column or the chart out of step with the other layers. A clipped box never scrolls. */}
          {/* ---- the chart: moves with the view */}
          <div className="absolute" style={{ left: labelW, top: HEAD_H, right: 0, bottom: 0, overflow: "clip" }}>
            <div className="absolute left-0 top-0 will-change-transform" style={{ width: worldW, height: Math.max(totalH, 1), transform: `translate3d(${-Math.round(view.sx)}px, ${-Math.round(view.sy)}px, 0)` }}>
              <CanvasBody items={items} lo={lo} ppd={view.ppd} now={now} totalW={worldW} totalH={totalH} weekends={weekends} nowX={nowX} onSelect={select} onHover={setHover} onOpenOrder={openOrder} />
            </div>
          </div>

          {/* ---- names column: pinned left, follows vertical movement */}
          <div className="absolute left-0 overflow-clip border-r border-ink-200 bg-white" style={{ top: HEAD_H, bottom: 0, width: labelW }}>
            <div className="absolute left-0 top-0 will-change-transform" style={{ width: labelW, height: Math.max(totalH, 1), transform: `translate3d(0, ${-Math.round(view.sy)}px, 0)` }}>
              <CanvasLabels items={items} labelW={labelW} onToggle={toggleGroup} onOpenOrder={openOrder} />
            </div>
          </div>

          {/* ---- date header: pinned top, follows horizontal movement */}
          <div className="absolute top-0 overflow-clip border-b border-ink-200 bg-white" style={{ left: labelW, right: 0, height: HEAD_H }}>
            <div className="absolute left-0 top-0 will-change-transform" style={{ width: totalW, height: HEAD_H, transform: `translate3d(${-Math.round(view.sx)}px, 0, 0)` }}>
              <CanvasHeader months={months} ticks={ticks} lo={lo} ppd={view.ppd} todayAt={todayAt} />
            </div>
          </div>
          <div className="absolute left-0 top-0 flex items-center border-b border-r border-ink-200 bg-ink-800 px-4 text-xs font-bold uppercase tracking-wide text-white" style={{ width: labelW, height: HEAD_H }}>
            Order / status
          </div>
        </div>

        {/* ---- overlays (outside the draggable area, so pressing them never starts a drag) */}
        {!hinted && (
          <div className="pointer-events-none absolute left-1/2 top-[70px] -translate-x-1/2 rounded-full bg-ink-900/85 px-4 py-2 text-xs font-medium text-white shadow-lg">
            Drag to move · Ctrl + scroll to zoom · arrow keys to nudge
          </div>
        )}

        <div className="absolute bottom-16 left-3 z-20 flex flex-col items-start gap-2 sm:bottom-3">
          {showLegend && (
            <div className="space-y-1.5 rounded-xl border border-white/80 bg-white/95 p-3 text-[11px] text-ink-700 shadow-[0_12px_30px_-10px_rgba(15,23,42,0.35)]">
              {TNA_STATUS_ORDER.map((s) => (
                <p key={s} className="flex items-center gap-2">
                  <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: TNA_STATUS_META[s].color }} />
                  {TNA_STATUS_META[s].label}
                </p>
              ))}
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-4 rounded-sm border border-dashed border-orange-400" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(249,115,22,0.35) 0 3px, transparent 3px 6px)" }} />
                Grace (excess) time
              </p>
              <p className="flex items-center gap-2">
                <span className="h-3 w-3 rotate-45 rounded-[3px] bg-ink-500" /> Completed
              </p>
            </div>
          )}
          <button type="button" onClick={() => setShowLegend((v) => !v)} className="rounded-full border border-white/80 bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-md hover:bg-white">
            {showLegend ? "Hide legend" : "Legend"}
          </button>
        </div>

        {showMap && (
          <Minimap items={items} totalW={worldW} totalH={totalH} view={view} visW={visW} visH={visH} lo={lo} ppd={view.ppd} onGo={(sx, sy) => apply({ ppd: view.ppd, sx, sy })} />
        )}

        <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-white/80 bg-white/95 p-1 text-xs font-semibold text-ink-700 shadow-[0_12px_30px_-10px_rgba(15,23,42,0.4)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CtrlButton label="Zoom out" onClick={() => zoomAt(0.8, liveVisW() / 2)}>
            −
          </CtrlButton>
          <button type="button" title="Reset to 100%" onClick={() => zoomAt(BASE_PPD / view.ppd, liveVisW() / 2)} className="min-w-[3.4rem] rounded-full px-2 py-1.5 tabular-nums hover:bg-ink-100">
            {zoomPct}%
          </button>
          <CtrlButton label="Zoom in" onClick={() => zoomAt(1.25, liveVisW() / 2)}>
            +
          </CtrlButton>
          <span className="mx-1 h-5 w-px bg-ink-200" />
          <TextButton onClick={fit} title="Fit the whole schedule on screen (0)">
            Fit
          </TextButton>
          <TextButton onClick={goToday} title="Jump to now (T)">
            Today
          </TextButton>
          <TextButton onClick={() => setShowMap((v) => !v)} active={showMap} title="Show or hide the overview map">
            Map
          </TextButton>
          <TextButton onClick={toggleFullscreen} active={isFullscreen} title="Full screen (F)">
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </TextButton>
        </div>
      </div>

      {hover && !panning && <TnaHoverCard hover={hover} />}
      {orderCard && cardGroup && <TnaOrderCard group={cardGroup} x={orderCard.x} y={orderCard.y} collapsed={!expanded.has(cardGroup.orderId)} onToggle={() => toggleGroup(cardGroup.orderId)} onClose={() => setOrderCard(null)} />}
      {children}
    </div>
  );
}

function CtrlButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-full text-base leading-none hover:bg-ink-100">
      {children}
    </button>
  );
}
function TextButton({ children, onClick, title, active }: { children: ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} className={`rounded-full px-3 py-1.5 hover:bg-ink-100 ${active ? "bg-brand/10 text-brand" : ""}`}>
      {children}
    </button>
  );
}

/** Clicking an order's own row opens its card (photo + schedule summary), at the pointer - or beside the row when it was keyboard-activated. */
function orderTrigger(orderId: string, open: (orderId: string, x: number, y: number) => void) {
  return {
    "data-order-trigger": "",
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (e.detail === 0) open(orderId, r.left + 40, r.bottom);
      else open(orderId, e.clientX, e.clientY);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The three moving layers. Memoised: panning changes only their parents' transforms, so none of
// this re-renders while you drag - only when the zoom, the data or the open/closed groups change.

const CanvasBody = memo(function CanvasBody({
  items,
  lo,
  ppd,
  now,
  totalW,
  totalH,
  weekends,
  nowX,
  onSelect,
  onHover,
  onOpenOrder,
}: {
  items: Item[];
  lo: number;
  ppd: number;
  now: number;
  totalW: number;
  totalH: number;
  weekends: number[];
  nowX: number;
  onSelect: (r: TnaRecord) => void;
  onHover: (h: RowHover | null) => void;
  onOpenOrder: (orderId: string, x: number, y: number) => void;
}) {
  const xOf = (ms: number) => ((ms - lo) / DAY) * ppd;

  // Arrows from each stage's card to the next stage's, wherever the two now sit (solid in the stage's colour once it is done, dashed while it is still ahead).
  const cardsByOrder = new Map<number, PlacedCard[]>();
  for (const it of items) if (it.kind === "lane") cardsByOrder.set(it.band, [...(cardsByOrder.get(it.band) ?? []), ...it.cards]);
  const links: FlowLink[] = [];
  for (const cards of cardsByOrder.values()) {
    cards.sort((a, b) => a.row.record.stageSeq - b.row.record.stageSeq);
    for (let i = 1; i < cards.length; i++) {
      const a = cards[i - 1];
      const b = cards[i];
      const done = a.row.result.isCompleted;
      links.push({
        key: `${a.row.record.id}>${b.row.record.id}`,
        d: connectorPath({ l: a.x, t: a.y, w: CARD_W, h: CARD_H }, { l: b.x, t: b.y, w: CARD_W, h: CARD_H }),
        color: done ? TNA_STATUS_META[a.row.result.status].color : "#94A3B8",
        done,
      });
    }
  }

  return (
    <div className="relative" style={{ width: totalW, height: Math.max(totalH, 1) }}>
      {/* one background per order, alternating white / grey, with a line where one order ends and the next begins */}
      {items.map((it) =>
        it.kind === "group" ? <div key={`b-${it.group.orderId}`} className="absolute left-0 box-border" style={{ top: it.y, height: it.h, width: totalW, backgroundColor: bandColor(it.band), borderTop: it.band > 0 ? ORDER_DIVIDER : undefined }} /> : null,
      )}
      {/* the day lines sit above the backgrounds so they show on both colours */}
      <div className="pointer-events-none absolute inset-0" style={gridBackground(ppd)} />
      {weekends.map((t) => (
        <span key={t} className="absolute inset-y-0 bg-ink-100/40" style={{ left: xOf(t), width: ppd }} />
      ))}
      <TnaFlowLinks links={links} width={totalW} height={Math.max(totalH, 1)} />
      {items.map((it) =>
        it.kind === "group" ? (
          <div key={`g-${it.group.orderId}`} className={`absolute left-0 cursor-pointer border-b border-ink-200/70 ${it.collapsed ? "" : HEADER_TINT}`} style={{ top: it.y, height: GROUP_H, width: totalW }} {...orderTrigger(it.group.orderId, onOpenOrder)}>
            {it.collapsed &&
              it.group.rows.map((r) => {
                const a = new Date(r.record.plannedStart).getTime();
                const b = new Date(r.record.plannedEnd).getTime();
                const w = Math.max(xOf(b) - xOf(a), 4);
                // The hit area is wider and taller than the bar itself, so even a thin stage is easy to point at.
                const hitW = Math.max(w, 10);
                const show = (e: ReactMouseEvent) => onHover({ record: r.record, result: r.result, x: e.clientX, y: e.clientY });
                return (
                  <div
                    key={r.record.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${r.record.stageLabel}: ${TNA_STATUS_META[r.result.status].label}`}
                    onClick={(e) => {
                      e.stopPropagation(); // this stage, not the order's card
                      onSelect(r.record);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.stopPropagation();
                      onSelect(r.record);
                    }}
                    onMouseEnter={show}
                    onMouseMove={show}
                    onMouseLeave={() => onHover(null)}
                    className="group/stage absolute top-[7px] flex h-[30px] cursor-pointer items-center justify-center"
                    style={{ left: xOf(a) - (hitW - w) / 2, width: hitW }}
                  >
                    <span className="h-3 rounded-sm opacity-90 transition-transform group-hover/stage:scale-y-[1.6] group-hover/stage:opacity-100" style={{ width: w, backgroundColor: TNA_STATUS_META[r.result.status].color }} />
                  </div>
                );
              })}
          </div>
        ) : (
          // A status lane: its cards sit at their planned dates.
          <div key={`l-${it.orderId}-${it.status}`} className="absolute left-0 border-b border-ink-200/60" style={{ top: it.y, height: it.h, width: totalW, backgroundColor: `${TNA_STATUS_META[it.status].color}0A` }}>
            {it.cards.map((c) => (
              <TnaFlowCard key={c.row.record.id} record={c.row.record} result={c.row.result} now={now} left={c.x} top={c.y - it.y} onSelect={onSelect} />
            ))}
          </div>
        ),
      )}
      <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-rose-500/70" style={{ left: nowX }} />
    </div>
  );
});

const CanvasLabels = memo(function CanvasLabels({ items, labelW, onToggle, onOpenOrder }: { items: Item[]; labelW: number; onToggle: (orderId: string) => void; onOpenOrder: (orderId: string, x: number, y: number) => void }) {
  return (
    <div className="relative" style={{ width: labelW }}>
      {items.map((it) =>
        it.kind === "group" ? <div key={`b-${it.group.orderId}`} className="absolute left-0 box-border" style={{ top: it.y, height: it.h, width: labelW, backgroundColor: bandColor(it.band), borderTop: it.band > 0 ? ORDER_DIVIDER : undefined }} /> : null,
      )}
      {items.map((it) => {
        if (it.kind === "group") {
          const g = it.group;
          let late = 0;
          let warn = 0;
          let done = 0;
          for (const r of g.rows) {
            if (r.result.status === "critical" || r.result.status === "completed_late") late++;
            else if (r.result.status === "grace" || r.result.status === "completed_grace") warn++;
            if (r.result.isCompleted) done++;
          }
          return (
            <div key={`g-${g.orderId}`} className={`absolute left-0 flex items-stretch border-b border-ink-200/70 ${it.collapsed ? "" : HEADER_TINT}`} style={{ top: it.y, height: GROUP_H, width: labelW }}>
              <button type="button" onClick={() => onToggle(g.orderId)} aria-expanded={!it.collapsed} aria-label={`${it.collapsed ? "Show" : "Hide"} the stages of IO ${g.order.ioNo}`} title={it.collapsed ? "Show stages" : "Hide stages"} className="flex w-8 shrink-0 items-center justify-center text-ink-500 hover:bg-black/[0.04] hover:text-ink-900">
                <span className={`text-xs transition-transform ${it.collapsed ? "" : "rotate-90"}`}>▶</span>
              </button>
              <button type="button" {...orderTrigger(g.orderId, onOpenOrder)} title="Click for this order's card" className="flex min-w-0 flex-1 flex-col justify-center pr-3 text-left hover:bg-black/[0.04]">
                <span className="block truncate text-xs font-extrabold text-ink-900">
                  IO {g.order.ioNo} · {g.order.style}
                </span>
                <span className="block truncate text-[10px] text-ink-500">
                  {[g.order.color, g.order.buyer?.name].filter(Boolean).join(" · ") || "-"} · {done}/{g.rows.length} done
                  {late > 0 && <span className="font-bold text-rose-600"> · {late} late</span>}
                  {warn > 0 && <span className="font-bold text-orange-600"> · {warn} warning</span>}
                </span>
              </button>
            </div>
          );
        }
        // A status lane: its name and how many stages are in it right now (a lane only exists while it has one).
        const meta = TNA_STATUS_META[it.status];
        return (
          <div key={`l-${it.orderId}-${it.status}`} className="absolute left-0 flex items-center gap-2.5 border-b border-ink-200/60 pl-4 pr-3" style={{ top: it.y, height: it.h, width: labelW, backgroundColor: `${meta.color}0A`, boxShadow: `inset 4px 0 0 ${meta.color}` }}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.needsAttention ? "animate-pulseSoft" : ""}`} style={{ backgroundColor: meta.color }} />
            <span className="min-w-0 flex-1 text-xs font-bold leading-tight" style={{ color: meta.text }}>
              {meta.label}
            </span>
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums text-white" style={{ backgroundColor: meta.color }}>
              {it.cards.length}
            </span>
          </div>
        );
      })}
    </div>
  );
});

const CanvasHeader = memo(function CanvasHeader({ months, ticks, lo, ppd, todayAt }: { months: ReturnType<typeof monthBands>; ticks: ReturnType<typeof ticksFor>; lo: number; ppd: number; todayAt: number }) {
  const xOf = (ms: number) => ((ms - lo) / DAY) * ppd;
  return (
    <div className="relative h-full">
      {months.map((m, i) => {
        const w = xOf(m.end) - xOf(m.start);
        return (
          <div key={m.start} className="absolute top-0 flex h-[26px] items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-bold text-white" style={{ left: xOf(m.start), width: w, backgroundColor: MONTH_BAND_COLORS[i % MONTH_BAND_COLORS.length], borderRight: "1px solid rgba(255,255,255,0.6)" }}>
            {w > 78 ? m.label : w > 36 ? m.label.slice(0, 3) : ""}
          </div>
        );
      })}
      {ticks.map((t) => (
        <div key={t.at} title={t.at === todayAt ? "Today" : undefined} className={`absolute top-[26px] flex h-7 items-center justify-center font-semibold leading-none ${ppd < 28 ? "text-[9px]" : "text-[10px]"} ${t.weekend ? "bg-ink-100/70 text-ink-400" : t.major ? "text-ink-900" : "text-ink-600"}`} style={{ left: xOf(t.at), width: ppd * t.spanDays }}>
          {t.at === todayAt ? <span className="rounded-full bg-rose-600 px-1.5 py-[3px] font-bold text-white">{t.label}</span> : t.label}
        </div>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------------------------

const MAP_W = 188;
const MAP_H = 112;

/** The whole schedule in miniature with the visible window on it - drag or click to jump anywhere. */
function Minimap({ items, totalW, totalH, view, visW, visH, lo, ppd, onGo }: { items: Item[]; totalW: number; totalH: number; view: View; visW: number; visH: number; lo: number; ppd: number; onGo: (sx: number, sy: number) => void }) {
  const kx = MAP_W / Math.max(totalW, 1);
  const ky = MAP_H / Math.max(totalH, 1);
  const dragging = useRef(false);

  const bars = useMemo(
    () =>
      items.map((it) => {
        if (it.kind === "group")
          return (
            <g key={`g-${it.group.orderId}`}>
              <rect x={0} y={it.y * ky} width={MAP_W} height={Math.max(GROUP_H * ky, 1)} fill={it.band % 2 === 0 ? "#E2E8F0" : "#CBD5E1"} opacity={0.7} />
              {it.collapsed &&
                it.group.rows.map((r) => {
                  const a = ((new Date(r.record.plannedStart).getTime() - lo) / DAY) * ppd;
                  const b = ((new Date(r.record.plannedEnd).getTime() - lo) / DAY) * ppd;
                  return <rect key={r.record.id} x={a * kx} y={(it.y + 16) * ky} width={Math.max((b - a) * kx, 1.5)} height={Math.max(12 * ky, 1.5)} rx={1} fill={TNA_STATUS_META[r.result.status].color} />;
                })}
            </g>
          );
        return (
          <g key={`l-${it.orderId}-${it.status}`}>
            {it.cards.map((c) => (
              <rect key={c.row.record.id} x={c.x * kx} y={c.y * ky} width={Math.max(CARD_W * kx, 1.5)} height={Math.max(CARD_H * ky, 1.5)} rx={1} fill={TNA_STATUS_META[c.row.result.status].color} />
            ))}
          </g>
        );
      }),
    [items, kx, ky, lo, ppd],
  );

  const go = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / kx;
    const py = (e.clientY - rect.top) / ky;
    onGo(px - visW / 2, py - visH / 2);
  };

  return (
    <div
      className="absolute bottom-16 right-3 z-20 cursor-pointer overflow-hidden rounded-xl sm:bottom-3 border border-white/80 bg-white/95 shadow-[0_12px_30px_-10px_rgba(15,23,42,0.4)]"
      style={{ width: MAP_W, height: MAP_H }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        go(e);
      }}
      onPointerMove={(e) => dragging.current && go(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      title="Overview - click or drag to move around"
    >
      <svg width={MAP_W} height={MAP_H} aria-hidden>
        {bars}
        <rect x={view.sx * kx} y={view.sy * ky} width={Math.min(visW * kx, MAP_W)} height={Math.min(visH * ky, MAP_H)} fill="rgba(37,99,235,0.12)" stroke="#2563EB" strokeWidth={1.5} rx={2} />
      </svg>
    </div>
  );
}
