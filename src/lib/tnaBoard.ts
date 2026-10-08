import type { TnaStatus } from "./tna";
import { DAY, type TnaRow } from "./tnaTimeline";

/**
 * The layout of an opened-up order on the TNA canvas: one horizontal LANE per status that has a stage
 * in it (a status nobody is in simply has no lane), and every stage as a card in the lane of the status
 * it is in right now, placed along the lane by its planned start date. Status is recomputed against the
 * clock, so a stage that slips changes lane by itself - and a lane appears the moment something lands
 * in it and goes away when it empties.
 *
 * Pure functions: the canvas draws what they return.
 */

export const CARD_W = 248;
export const CARD_H = 84;
/** Breathing room above and below the cards in a lane, and between two cards stacked in one. */
const LANE_PAD = 14;
const STACK_GAP = 14;
/** Cards in one stack never closer than this sideways. */
const SIDE_GAP = 16;

/** Top to bottom: what is finished (best first), then what is still open, then what needs attention. */
export const LANE_ORDER: TnaStatus[] = ["completed_early", "completed_on_time", "completed_grace", "completed_late", "in_progress", "upcoming", "critical", "grace"];

export interface BoardCard {
  row: TnaRow;
  /** Left edge in the world (px along the time axis). */
  x: number;
  /** Top edge, relative to the top of its lane. */
  top: number;
}

export interface BoardLane {
  status: TnaStatus;
  cards: BoardCard[];
  /** Height of the lane: enough for however many cards overlap in time. */
  h: number;
}

/**
 * Lay an order's stages out in status lanes, in LANE_ORDER, leaving out the empty ones. Cards in a lane that would overlap sideways (a card is
 * wider than a short stage) are stacked, each into the first stack with room, so the lane is only
 * as tall as it needs to be at this zoom.
 */
export function laneLayout(rows: TnaRow[], lo: number, ppd: number): BoardLane[] {
  const lanes: BoardLane[] = [];
  for (const status of LANE_ORDER) {
    const inLane = rows
      .filter((r) => r.result.status === status)
      .sort((a, b) => new Date(a.record.plannedStart).getTime() - new Date(b.record.plannedStart).getTime() || a.record.stageSeq - b.record.stageSeq);
    if (inLane.length === 0) continue;

    const stackEnds: number[] = []; // right edge of the last card in each stack
    const cards = inLane.map((row) => {
      const x = ((new Date(row.record.plannedStart).getTime() - lo) / DAY) * ppd;
      let stack = stackEnds.findIndex((end) => x >= end + SIDE_GAP);
      if (stack < 0) stack = stackEnds.push(0) - 1;
      stackEnds[stack] = x + CARD_W;
      return { row, x, top: LANE_PAD + stack * (CARD_H + STACK_GAP) };
    });
    const stacks = stackEnds.length;
    lanes.push({ status, cards, h: LANE_PAD * 2 + stacks * CARD_H + (stacks - 1) * STACK_GAP });
  }
  return lanes;
}

export interface Rect {
  l: number;
  t: number;
  w: number;
  h: number;
}

/**
 * The connector from one card to the next stage's card, ending in an arrow at the second:
 * side to side with a rounded step when the next card is further along in time, top to bottom when
 * they overlap sideways, and back the other way when the next stage is earlier.
 */
export function connectorPath(a: Rect, b: Rect): string {
  const R = 8;
  const GAP = 18;
  const ar = a.l + a.w;
  const br = b.l + b.w;
  const ay = a.t + a.h / 2;
  const by = b.t + b.h / 2;
  if (b.l >= ar + GAP) return stepPath(ar, ay, b.l, by, 1, R);
  if (br + GAP <= a.l) return stepPath(a.l, ay, br, by, -1, R);
  // Overlapping sideways: a straight run between the facing edges, somewhere both cards cover.
  const from = Math.max(a.l, b.l);
  const to = Math.min(ar, br);
  const x = Math.min(Math.max(a.l + 28, from + 24), Math.max(to - 24, from + 24));
  return b.t > a.t ? `M ${x} ${a.t + a.h} V ${b.t - 1}` : `M ${x} ${a.t} V ${b.t + b.h + 1}`;
}

function stepPath(x1: number, y1: number, x2: number, y2: number, dir: 1 | -1, R: number): string {
  const tip = x2 - dir; // rest the arrow tip on the edge of the card
  if (Math.abs(y2 - y1) < 1) return `M ${x1} ${y1} H ${tip}`;
  const mx = (x1 + x2) / 2;
  const sy = y2 > y1 ? 1 : -1;
  if (Math.abs(y2 - y1) < 2 * R + 2 || Math.abs(x2 - x1) < 4 * R) return `M ${x1} ${y1} H ${mx} V ${y2} H ${tip}`;
  return `M ${x1} ${y1} H ${mx - dir * R} Q ${mx} ${y1} ${mx} ${y1 + sy * R} V ${y2 - sy * R} Q ${mx} ${y2} ${mx + dir * R} ${y2} H ${tip}`;
}
