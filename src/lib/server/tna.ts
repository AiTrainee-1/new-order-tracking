import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { computeTna, type TnaEventRow, type TnaRecord, type TnaTimes } from "../tna";

/**
 * TNA on the server: loads schedules together with what actually happened on
 * each stage, freezes completions, saves schedules, and keeps the history.
 *
 * Everything here is a layer ON TOP of the production data: it only ever READS
 * stage entries, production rows and material/accessory requirements, and only
 * ever WRITES the tna_* tables. The production workflow does not know TNA
 * exists, and an order with no TnaPlan rows costs nothing but an empty query.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

interface Activity {
  /** Earliest recorded activity on the stage. */
  start: Date | null;
  /** When the stage was marked complete (the completing entry's saved timestamp). */
  completed: Date | null;
  /** Moved on without being completed. */
  partial: boolean;
  last: Date | null;
}

const minDate = (...ds: (Date | null | undefined)[]) => ds.reduce<Date | null>((a, d) => (d && (!a || d < a) ? d : a), null);
const maxDate = (...ds: (Date | null | undefined)[]) => ds.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

/**
 * What the floor actually did on each of these stages.
 *
 * Start = the first thing recorded against the stage: a production row, a stage
 * entry - and, for the two stages whose work is planning rather than counting
 * (Raw Material Planning, Accessories), the first requirement added.
 * Completion = the saved time of the entry that marked the stage complete.
 */
