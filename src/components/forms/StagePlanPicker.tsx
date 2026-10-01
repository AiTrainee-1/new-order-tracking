"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox, Select } from "@/components/ui/FormControls";
import { canonicalRank, insertStageCanonically, validateStagePlan, type StagePlanCatalogEntry } from "@/lib/stagePlan";

export interface StagePlanTemplateWithItems {
  id: string;
  name: string;
  description: string | null;
  items: { seq: number; stageDefinitionId: string }[];
}

export interface StagePlanValue {
  selectedIds: string[]; // ordered - this IS the seq order
  sizeOriginStageDefinitionId: string | null;
  lotOriginStageDefinitionId: string | null;
}

/** Stages every order carries whether or not anyone ticks them. Order
 *  Confirmation is additionally pinned at index 0 (see `fixed` below);
 *  Accessories has no required position - it can be dragged anywhere - it
 *  just can never be removed. Matched by `key`, not a catalog flag: this is
 *  the one, currently-fixed exception to "everything is optional", not a
 *  general "any stage can be mandatory" feature, so it isn't worth a schema
 *  column yet. */
function isMandatory(stage: Pick<StagePlanCatalogEntry, "isOrderOrigin" | "key">): boolean {
  return stage.isOrderOrigin || stage.key === "accessories";
}

/** Appends whichever mandatory stages are missing - the origin stage first,
 *  Accessories wherever it canonically belongs - without disturbing
 *  anything the caller already picked. Every mutation in this component
 *  (toggling a stage, applying a template, dragging) flows through
 *  `setSelected`, which calls this, so Accessories can never end up
 *  dropped - whether by an old template, a stale edit, or a quirk of
 *  whatever the caller passed in. */
function ensureMandatory(selectedIds: string[], catalog: StagePlanCatalogEntry[]): string[] {
  let next = selectedIds;
  const origin = catalog.find((c) => c.isOrderOrigin);
  if (origin && !next.includes(origin.id)) next = [origin.id, ...next];
  const accessories = catalog.find((c) => c.key === "accessories");
  if (accessories && !next.includes(accessories.id)) next = insertStageCanonically(next, accessories.id, catalog);
  return next;
}

/**
 * The centerpiece of the whole rewrite: lets whoever is creating an order
 * pick a SUBSET of the stage catalog and put it in a CUSTOM ORDER, instead
 * of every order walking the same fixed 19-stage sequence. See
 * src/lib/stagePlan.ts for the invariants this has to respect (Order
 * Confirmation always first, Accessories always present, at most one
 * KG→PCS switch, etc.) - this component is a thin UI over that shared
 * validator, which is also what the server re-checks authoritatively in
 * POST /api/orders.
 */
