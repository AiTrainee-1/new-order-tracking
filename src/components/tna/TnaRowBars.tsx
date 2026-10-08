"use client";

import { useState, type MouseEvent } from "react";
import { TNA_STATUS_META, formatDuration, type TnaRecord, type TnaResult } from "@/lib/tna";
import { fmtDate, fmtDateTime } from "@/lib/tnaFormat";
import { orderImageUrl } from "@/lib/imageUrl";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { TnaStatusPill } from "./TnaStatusChip";
import { DAY, type TnaGroup } from "@/lib/tnaTimeline";

export interface RowHover {
  record: TnaRecord;
  result: TnaResult;
  x: number;
  y: number;
}

/**
 * The bars for ONE stage, drawn inside its lane (a positioned box as tall as a
 * row), shared by the Admin timeline and the MD canvas so the two always show
 * the same thing:
 *
 *   planned window  - the tinted bar from planned start to planned end
 *   grace zone      - the hatched extension after the deadline
 *   actual progress - the solid bar beneath: first activity -> completion (or now)
 *   completion      - the diamond
 */
export function TnaRowBars({
  record,
  result,
  ppd,
  lo,
  now,
  onSelect,
  onHover,
}: {
  record: TnaRecord;
  result: TnaResult;
  /** Pixels per day. */
  ppd: number;
  /** The time at the left edge of the lane. */
  lo: number;
  now: number;
  onSelect?: (record: TnaRecord) => void;
  onHover: (hover: RowHover | null) => void;
}) {
  const meta = TNA_STATUS_META[result.status];
  const x = (ms: number) => ((ms - lo) / DAY) * ppd;
  const ps = new Date(record.plannedStart).getTime();
  const pe = new Date(record.plannedEnd).getTime();
  const ge = new Date(result.graceEndAt).getTime();
  const as = record.actualStartAt ? new Date(record.actualStartAt).getTime() : null;
  const ce = record.completedAt ? new Date(record.completedAt).getTime() : null;
  const planW = Math.max(x(pe) - x(ps), 6);
  const upcoming = result.status === "upcoming";
  const actualEnd = ce ?? now;
  const actualColor = result.isCompleted ? meta.color : result.status === "critical" ? TNA_STATUS_META.critical.color : result.status === "grace" ? TNA_STATUS_META.grace.color : TNA_STATUS_META.in_progress.color;
  const show = (e: MouseEvent) => onHover({ record, result, x: e.clientX, y: e.clientY });
  const hoverProps = { onMouseEnter: show, onMouseMove: show, onMouseLeave: () => onHover(null) };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(record)}
        onKeyDown={(e) => e.key === "Enter" && onSelect?.(record)}
        {...hoverProps}
        className="absolute top-[7px] flex h-[18px] cursor-pointer items-center overflow-hidden rounded-md px-1.5 text-[10px] font-semibold"
        style={{ left: x(ps), width: planW, backgroundColor: `${meta.color}26`, color: meta.text, border: `1.5px ${upcoming ? "dashed" : "solid"} ${meta.color}` }}
      >
        {planW > 118 ? `${fmtDate(record.plannedStart)} → ${fmtDate(record.plannedEnd)}` : ""}
      </div>
      {result.graceTotalMin > 0 && (
        <div
          {...hoverProps}
          className="absolute top-[7px] h-[18px] rounded-r-md border border-dashed border-orange-400"
          style={{ left: x(pe), width: Math.max(x(ge) - x(pe), 3), backgroundImage: "repeating-linear-gradient(135deg, rgba(249,115,22,0.38) 0 3px, rgba(255,255,255,0.0) 3px 6px)" }}
        />
      )}
      {as !== null && <div {...hoverProps} className="absolute top-[30px] h-[7px] rounded-full" style={{ left: x(as), width: Math.max(x(actualEnd) - x(as), 4), backgroundColor: actualColor }} />}
      {ce !== null && <span className="absolute top-[26px] h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px] ring-2 ring-white" style={{ left: x(ce), backgroundColor: meta.color }} />}
    </>
  );
}

/** The order's photo, as the Order Dashboard shows it - a garment outline when there is none (or it fails to load). */
function OrderThumb({ imageId, alt, className }: { imageId: string | null | undefined; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : orderImageUrl(imageId);
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50 ring-1 ring-ink-200/70 ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <GarmentPlaceholder className="h-1/2 w-1/2 text-ink-400" />
      )}
    </div>
  );
}

/** Where a hover card goes: beside the pointer, kept inside the window. */
function cardPos(x: number, y: number, cardH: number) {
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  return { left: Math.max(8, Math.min(x + 16, w - 300)), top: Math.max(8, Math.min(y + 16, h - cardH)) };
}

const CARD_BASE = "fixed z-50 w-72 rounded-xl border border-ink-100 bg-white p-3 text-xs shadow-[0_18px_40px_-12px_rgba(15,23,42,0.35)]";
/** A hover card only looks - the pointer passes straight through it. */
const CARD = `pointer-events-none ${CARD_BASE}`;