async function loadActivity(plans: { sectionId: string; orderId: string; stageKey: string }[]): Promise<Map<string, Activity>> {
  const out = new Map<string, Activity>();
  if (plans.length === 0) return out;
  const sectionIds = plans.map((p) => p.sectionId);
  const rmpOrders = plans.filter((p) => p.stageKey === "raw_material_planning").map((p) => p.orderId);
  const accOrders = plans.filter((p) => p.stageKey === "accessories").map((p) => p.orderId);

  const [txnAgg, entries, rmp, acc] = await Promise.all([
    prisma.productionTxn.groupBy({ by: ["sectionId"], where: { sectionId: { in: sectionIds } }, _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.stageEntry.findMany({
      where: { sectionId: { in: sectionIds } },
      select: { sectionId: true, createdAt: true, isCompleted: true, isForwarded: true, qtyForwarded: true },
      orderBy: { createdAt: "asc" },
    }),
    rmpOrders.length ? prisma.materialRequirement.groupBy({ by: ["orderId"], where: { orderId: { in: rmpOrders } }, _min: { createdAt: true } }) : Promise.resolve([]),
    accOrders.length ? prisma.accessoryRequirement.groupBy({ by: ["orderId"], where: { orderId: { in: accOrders } }, _min: { createdAt: true } }) : Promise.resolve([]),
  ]);

  const txnBy = new Map(txnAgg.map((t) => [t.sectionId, t]));
  const rmpBy = new Map(rmp.map((r) => [r.orderId, r._min.createdAt]));
  const accBy = new Map(acc.map((r) => [r.orderId, r._min.createdAt]));
  const entriesBy = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesBy.get(e.sectionId) ?? [];
    list.push(e);
    entriesBy.set(e.sectionId, list);
  }

  for (const p of plans) {
    const es = entriesBy.get(p.sectionId) ?? [];
    const tx = txnBy.get(p.sectionId);
    const special = p.stageKey === "raw_material_planning" ? rmpBy.get(p.orderId) : p.stageKey === "accessories" ? accBy.get(p.orderId) : null;
    const completing = es.find((e) => e.isCompleted) ?? null;
    out.set(p.sectionId, {
      start: minDate(es[0]?.createdAt, tx?._min.createdAt, special),
      completed: completing?.createdAt ?? null,
      partial: !completing && es.some((e) => e.isForwarded || Number(e.qtyForwarded) > 0),
      last: maxDate(es[es.length - 1]?.createdAt, tx?._max.createdAt),
    });
  }
  return out;
}

type PlanRow = Awaited<ReturnType<typeof findPlans>>[number];

function findPlans(where: { orderId?: string | { in: string[] } } = {}) {
  return prisma.tnaPlan.findMany({
    where,
    include: {
      section: { select: { label: true, seq: true, unitType: true } },
      order: { select: { id: true, ioNo: true, style: true, color: true, deliveryDate: true, isHidden: true, imageId: true, buyer: { select: { id: true, name: true } } } },
    },
    orderBy: [{ plannedStart: "asc" }],
  });
}

function toRecord(p: PlanRow, a: Activity | undefined, withOrder: boolean): TnaRecord {
  return {
    id: p.id,
    orderId: p.orderId,
    sectionId: p.sectionId,
    stageKey: p.stageKey,
    stageLabel: p.section.label,
    stageSeq: p.section.seq,
    unitType: p.section.unitType,
    plannedStart: p.plannedStart.toISOString(),
    plannedEnd: p.plannedEnd.toISOString(),
    graceMinutes: p.graceMinutes,
    notes: p.notes,
    source: p.source,
    // A completion that has been frozen onto the plan wins over whatever the live entries say now.
    actualStartAt: iso(p.actualStartAt ?? a?.start),
    completedAt: iso(p.completedAt ?? a?.completed),
    frozen: !!p.completedAt,
    isPartial: !!a?.partial,
    lastActivityAt: iso(a?.last),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    createdBy: p.createdBy,
    updatedBy: p.updatedBy,
    ...(withOrder
      ? {
          order: {
            id: p.order.id,
            ioNo: p.order.ioNo,
            style: p.order.style,
            color: p.order.color,
            deliveryDate: p.order.deliveryDate ? p.order.deliveryDate.toISOString().slice(0, 10) : null,
            isHidden: p.order.isHidden,
            imageId: p.order.imageId,
            buyer: p.order.buyer,
          },
        }
      : {}),
  };
}

const timesOf = (r: Pick<TnaRecord, keyof TnaTimes>): TnaTimes => ({
  plannedStart: r.plannedStart,
  plannedEnd: r.plannedEnd,
  graceMinutes: r.graceMinutes,
  actualStartAt: r.actualStartAt,
  completedAt: r.completedAt,
});

/**
 * Freeze finished stages: the first time a planned stage is seen completed,
 * write its measured start and completion onto the plan and record a
 * "completed" event with the outcome - so the record survives later edits to
 * the entries. Idempotent, and best-effort: it never throws into the caller.
 */
async function freezeCompletions(plans: PlanRow[], activity: Map<string, Activity>): Promise<void> {
  const todo = plans.filter((p) => !p.completedAt && activity.get(p.sectionId)?.completed);
  for (const p of todo) {
    const a = activity.get(p.sectionId)!;
    const times: TnaTimes = {
      plannedStart: p.plannedStart.toISOString(),
      plannedEnd: p.plannedEnd.toISOString(),
      graceMinutes: p.graceMinutes,
      actualStartAt: iso(p.actualStartAt ?? a.start),
      completedAt: iso(a.completed),
    };
    const r = computeTna(times, a.completed!);
    try {
      // Two requests can notice the same completion at once (the entry-save hook and a page
      // read). Only the one whose update actually changes the row may write the event.
      await prisma.$transaction(async (tx) => {
        const frozen = await tx.tnaPlan.updateMany({ where: { id: p.id, completedAt: null }, data: { actualStartAt: p.actualStartAt ?? a.start, completedAt: a.completed } });
        if (frozen.count !== 1) return;
        await tx.tnaEvent.create({
          data: {
            planId: p.id,
            orderId: p.orderId,
            sectionId: p.sectionId,
            stageKey: p.stageKey,
            kind: "completed",
            at: a.completed!,
            data: {
              outcome: r.status,
              headline: r.headline,
              plannedStart: times.plannedStart,
              plannedEnd: times.plannedEnd,
              graceMinutes: p.graceMinutes,
              actualStartAt: times.actualStartAt,
              completedAt: times.completedAt,
              plannedDurationMin: r.plannedDurationMin,
              actualDurationMin: r.actualDurationMin,
              delayMin: r.delayMin,
              earlyMin: r.earlyMin,
              graceUsedMin: r.graceUsedMin,
            },
          },
        });
      });
    } catch (err) {
      console.error("[tna] could not freeze completion", p.id, err);
    }
  }
}

/** Every TNA record (or those of the given orders), with live actuals. */
export async function listTnaRecords(opts: { orderIds?: string[]; withOrder?: boolean; sync?: boolean } = {}): Promise<TnaRecord[]> {
  const plans = await findPlans(opts.orderIds ? { orderId: { in: opts.orderIds } } : {});
  const activity = await loadActivity(plans);
  if (opts.sync !== false) await freezeCompletions(plans, activity).catch(() => undefined);
  return plans.map((p) => toRecord(p, activity.get(p.sectionId), opts.withOrder ?? false));
}

/** One order's TNA records plus the full event history. */
export async function getOrderTna(orderId: string): Promise<{ records: TnaRecord[]; events: TnaEventRow[] }> {
  const records = await listTnaRecords({ orderIds: [orderId], withOrder: false });
  const events = await prisma.tnaEvent.findMany({ where: { orderId }, orderBy: { at: "asc" } });
  return {
    records,
    events: events.map((e) => ({
      id: e.id,
      planId: e.planId,
      orderId: e.orderId,
      sectionId: e.sectionId,
      stageKey: e.stageKey,
      kind: e.kind,
      at: e.at.toISOString(),
      actorId: e.actorId,
      data: (e.data ?? {}) as Record<string, unknown>,
    })),
  };
}

/**
 * Called after something is recorded on an order's stage. Cheap when the order
 * has no TNA (one indexed lookup); never throws - TNA must not be able to break
 * a data-entry save.
 */
export async function syncTnaForOrder(orderId: string): Promise<void> {
  try {
    const plans = await findPlans({ orderId });
    if (plans.length === 0) return;
    await freezeCompletions(plans, await loadActivity(plans));
  } catch (err) {
    console.error("[tna] sync failed", err);
  }
}

export interface TnaStageInput {
  sectionId: string;
  /** Both null (or both missing) clears this stage's schedule. */
  plannedStart: string | null;
  plannedEnd: string | null;
  graceMinutes?: number;
  notes?: string | null;
}

export class TnaInputError extends Error {}

/**
 * Save an order's TNA in one all-or-nothing transaction: assign new stages,
 * change existing ones, clear the ones sent back empty. Every change is logged
 * to tna_events with what it was before, and the status the stage was in at the
 * moment it changed.
 */
export async function saveOrderTna(orderId: string, stages: TnaStageInput[], actorId: string, source: "manual" | "import" = "manual"): Promise<void> {
  const sections = await prisma.orderStagePlan.findMany({ where: { orderId }, select: { id: true, key: true, label: true } });
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const parsed = stages.map((s) => {
    const sec = sectionById.get(s.sectionId);
    if (!sec) throw new TnaInputError("One of those stages isn't part of this order any more. Refresh and try again.");
    if (seen.has(s.sectionId)) throw new TnaInputError(`${sec.label} appears twice.`);
    seen.add(s.sectionId);
    const clear = !s.plannedStart && !s.plannedEnd;
    if (clear) return { sec, clear: true as const };
    if (!s.plannedStart || !s.plannedEnd) throw new TnaInputError(`${sec.label}: give both a start and an end, or neither.`);
    const start = new Date(s.plannedStart);
    const end = new Date(s.plannedEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new TnaInputError(`${sec.label}: that date and time isn't valid.`);
    if (end.getTime() <= start.getTime()) throw new TnaInputError(`${sec.label}: the end must be after the start.`);
    const grace = Math.round(Number(s.graceMinutes ?? 0));
    if (!Number.isFinite(grace) || grace < 0 || grace > 525_600) throw new TnaInputError(`${sec.label}: the grace time must be between 0 and 365 days.`);
    const notes = s.notes?.trim() ? s.notes.trim().slice(0, 500) : null;
    return { sec, clear: false as const, start, end, grace, notes };
  });

  const existing = await prisma.tnaPlan.findMany({ where: { orderId, sectionId: { in: [...seen] } } });
  const exBy = new Map(existing.map((p) => [p.sectionId, p]));
  const activity = await loadActivity(existing.map((p) => ({ sectionId: p.sectionId, orderId, stageKey: p.stageKey })));
  const now = new Date();

  const statusOf = (p: { plannedStart: Date; plannedEnd: Date; graceMinutes: number; actualStartAt: Date | null; completedAt: Date | null; sectionId: string }) => {
    const a = activity.get(p.sectionId);
    return computeTna({ plannedStart: p.plannedStart.toISOString(), plannedEnd: p.plannedEnd.toISOString(), graceMinutes: p.graceMinutes, actualStartAt: iso(p.actualStartAt ?? a?.start), completedAt: iso(p.completedAt ?? a?.completed) }, now).status;
  };
  const snap = (p: { plannedStart: Date; plannedEnd: Date; graceMinutes: number; notes: string | null }) => ({ plannedStart: p.plannedStart.toISOString(), plannedEnd: p.plannedEnd.toISOString(), graceMinutes: p.graceMinutes, notes: p.notes });

  await prisma.$transaction(
    async (tx) => {
      const newPlans: { id: string; orderId: string; sectionId: string; stageKey: string; plannedStart: Date; plannedEnd: Date; graceMinutes: number; notes: string | null; source: string; createdBy: string; updatedBy: string }[] = [];
      const events: { planId: string | null; orderId: string; sectionId: string; stageKey: string; kind: "assigned" | "rescheduled" | "cleared"; at: Date; actorId: string; data: object }[] = [];

      for (const p of parsed) {
        const ex = exBy.get(p.sec.id);
        if (p.clear) {
          if (!ex) continue;
          await tx.tnaPlan.delete({ where: { id: ex.id } });
          events.push({ planId: null, orderId, sectionId: p.sec.id, stageKey: p.sec.key, kind: "cleared", at: now, actorId, data: { previous: snap(ex), statusBefore: statusOf(ex) } });
          continue;
        }
        if (!ex) {
          const id = randomUUID();
          newPlans.push({ id, orderId, sectionId: p.sec.id, stageKey: p.sec.key, plannedStart: p.start, plannedEnd: p.end, graceMinutes: p.grace, notes: p.notes, source, createdBy: actorId, updatedBy: actorId });
          events.push({ planId: id, orderId, sectionId: p.sec.id, stageKey: p.sec.key, kind: "assigned", at: now, actorId, data: { plannedStart: p.start.toISOString(), plannedEnd: p.end.toISOString(), graceMinutes: p.grace, notes: p.notes, source } });
          continue;
        }
        const changed = ex.plannedStart.getTime() !== p.start.getTime() || ex.plannedEnd.getTime() !== p.end.getTime() || ex.graceMinutes !== p.grace || (ex.notes ?? null) !== p.notes;
        if (!changed) continue;
        const after = { ...ex, plannedStart: p.start, plannedEnd: p.end, graceMinutes: p.grace, notes: p.notes };
        await tx.tnaPlan.update({ where: { id: ex.id }, data: { plannedStart: p.start, plannedEnd: p.end, graceMinutes: p.grace, notes: p.notes, updatedBy: actorId } });
        events.push({
          planId: ex.id,
          orderId,
          sectionId: p.sec.id,
          stageKey: p.sec.key,
          kind: "rescheduled",
          at: now,
          actorId,
          data: { previous: snap(ex), current: snap(after), statusBefore: statusOf(ex), statusAfter: statusOf(after) },
        });
      }
      if (newPlans.length) await tx.tnaPlan.createMany({ data: newPlans });
      if (events.length) await tx.tnaEvent.createMany({ data: events });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export interface TnaAlertCounts {
  critical: number;
  grace: number;
  dueSoon: number;
  lateStart: number;
  /** critical + grace: what the sidebar badge shows. */
  attention: number;
}

/** How many open stages are overdue / in grace / due soon right now (for the badge). */
export async function tnaAlertCounts(): Promise<TnaAlertCounts> {
  const records = await listTnaRecords({ withOrder: true });
  const now = Date.now();
  const c: TnaAlertCounts = { critical: 0, grace: 0, dueSoon: 0, lateStart: 0, attention: 0 };
  for (const r of records) {
    if (r.order?.isHidden) continue;
    const t = computeTna(timesOf(r), now);
    if (t.status === "critical") c.critical++;
    else if (t.status === "grace") c.grace++;
    if (t.dueSoon) c.dueSoon++;
    if (t.lateStart) c.lateStart++;
  }
  c.attention = c.critical + c.grace;
  return c;
}