export function StagePlanPicker({
  catalog,
  templates,
  value,
  onChange,
}: {
  catalog: StagePlanCatalogEntry[];
  templates: StagePlanTemplateWithItems[];
  value: StagePlanValue;
  onChange: (value: StagePlanValue) => void;
}) {
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const origin = catalog.find((c) => c.isOrderOrigin) ?? null;

  // Mandatory stages have to exist before the user ever touches the form -
  // this is what pins them in for a brand-new, still-empty plan. Every
  // later mutation goes through setSelected below, which re-applies the
  // same rule, so this effect only ever has to do anything once.
  useEffect(() => {
    if (catalog.length === 0) return;
    const next = ensureMandatory(value.selectedIds, catalog);
    if (next !== value.selectedIds) onChange({ ...value, selectedIds: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.length]);

  const selectedSet = new Set(value.selectedIds);
  // Shown in the order stages normally run on the floor, not the API's
  // alphabetical order - so ticking top to bottom builds a sensible plan.
  const unselected = catalog.filter((c) => !isMandatory(c) && !selectedSet.has(c.id)).sort((a, b) => canonicalRank(a.key) - canonicalRank(b.key));

  const validation = validateStagePlan(
    {
      stages: value.selectedIds.map((id, i) => ({ stageDefinitionId: id, seq: i + 1 })),
      sizeOriginStageDefinitionId: value.sizeOriginStageDefinitionId,
      lotOriginStageDefinitionId: value.lotOriginStageDefinitionId,
    },
    catalog,
  );

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const ids = [...template.items].sort((a, b) => a.seq - b.seq).map((i) => i.stageDefinitionId);
    setSelected(ids.length ? ids : origin ? [origin.id] : []);
  }

  function setSelected(selectedIds: string[]) {
    const withMandatory = ensureMandatory(selectedIds, catalog);
    const stillEligibleSize = withMandatory.includes(value.sizeOriginStageDefinitionId ?? "");
    const stillEligibleLot = withMandatory.includes(value.lotOriginStageDefinitionId ?? "");
    onChange({
      selectedIds: withMandatory,
      sizeOriginStageDefinitionId: stillEligibleSize ? value.sizeOriginStageDefinitionId : autoPickOrigin(withMandatory, catalog, "size"),
      lotOriginStageDefinitionId: stillEligibleLot ? value.lotOriginStageDefinitionId : autoPickOrigin(withMandatory, catalog, "lot"),
    });
  }

  // Each stage is added or removed entirely on its own - nothing pulls any
  // other stage along with it. (Procurement stages used to be forced in or
  // out together; that "convenience" was the bug reported as stages being
  // "automatically grouped" and silently vanishing on their own.)
  function toggle(id: string, checked: boolean) {
    if (!checked) {
      setSelected(value.selectedIds.filter((s) => s !== id));
      return;
    }
    setSelected(insertStageCanonically(value.selectedIds, id, catalog));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = value.selectedIds;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    // Index 0 is always the pinned origin stage - the sortable list below
    // never includes it, so a valid drag can never produce `from`/`to` of 0
    // anyway; this is just a last-resort guard.
    if (from <= 0 || to <= 0) return;
    setSelected(arrayMove(ids, from, to));
  }

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const sizeEligible = value.selectedIds.map((id) => byId.get(id)).filter((c): c is StagePlanCatalogEntry => !!c?.canBeSizeOrigin);
  const lotEligible = value.selectedIds.map((id) => byId.get(id)).filter((c): c is StagePlanCatalogEntry => !!c?.canBeLotOrigin);

  // Index 0 (Order Confirmation) is rendered as a fixed row outside the
  // drag-and-drop list entirely - it can never move, so it never needs to
  // be a drop target.
  const draggableIds = value.selectedIds.slice(1);

  return (
    <div className="space-y-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink-800">Stage plan</p>
          <p className="text-[11px] text-ink-500">
            Pick which of the {catalog.length} stages this order goes through, and drag to set the order.
          </p>
        </div>
        {templates.length > 0 && (
          <Select className="!w-auto" defaultValue="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
            <option value="">Start from a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Selected, in order */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">This order&apos;s sequence</p>
          <ol className="space-y-1.5">
            {origin && value.selectedIds[0] === origin.id && <FixedStageRow stage={origin} index={0} />}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={draggableIds} strategy={verticalListSortingStrategy}>
                {draggableIds.map((id, i) => {
                  const stage = byId.get(id);
                  if (!stage) return null;
                  return <DraggableStageRow key={id} id={id} stage={stage} index={i + 1} removable={!isMandatory(stage)} onRemove={() => toggle(id, false)} />;
                })}
              </SortableContext>
            </DndContext>
          </ol>
        </div>

        {/* Available to add */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Available stages</p>
          <div className="space-y-1 rounded-lg border border-ink-100 bg-white p-2">
            {unselected.length === 0 && <p className="px-1 py-2 text-xs text-ink-400">Every stage is already in the plan.</p>}
            {unselected.map((stage) => (
              <div key={stage.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1">
                <Checkbox checked={false} onChange={(checked) => toggle(stage.id, checked)} label={stage.label} />
                <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">{stage.unitType}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {sizeEligible.length > 1 && (
        <Select
          label="Size-origin stage (where KG becomes PCS)"
          value={value.sizeOriginStageDefinitionId ?? ""}
          onChange={(e) => onChange({ ...value, sizeOriginStageDefinitionId: e.target.value || null })}
        >
          <option value="">None</option>
          {sizeEligible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      )}

      {lotEligible.length > 0 && (
        <Select
          label="Lot-origin stage (optional)"
          value={value.lotOriginStageDefinitionId ?? ""}
          onChange={(e) => onChange({ ...value, lotOriginStageDefinitionId: e.target.value || null })}
        >
          <option value="">No lot tracking for this order</option>
          {lotEligible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      )}

      {!validation.ok && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{validation.error}</p>}
    </div>
  );
}

function RowShell({ children, dragHandle }: { children: ReactNode; dragHandle?: ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm">
      {dragHandle}
      {children}
    </li>
  );
}

function StageBadge({ stage }: { stage: StagePlanCatalogEntry }) {
  return (
    <>
      <span className="flex-1 truncate font-medium text-ink-800">{stage.label}</span>
      <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">{stage.unitType}</span>
    </>
  );
}

/** Order Confirmation - always first, never draggable, never removable. */
function FixedStageRow({ stage, index }: { stage: StagePlanCatalogEntry; index: number }) {
  return (
    <RowShell dragHandle={<span className="w-5 shrink-0 text-center text-xs font-bold text-ink-300">⠿</span>}>
      <span className="w-5 shrink-0 text-center text-xs font-bold text-ink-400">{index + 1}</span>
      <StageBadge stage={stage} />
      <span className="shrink-0 text-[10px] font-semibold uppercase text-ink-400">Fixed</span>
    </RowShell>
  );
}

/** Every other stage in the plan - draggable by its handle (mouse or, with
 *  the handle focused, the arrow keys - dnd-kit's keyboard sensor). Only a
 *  removable stage (i.e. not Accessories) gets a remove button. */
function DraggableStageRow({
  id,
  stage,
  index,
  removable,
  onRemove,
}: {
  id: string;
  stage: StagePlanCatalogEntry;
  index: number;
  removable: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-sm ${isDragging ? "z-10 border-brand shadow-lg" : "border-ink-200"}`}
    >
      <button type="button" {...attributes} {...listeners} className="shrink-0 cursor-grab touch-none text-ink-400 hover:text-brand active:cursor-grabbing" aria-label={`Drag ${stage.label} to reorder`}>
        ⠿
      </button>
      <span className="w-5 shrink-0 text-center text-xs font-bold text-ink-400">{index + 1}</span>
      <StageBadge stage={stage} />
      {removable ? (
        <button type="button" onClick={onRemove} className="shrink-0 text-ink-400 hover:text-status-bad" aria-label={`Remove ${stage.label}`}>
          ×
        </button>
      ) : (
        <span className="shrink-0 text-[10px] font-semibold uppercase text-ink-400">Required</span>
      )}
    </li>
  );
}

/** When a stage plan changes shape, try to keep the size/lot-origin choice
 * sensible automatically: if there's now exactly one eligible candidate,
 * pick it; otherwise leave it for the user to choose explicitly. */
function autoPickOrigin(selectedIds: string[], catalog: StagePlanCatalogEntry[], kind: "size" | "lot"): string | null {
  const flag = kind === "size" ? "canBeSizeOrigin" : "canBeLotOrigin";
  const candidates = selectedIds.filter((id) => catalog.find((c) => c.id === id)?.[flag]);
  return candidates.length === 1 ? candidates[0] : null;
}