/** The hover card both timelines show for a bar: the order (with its photo), the stage, its status and the planned-against-actual facts. */
export function TnaHoverCard({ hover }: { hover: RowHover }) {
  const { record, result } = hover;
  const order = record.order;
  return (
    <div className={CARD} style={cardPos(hover.x, hover.y, 330)}>
      <div className="flex items-center gap-3">
        <OrderThumb imageId={order?.imageId} alt={order?.style ?? "Order"} className="h-14 w-14" />
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-400">IO {order?.ioNo}</p>
          <p className="truncate text-sm font-extrabold text-ink-900">{order?.style}</p>
          <p className="truncate text-[11px] text-ink-500">{[order?.color, order?.buyer?.name].filter(Boolean).join(" · ") || "-"}</p>
        </div>
      </div>
      <p className="mt-2.5 flex items-center justify-between gap-2 border-t border-ink-100 pt-2.5 text-sm font-extrabold text-ink-900">
        {record.stageLabel}
        <TnaStatusPill status={result.status} />
      </p>
      <p className="mt-1 font-semibold" style={{ color: TNA_STATUS_META[result.status].text }}>
        {result.headline}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-600">
        <dt>Planned</dt>
        <dd className="text-right font-medium text-ink-800">
          {fmtDateTime(record.plannedStart)} → {fmtDateTime(record.plannedEnd)}
        </dd>
        {result.graceTotalMin > 0 && (
          <>
            <dt>Grace until</dt>
            <dd className="text-right font-medium text-ink-800">{fmtDateTime(result.graceEndAt)}</dd>
          </>
        )}
        <dt>Actual</dt>
        <dd className="text-right font-medium text-ink-800">
          {record.actualStartAt ? fmtDateTime(record.actualStartAt) : "not started"} → {record.completedAt ? fmtDateTime(record.completedAt) : "open"}
        </dd>
        <dt>Planned / actual</dt>
        <dd className="text-right font-medium text-ink-800">
          {formatDuration(result.plannedDurationMin)} / {result.actualDurationMin === null ? "-" : formatDuration(result.actualDurationMin)}
        </dd>
      </dl>
      <p className="mt-2 text-[10px] text-ink-400">Click for the full record and history.</p>
    </div>
  );
}

/**
 * An order's card, opened by CLICKING the order (not on hover): its photo and where its schedule
 * stands. It stays until it is closed, another order is clicked, or you click anywhere else.
 */
export function TnaOrderCard({ group, x, y, collapsed, onToggle, onClose }: { group: TnaGroup; x: number; y: number; collapsed: boolean; onToggle: () => void; onClose: () => void }) {
  const { order, rows } = group;
  let done = 0;
  let late = 0;
  let warn = 0;
  for (const r of rows) {
    if (r.result.isCompleted) done++;
    if (r.result.status === "critical" || r.result.status === "completed_late") late++;
    else if (r.result.status === "grace" || r.result.status === "completed_grace") warn++;
  }
  const next = rows.find((r) => !r.result.isCompleted);
  const first = Math.min(...rows.map((r) => new Date(r.record.plannedStart).getTime()));
  const last = Math.max(...rows.map((r) => new Date(r.record.plannedEnd).getTime()));
  return (
    <div role="dialog" aria-label={`IO ${order.ioNo} details`} data-order-card="" className={CARD_BASE} style={cardPos(x, y, 360)}>
      <button type="button" onClick={onClose} aria-label="Close" title="Close" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700">
        ✕
      </button>
      <div className="flex items-center gap-3 pr-6">
        <OrderThumb imageId={order.imageId} alt={order.style} className="h-16 w-16" />
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-400">IO {order.ioNo}</p>
          <p className="truncate text-sm font-extrabold text-ink-900">{order.style}</p>
          <p className="truncate text-[11px] text-ink-500">{[order.color, order.buyer?.name].filter(Boolean).join(" · ") || "-"}</p>
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-ink-100 pt-2.5 text-ink-600">
        <dt>Stages</dt>
        <dd className="text-right font-medium text-ink-800">
          {done}/{rows.length} done
          {late > 0 && <span className="font-bold text-rose-600"> · {late} late</span>}
          {warn > 0 && <span className="font-bold text-orange-600"> · {warn} warning</span>}
        </dd>
        <dt>Scheduled</dt>
        <dd className="text-right font-medium text-ink-800">
          {fmtDate(new Date(first).toISOString())} → {fmtDate(new Date(last).toISOString())}
        </dd>
        {order.deliveryDate && (
          <>
            <dt>Delivery</dt>
            <dd className="text-right font-medium text-ink-800">{fmtDate(order.deliveryDate, true)}</dd>
          </>
        )}
        {next && (
          <>
            <dt>Next stage</dt>
            <dd className="truncate text-right font-medium text-ink-800">{next.record.stageLabel}</dd>
          </>
        )}
      </dl>
      <button type="button" onClick={onToggle} className="mt-3 w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100">
        {collapsed ? "Show this order's stages" : "Hide this order's stages"}
      </button>
    </div>
  );
}
