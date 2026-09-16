"use client";

import { useEffect, useMemo } from "react";
import { Checkbox, Select } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { validateStagePlan, type StagePlanCatalogEntry } from "@/lib/stagePlan";

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

/**
 * The centerpiece of the whole rewrite: lets whoever is creating an order
 * pick a SUBSET of the stage catalog and put it in a CUSTOM ORDER, instead
 * of every order walking the same fixed 19-stage sequence. See
 * src/lib/stagePlan.ts for the invariants this has to respect (Order
 * Confirmation always first, at most one KG→PCS switch, procurement stages
 * either all-in or all-out and in rank order, etc.) - this component is a
 * thin UI over that shared validator, which is also what the server
 * re-checks authoritatively in POST /api/orders.
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

  // Order Confirmation is mandatory and always first - keep it pinned into
  // `selectedIds` rather than making the user toggle it.
  useEffect(() => {
    if (origin && !value.selectedIds.includes(origin.id)) {
      onChange({ ...value, selectedIds: [origin.id, ...value.selectedIds] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.id]);

  const selectedSet = new Set(value.selectedIds);
  const unselected = catalog.filter((c) => !c.isOrderOrigin && !selectedSet.has(c.id));

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
    const stillEligibleSize = selectedIds.includes(value.sizeOriginStageDefinitionId ?? "");
    const stillEligibleLot = selectedIds.includes(value.lotOriginStageDefinitionId ?? "");
    onChange({
      selectedIds,
      sizeOriginStageDefinitionId: stillEligibleSize ? value.sizeOriginStageDefinitionId : autoPickOrigin(selectedIds, catalog, "size"),
      lotOriginStageDefinitionId: stillEligibleLot ? value.lotOriginStageDefinitionId : autoPickOrigin(selectedIds, catalog, "lot"),
    });
  }

  function toggle(id: string, checked: boolean) {
    setSelected(checked ? [...value.selectedIds, id] : value.selectedIds.filter((s) => s !== id));
  }

  function move(id: string, direction: -1 | 1) {
    const index = value.selectedIds.indexOf(id);
    const target = index + direction;
    // Index 0 is always the pinned origin stage - never move into or past it.
    if (target < 1 || target >= value.selectedIds.length) return;
    const next = [...value.selectedIds];
    [next[index], next[target]] = [next[target], next[index]];
    setSelected(next);
  }

  const sizeEligible = value.selectedIds.map((id) => byId.get(id)).filter((c): c is StagePlanCatalogEntry => !!c?.canBeSizeOrigin);
  const lotEligible = value.selectedIds.map((id) => byId.get(id)).filter((c): c is StagePlanCatalogEntry => !!c?.canBeLotOrigin);
  const hasNonOriginPcs = value.selectedIds.some((id) => id !== origin?.id && byId.get(id)?.unitType === "PCS");

  return (
    <div className="space-y-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink-800">Stage plan</p>
          <p className="text-[11px] text-ink-500">
            Pick which of the {catalog.length} stages this order goes through, and in what order.
          </p>
        </div>
        {templates.length > 0 && (
          <Select
            className="!w-auto"
            defaultValue=""
            onChange={(e) => e.target.value && applyTemplate(e.target.value)}
          >
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
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            This order's sequence
          </p>
          <ol className="space-y-1.5">
            {value.selectedIds.map((id, index) => {
              const stage = byId.get(id);
              if (!stage) return null;
              const pinned = stage.isOrderOrigin;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-ink-400">{index + 1}</span>
                  <span className="flex-1 truncate font-medium text-ink-800">{stage.label}</span>
                  <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                    {stage.unitType}
                  </span>
                  {!pinned && (
                    <>
                      <button
                        type="button"
                        disabled={index <= 1}
                        onClick={() => move(id, -1)}
                        className="text-ink-400 hover:text-brand disabled:opacity-30"
                        aria-label={`Move ${stage.label} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index >= value.selectedIds.length - 1}
                        onClick={() => move(id, 1)}
                        className="text-ink-400 hover:text-brand disabled:opacity-30"
                        aria-label={`Move ${stage.label} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(id, false)}
                        className="text-ink-400 hover:text-status-bad"
                        aria-label={`Remove ${stage.label}`}
                      >
                        ×
                      </button>
                    </>
                  )}
                  {pinned && <span className="text-[10px] font-semibold uppercase text-ink-400">Fixed</span>}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Available to add */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Available stages
          </p>
          <div className="space-y-1 rounded-lg border border-ink-100 bg-white p-2">
            {unselected.length === 0 && (
              <p className="px-1 py-2 text-xs text-ink-400">Every stage is already in the plan.</p>
            )}
            {unselected.map((stage) => (
              <div key={stage.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1">
                <Checkbox checked={false} onChange={(checked) => toggle(stage.id, checked)} label={stage.label} />
                <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                  {stage.unitType}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hasNonOriginPcs && (
        <Select
          label="Size-origin stage (where KG becomes PCS)"
          value={value.sizeOriginStageDefinitionId ?? ""}
          onChange={(e) => onChange({ ...value, sizeOriginStageDefinitionId: e.target.value || null })}
        >
          <option value="">Select…</option>
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

      {!validation.ok && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {validation.error}
        </p>
      )}
    </div>
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
