"use client";

import { TNA_STATUS_META, formatDuration, type TnaRecord, type TnaResult } from "@/lib/tna";
import { fmtDate } from "@/lib/tnaFormat";
import { CARD_H, CARD_W } from "@/lib/tnaBoard";
import { TnaChip } from "./TnaStatusChip";

/**
 * One stage of an opened-up order, as a card: its number, name, planned window and status, with an
 * Open button for the full record. It sits in the lane of the status it is in (see tnaBoard.ts). The border, accent edge and soft tint carry the status colour,
 * an upcoming stage is dashed, and the thin strip along the bottom is how much of the planned
 * window has gone by (full once the stage is done).
 */
export function TnaFlowCard({ record, result, now, left, top, onSelect }: { record: TnaRecord; result: TnaResult; now: number; left: number; top: number; onSelect: (record: TnaRecord) => void }) {
  const meta = TNA_STATUS_META[result.status];
  const upcoming = result.status === "upcoming";
  const start = new Date(record.plannedStart).getTime();
  const end = new Date(record.plannedEnd).getTime();
  const progress = result.isCompleted ? 1 : upcoming || end <= start ? 0 : Math.min(Math.max((now - start) / (end - start), 0), 1);
  const open = () => onSelect(record);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${record.stageLabel}: ${result.headline}. Open the full record.`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
      className="group/card absolute flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-[0_10px_24px_-16px_rgba(30,41,90,0.5)] outline-none transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_18px_32px_-16px_rgba(30,41,90,0.55)] focus-visible:ring-2 focus-visible:ring-brand/40"
      style={{
        left,
        top,
        width: CARD_W,
        height: CARD_H,
        borderColor: `${meta.color}${upcoming ? "66" : "99"}`,
        borderStyle: upcoming ? "dashed" : "solid",
        backgroundImage: `linear-gradient(135deg, #FFFFFF 45%, ${meta.soft} 100%)`,
      }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: meta.color }} />

      <div className="flex items-start gap-2.5 py-2.5 pl-4 pr-3">
        <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold text-white shadow-sm" style={{ backgroundColor: meta.color }}>
          {record.stageSeq}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-extrabold leading-tight tracking-tight text-ink-900">{record.stageLabel}</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-ink-500">
            {fmtDate(record.plannedStart)} → {fmtDate(record.plannedEnd)} · {formatDuration(result.plannedDurationMin)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pb-2.5 pl-4 pr-3">
        <TnaChip result={result} />
        <span className="shrink-0 rounded-lg bg-brand-gradient px-2.5 py-1 text-[11px] font-bold text-white shadow-[0_6px_14px_-8px_rgba(21,94,239,0.7)] transition-transform group-hover/card:scale-105">Open ↗</span>
      </div>

      <span aria-hidden className="absolute bottom-0 left-0 h-[3px]" style={{ width: `${progress * 100}%`, backgroundColor: meta.color }} />
    </div>
  );
}

export interface FlowLink {
  key: string;
  d: string;
  color: string;
  /** Solid once the stage it leaves is done, dashed while it is still ahead. */
  done: boolean;
}

/** Arrow-head markers, one per colour the links use (an SVG marker can't take its line's colour everywhere). */
function markerId(color: string) {
  return `tna-arrow-${color.replace("#", "")}`;
}

/**
 * The arrows that tie the cards together in workflow order, drawn behind them as one SVG over the
 * whole canvas (the paths come from connectorPath in tnaBoard.ts).
 */
export function TnaFlowLinks({ links, width, height }: { links: FlowLink[]; width: number; height: number }) {
  if (links.length === 0) return null;
  const colors = Array.from(new Set(links.map((l) => l.color)));
  return (
    <svg className="pointer-events-none absolute left-0 top-0" width={width} height={height} aria-hidden>
      <defs>
        {colors.map((c) => (
          <marker key={c} id={markerId(c)} markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M1 1.5 L8 5 L1 8.5 Z" fill={c} />
          </marker>
        ))}
      </defs>
      {links.map((l) => (
        <path key={l.key} d={l.d} fill="none" stroke={l.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={l.done ? undefined : "5 5"} markerEnd={`url(#${markerId(l.color)})`} />
      ))}
    </svg>
  );
}
