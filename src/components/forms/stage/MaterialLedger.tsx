"use client";

import { useState } from "react";
import { useEntryUser } from "@/hooks/useEntryUser";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import {
  useDeleteMaterialEntry,
  useDeleteRequirement,
  useRecordAudit,
  useSaveMaterialEntry,
  useSaveRequirement,
  diffFields,
} from "@/hooks/useProductionChain";
import { buildRequirementFlow, type MaterialTotals, type RequirementFlow } from "@/lib/chain";
import { formatDisplayDate } from "@/lib/workflow";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/FormControls";
import { QtyBox } from "./chainShared";
import type { MaterialCategory, MaterialEntry, MaterialEntryType, MaterialRequirement } from "@/lib/types";

/**
 * Yarn and fabric, three responsibilities over ONE set of rows.
 *
 *   Raw Material Planning        Required Plan - what quantity is required?
 *   Purchase Order to Suppliers  Planned Quantity - how much yarn is planned
 *                                 against that requirement?
 *   Raw Material Inward          Received Quantity - how much actually arrived?
 *
 * Each screen owns exactly one number and shows the others read-only, which is
 * why Inward can display required → planned → received without the
 * storekeeper re-typing anything the planner or buyer already entered - and
 * why the three can never disagree. `entryTypes` tells this component which
 * single figure the current screen is responsible for; `[]` (Planning) means
 * the screen has nothing to record beyond the requirement itself.
 */

const ENTRY_LABEL: Record<MaterialEntryType, string> = {
  plan: "Planned (legacy)",
  dc: "Planned",
  receipt: "Received (legacy)",
  inward: "Received",
};

/** Which totals matter on each screen, in display order. `entryTypes` (what
 * this screen records) is enough to tell them apart - Planning records
 * nothing, Suppliers records "dc" (Planned Quantity), Inward records "inward"
 * (Received Quantity). */
function totalsColumns(entryTypes: MaterialEntryType[]): { key: keyof MaterialTotals; label: string; tone?: "good" }[] {
  if (entryTypes.length === 0) return [{ key: "required", label: "Required" }];
  if (entryTypes.includes("dc")) {
    return [
      { key: "required", label: "Required" },
      { key: "dc", label: "Planned", tone: "good" },
    ];
  }
  return [
    { key: "dc", label: "Planned" },
    { key: "inward", label: "Received", tone: "good" },
  ];
}

/** required→purchased for Suppliers, purchased→received for Inward. No
 * balance is shown on Planning - there's nothing yet to fall short of. */
function balanceFor(entryTypes: MaterialEntryType[], totals: MaterialTotals): number | null {
  if (entryTypes.length === 0) return null;
  if (entryTypes.includes("dc")) return Math.max(totals.required - totals.dc, 0);
  return Math.max(totals.dc - (totals.inward + totals.received), 0);
}

export interface MaterialLedgerProps {
  orderId: string;
  poId: string | null;
  sectionId: string;
  flows: RequirementFlow[];
  /** Which categories this stage shows. */
  categories: MaterialCategory[];
  /** Whether the yarn-count / fabric-type rows themselves can be added,
   * renamed and removed here. Only Raw Material Planning owns that. */
  canEditRequirements: boolean;
  /** Entry types this stage records. */
  entryTypes: MaterialEntryType[];
  onSaved: () => void;
}

const CATEGORY_TITLE: Record<MaterialCategory, string> = {
  yarn: "Yarn Counts",
  fabric: "Fabric",
};

const CATEGORY_HINT: Record<MaterialCategory, string> = {
  yarn: "Add the counts this order needs - 40s, 30s, 20s, 150s. They aren't a fixed list; add, rename or remove as the plan changes.",
  fabric: "Fabric types and the kilos required of each.",
};

/**
 * Yarn and fabric are two different materials with two different unit
 * vocabularies, and they were previously separated only by a plain heading -
 * so on a screen holding both, it was easy to add a yarn count under fabric.
 *
 * The accent is a RAIL and a chip rather than a frame, deliberately: these
 * blocks sit inside a DirectionPanel whose frame colour already means
 * something (blue = committing, green = received). Reusing those hues here
 * would make a green "Fabric" block inside a green "Received" panel read as
 * two different things at once. Indigo and teal are used nowhere else in the
 * workflow's colour language, so material type stays unambiguous.
 */
const CATEGORY_SKIN: Record<MaterialCategory, { rail: string; band: string; chip: string; text: string; initial: string }> = {
  yarn: { rail: "border-l-indigo-500", band: "bg-indigo-50/70", chip: "bg-indigo-600", text: "text-indigo-900", initial: "Y" },
  fabric: { rail: "border-l-teal-500", band: "bg-teal-50/70", chip: "bg-teal-600", text: "text-teal-900", initial: "F" },
};

export function MaterialLedger({ orderId, poId, sectionId, flows, categories, canEditRequirements, entryTypes, onSaved }: MaterialLedgerProps) {
  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <CategoryBlock
          key={category}
          category={category}
          orderId={orderId}
          poId={poId}
          sectionId={sectionId}
          flows={flows.filter((f) => f.requirement.category === category)}
          canEditRequirements={canEditRequirements}
          entryTypes={entryTypes}
          // Yarn is the bulk of the plan and stays open. Fabric is usually one
          // or two lines yet took the same vertical space, pushing everything
          // below it off the screen - so it starts collapsed behind Show.
          defaultOpen={category !== "fabric"}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}

function CategoryBlock({
  category,
  orderId,
  poId,
  sectionId,
  flows,
  canEditRequirements,
  entryTypes,
  defaultOpen,
  onSaved,
}: {
  category: MaterialCategory;
  orderId: string;
  poId: string | null;
  sectionId: string;
  flows: RequirementFlow[];
  canEditRequirements: boolean;
  entryTypes: MaterialEntryType[];
  defaultOpen: boolean;
  onSaved: () => void;
}) {
  const appUser = useEntryUser();
  const toast = useToast();
  const saveRequirement = useSaveRequirement();
  const recordAudit = useRecordAudit();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newReason, setNewReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  const totals = flows.reduce(
    (acc, f) => ({
      required: acc.required + f.totals.required,
      planned: acc.planned + f.totals.planned,
      dc: acc.dc + f.totals.dc,
      received: acc.received + f.totals.received,
      inward: acc.inward + f.totals.inward,
    }),
    { required: 0, planned: 0, dc: 0, received: 0, inward: 0 },
  );
  const columns = totalsColumns(entryTypes);
  const balance = balanceFor(entryTypes, totals);

  async function addRequirement() {
    const name = newName.trim();
    if (!name || !appUser) return;
    if (canEditRequirements && !newReason.trim()) {
      toast.show("Add a reason - it's kept in the audit trail.", "error");
      return;
    }
    try {
      await saveRequirement.mutateAsync({
        input: {
          orderId,
          poId,
          category,
          name,
          requiredQty: Number(newQty) || 0,
          unit: "KG",
          supplier: null,
          sortOrder: flows.length,
          isCompleted: false,
          notes: null,
        },
      });
      await recordAudit.mutateAsync({
        orderId,
        poId,
        sectionId,
        entity: "material_requirement",
        entityId: null,
        action: "create",
        summary: `${CATEGORY_TITLE[category]}: added ${name} - ${(Number(newQty) || 0).toLocaleString()} KG required`,
        changes: null,
        notes: newReason.trim() || null,
      });
      setNewName("");
      setNewQty("");
      setNewReason("");
      setAdding(false);
      onSaved();
      toast.show(`${name} added.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not add it.", "error");
    }
  }

  const skin = CATEGORY_SKIN[category];

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className={`flex items-start gap-2.5 border-l-4 px-3 py-2.5 ${skin.rail} ${skin.band}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm ${skin.chip}`} aria-hidden>
          {skin.initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${skin.text}`}>{CATEGORY_TITLE[category]}</p>
          {/* Collapsed, the hint is wasted space - what's useful is the figure
              the section is hiding, so the block still says something shut. */}
          {open ? (
            <p className="text-[11px] leading-snug text-ink-600">{CATEGORY_HINT[category]}</p>
          ) : (
            <p className="text-[11px] leading-snug text-ink-600">
              {flows.length === 0
                ? `No ${category === "yarn" ? "yarn counts" : "fabric types"} added`
                : `${flows.length} ${flows.length === 1 ? "type" : "types"} · ${totals.required.toLocaleString()} KG required`}
            </p>
          )}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>

      {open && (
        <div className="space-y-3 p-3">
          <div className={`grid grid-cols-2 gap-2 ${balance === null ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            {columns.map((col) => (
              <QtyBox key={col.key} label={col.label} value={totals[col.key]} unit="KG" tone={col.tone} />
            ))}
            {balance !== null && <QtyBox label="Balance" value={balance} unit="KG" tone={balance > 0 ? "warn" : "good"} />}
          </div>

          <div className="mt-3 space-y-2">
            {flows.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-5 text-center text-sm text-ink-400">
                No {category === "yarn" ? "yarn counts" : "fabric types"} added yet.
              </p>
            )}

            {flows.map((flow) => (
              <RequirementRow
                key={flow.requirement.id}
                flow={flow}
                orderId={orderId}
                poId={poId}
                sectionId={sectionId}
                canEditRequirements={canEditRequirements}
                entryTypes={entryTypes}
                expanded={expandedId === flow.requirement.id}
                onToggle={() => setExpandedId((prev) => (prev === flow.requirement.id ? null : flow.requirement.id))}
                onSaved={onSaved}
              />
            ))}
          </div>

          {canEditRequirements &&
            (adding ? (
              <div className="mt-2 space-y-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    label="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={category === "yarn" ? "e.g. 40s" : "e.g. Single Jersey"}
                    autoFocus
                  />
                  <Input
                    label="Required Quantity (KG)"
                    type="number"
                    min={0}
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Input
                  label="Reason for the Change (Required)"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="e.g. Additional requirement raised by production"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={addRequirement} isLoading={saveRequirement.isPending}>
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAdding(false);
                      setNewReason("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} className="mt-2">
                + Add {category === "yarn" ? "Yarn Count" : "Fabric"}
              </Button>
            ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function RequirementRow({
  flow,
  orderId,
  poId,
  sectionId,
  canEditRequirements,
  entryTypes,
  expanded,
  onToggle,
  onSaved,
}: {
  flow: RequirementFlow;
  orderId: string;
  poId: string | null;
  sectionId: string;
  canEditRequirements: boolean;
  entryTypes: MaterialEntryType[];
  expanded: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const { requirement: req, totals } = flow;
  const columns = totalsColumns(entryTypes);
  const balance = balanceFor(entryTypes, totals);
  const canExpand = entryTypes.length > 0;
  const appUser = useEntryUser();
  const toast = useToast();
  const confirm = useConfirm();
  const saveRequirement = useSaveRequirement();
  const deleteRequirement = useDeleteRequirement();
  const recordAudit = useRecordAudit();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(req.name);
  const [required, setRequired] = useState(String(req.requiredQty));
  const [reason, setReason] = useState("");

  async function toggleCompleted(next: boolean) {
    if (!appUser) return;
    await saveRequirement.mutateAsync({ id: req.id, input: { orderId, isCompleted: next } });
    await recordAudit.mutateAsync({
      orderId,
      poId,
      sectionId,
      entity: "material_requirement",
      entityId: req.id,
      action: "update",
      summary: `${req.name} marked ${next ? "completed" : "not completed"}`,
      changes: { isCompleted: { from: req.isCompleted, to: next } },
      notes: null,
    });
    onSaved();
  }

  async function saveEdit() {
    if (!appUser) return;
    const patch = { name: name.trim(), requiredQty: Number(required) || 0 };
    const changes = diffFields(req as unknown as Record<string, unknown>, patch);
    if (!changes) {
      setEditing(false);
      return;
    }
    if (!reason.trim()) {
      toast.show("Add a reason - it's kept in the audit trail.", "error");
      return;
    }
    try {
      await saveRequirement.mutateAsync({ id: req.id, input: { orderId, ...patch } });
      await recordAudit.mutateAsync({
        orderId,
        poId,
        sectionId,
        entity: "material_requirement",
        entityId: req.id,
        action: "update",
        summary: `${req.name} updated`,
        changes,
        notes: reason.trim(),
      });
      setEditing(false);
      setReason("");
      onSaved();
      toast.show("Updated.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not update.", "error");
    }
  }

  async function remove() {
    if (!appUser) return;
    const ok = await confirm({
      title: `Remove ${req.name}?`,
      message: `This deletes the requirement and its ${flow.entries.length} entr${flow.entries.length === 1 ? "y" : "ies"}. It can't be undone.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    await deleteRequirement.mutateAsync({ id: req.id, orderId });
    await recordAudit.mutateAsync({
      orderId,
      poId,
      sectionId,
      entity: "material_requirement",
      entityId: req.id,
      action: "delete",
      summary: `${req.name} removed`,
      changes: null,
      notes: null,
    });
    onSaved();
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        {canExpand ? (
          <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className={`text-ink-400 transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
            <span className="truncate text-sm font-bold text-ink-900">{req.name}</span>
            {req.isCompleted && <Badge tone="good">Completed</Badge>}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-bold text-ink-900">{req.name}</span>
            {req.isCompleted && <Badge tone="good">Completed</Badge>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {columns.map((col) => (
            <Figure key={col.key} label={col.label} value={totals[col.key]} tone={col.tone} />
          ))}
          {balance !== null && <Figure label="Balance" value={balance} tone={balance > 0 ? "warn" : "good"} />}
        </div>

        {canEditRequirements && (
          <div className="flex items-center gap-1.5">
            <Checkbox checked={req.isCompleted} onChange={toggleCompleted} label="" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              Edit
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-status-bad hover:bg-red-50" onClick={remove}>
              Remove
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="space-y-2 border-t border-ink-100 bg-amber-50/50 px-3 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Required Quantity (KG)" type="number" min={0} value={required} onChange={(e) => setRequired(e.target.value)} />
          </div>
          <Input
            label="Reason for the Change (Required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Additional requirement raised by production"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveEdit} isLoading={saveRequirement.isPending}>
              Update
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {canExpand && expanded && (
        <div className="border-t border-ink-100 px-3 py-3">
          <EntryLedger
            requirementId={req.id}
            requirementName={req.name}
            flow={flow}
            entryTypes={entryTypes}
            orderId={orderId}
            poId={poId}
            sectionId={sectionId}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-status-good" : tone === "warn" ? "text-amber-600" : "text-ink-700";
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-400">{label} </span>
      <span className={`font-bold tabular-nums ${color}`}>{value.toLocaleString()}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The per-requirement entry ledger
// ---------------------------------------------------------------------------

/**
 * How much of the upstream figure this entry type is still allowed to consume.
 *
 * Procurement is a chain of three figures - required → planned → received -
 * and each step is capped by the one before it: you cannot order more than the
 * plan calls for, and the store cannot take in more than the supplier was ever
 * asked for. Without this, a second receipt of the same delivery silently
 * doubled the received total and nothing on any screen contradicted it.
 *
 * `null` means there is nothing upstream to measure against yet (no plan, no
 * purchase), in which case blocking the entry would be obstruction rather than
 * validation - the figure is simply recorded.
 */
interface EntryCeiling {
  /** The upstream figure this type is capped by. */
  limit: number;
  /** Already recorded of this type, excluding the row being edited. */
  used: number;
  remaining: number;
  /** What the cap is, in the words of the screen the operator came from. */
  limitLabel: string;
}

function ceilingFor(entryType: MaterialEntryType, flow: RequirementFlow, editingId: string | null): EntryCeiling | null {
  const editingQty = editingId ? flow.entries.find((e) => e.id === editingId && e.entryType === entryType)?.qty ?? 0 : 0;

  if (entryType === "dc") {
    const limit = flow.totals.required;
    if (limit <= 0) return null;
    const used = Math.max(flow.totals.dc - editingQty, 0);
    return { limit, used, remaining: Math.max(limit - used, 0), limitLabel: "required quantity" };
  }

  if (entryType === "inward" || entryType === "receipt") {
    const limit = flow.plannedQty;
    if (limit <= 0) return null;
    const used = Math.max(flow.receivedQty - editingQty, 0);
    return { limit, used, remaining: Math.max(limit - used, 0), limitLabel: "planned quantity" };
  }

  return null;
}

/** Keeps the override in the record itself, not just the audit summary, so
 * whoever reads the entry later sees why it went past the ceiling. Mirrors
 * chainShared's overrideNote for the post-Knitting stages. */
function overrideNote(notes: string, overridden: boolean): string | null {
  const base = notes.trim();
  if (!overridden) return base || null;
  return `${base}${base ? " · " : ""}[Over the upstream quantity - recorded as an extra / recovered source]`;
}

function EntryLedger({
  requirementId,
  requirementName,
  flow,
  entryTypes,
  orderId,
  poId,
  sectionId,
  onSaved,
}: {
  requirementId: string;
  requirementName: string;
  flow: RequirementFlow;
  entryTypes: MaterialEntryType[];
  orderId: string;
  poId: string | null;
  sectionId: string;
  onSaved: () => void;
}) {
  const entries = flow.entries;
  const appUser = useEntryUser();
  const toast = useToast();
  const confirm = useConfirm();
  const saveEntry = useSaveMaterialEntry();
  const deleteEntry = useDeleteMaterialEntry();
  const recordAudit = useRecordAudit();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => blankEntryForm(entryTypes[0]));
  /** Deliberate override of the upstream ceiling - material that genuinely
   * came from outside the plan or the purchase order. */
  const [allowOverLimit, setAllowOverLimit] = useState(false);

  const ceiling = ceilingFor(form.entryType, flow, editingId);

  function reset() {
    setForm(blankEntryForm(entryTypes[0]));
    setAdding(false);
    setEditingId(null);
    setAllowOverLimit(false);
  }

  async function submit() {
    if (!appUser) return;
    const qty = Number(form.qty) || 0;
    if (qty <= 0) {
      toast.show("Enter a quantity.", "error");
      return;
    }
    if (!form.notes.trim()) {
      toast.show("Add a note before saving.", "error");
      return;
    }
    if (ceiling && !allowOverLimit && qty > ceiling.remaining) {
      toast.show(
        ceiling.remaining === 0
          ? `${requirementName}: the whole ${ceiling.limit.toLocaleString()} KG ${ceiling.limitLabel} is already accounted for - there is no balance left to record against.`
          : `${requirementName}: only ${ceiling.remaining.toLocaleString()} KG of the ${ceiling.limit.toLocaleString()} KG ${ceiling.limitLabel} is still outstanding - you entered ${qty.toLocaleString()} KG.`,
        "error",
      );
      return;
    }

    const notes = overrideNote(form.notes, allowOverLimit && !!ceiling && qty > ceiling.remaining);

    const input = {
      requirementId,
      entryType: form.entryType,
      qty,
      entryDate: form.entryDate,
      supplier: form.supplier.trim() || null,
      docNo: form.docNo.trim() || null,
      docDate: form.docDate || null,
      lotRef: form.lotRef.trim() || null,
      notes,
    };

    try {
      if (editingId) {
        const original = entries.find((e) => e.id === editingId);
        const changes = original ? diffFields(original as unknown as Record<string, unknown>, input) : null;
        await saveEntry.mutateAsync({ id: editingId, input, orderId });
        await recordAudit.mutateAsync({
          orderId,
          poId,
          sectionId,
          entity: "material_entry",
          entityId: editingId,
          action: "update",
          summary: `${requirementName}: ${ENTRY_LABEL[form.entryType]} entry corrected`,
          changes,
          notes,
        });
      } else {
        await saveEntry.mutateAsync({ input, orderId });
        await recordAudit.mutateAsync({
          orderId,
          poId,
          sectionId,
          entity: "material_entry",
          entityId: null,
          action: "create",
          summary: `${requirementName}: ${ENTRY_LABEL[form.entryType]} ${qty.toLocaleString()} KG${
            allowOverLimit && ceiling && qty > ceiling.remaining ? " (over the upstream quantity - override)" : ""
          }`,
          changes: null,
          notes,
        });
      }
      reset();
      onSaved();
      toast.show("Updated.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save.", "error");
    }
  }

  async function remove(entry: MaterialEntry) {
    if (!appUser) return;
    const ok = await confirm({
      title: "Delete this entry?",
      message: `${ENTRY_LABEL[entry.entryType]} of ${entry.qty.toLocaleString()} KG on ${formatDisplayDate(entry.entryDate)}. The cumulative totals will change.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    await deleteEntry.mutateAsync({ id: entry.id, orderId });
    await recordAudit.mutateAsync({
      orderId,
      poId,
      sectionId,
      entity: "material_entry",
      entityId: entry.id,
      action: "delete",
      summary: `${requirementName}: ${ENTRY_LABEL[entry.entryType]} entry of ${entry.qty.toLocaleString()} KG deleted`,
      changes: null,
      notes: null,
    });
    onSaved();
  }

  function beginEdit(entry: MaterialEntry) {
    setEditingId(entry.id);
    setAdding(true);
    setAllowOverLimit(false);
    setForm({
      entryType: entry.entryType,
      qty: String(entry.qty),
      entryDate: entry.entryDate,
      supplier: entry.supplier ?? "",
      docNo: entry.docNo ?? "",
      docDate: entry.docDate ?? "",
      lotRef: entry.lotRef ?? "",
      notes: entry.notes ?? "",
    });
  }

  // Running cumulative is computed per entry type so a DC entry doesn't inflate
  // the received total.
  const runningByType = new Map<MaterialEntryType, number>();

  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="text-xs text-ink-400">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-100">
          <table className="w-full min-w-[620px] text-xs">
            <thead>
              <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
                <th className="px-2.5 py-2 text-left font-semibold">Date</th>
                <th className="px-2.5 py-2 text-left font-semibold">Type</th>
                <th className="px-2.5 py-2 text-left font-semibold">Supplier / DC</th>
                <th className="px-2.5 py-2 text-right font-semibold">Qty</th>
                <th className="px-2.5 py-2 text-right font-semibold">Cumulative</th>
                <th className="px-2.5 py-2 text-left font-semibold">Notes</th>
                <th className="px-2.5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {entries.map((e) => {
                const running = (runningByType.get(e.entryType) ?? 0) + e.qty;
                runningByType.set(e.entryType, running);
                const editable = entryTypes.includes(e.entryType);
                return (
                  <tr key={e.id} className="bg-white">
                    <td className="whitespace-nowrap px-2.5 py-2 text-ink-500">{formatDisplayDate(e.entryDate)}</td>
                    <td className="px-2.5 py-2">
                      <Badge tone={e.entryType === "receipt" || e.entryType === "inward" ? "good" : "neutral"}>{ENTRY_LABEL[e.entryType]}</Badge>
                    </td>
                    <td className="px-2.5 py-2 text-ink-600">{[e.supplier, e.docNo].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{e.qty.toLocaleString()}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-ink-500">{running.toLocaleString()}</td>
                    <td className="max-w-[16rem] truncate px-2.5 py-2 text-ink-500">{e.notes ?? "-"}</td>
                    <td className="px-2.5 py-2 text-right">
                      {editable && (
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => beginEdit(e)}>
                            Edit
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="text-status-bad hover:bg-red-50" onClick={() => remove(e)}>
                            ✕
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-ink-100 bg-ink-50/60 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {entryTypes.length > 1 && (
              <Select label="Entry type" value={form.entryType} onChange={(e) => setForm({ ...form, entryType: e.target.value as MaterialEntryType })}>
                {entryTypes.map((t) => (
                  <option key={t} value={t}>
                    {ENTRY_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
            <div>
              <Input
                label={`${ENTRY_LABEL[form.entryType]} Quantity (KG)`}
                type="number"
                min={0}
                max={ceiling && !allowOverLimit ? ceiling.remaining : undefined}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                autoFocus
              />
              {/* The ceiling, stated before it is hit rather than only as an
                  error afterwards - the operator can see the outstanding
                  figure while typing. */}
              {ceiling && (
                <p className={`mt-1 text-[11px] ${ceiling.remaining > 0 ? "text-ink-500" : "text-amber-700"}`}>
                  {ceiling.remaining > 0 ? (
                    <>
                      <b className="tabular-nums">{ceiling.remaining.toLocaleString()} KG</b> of the {ceiling.limit.toLocaleString()} KG{" "}
                      {ceiling.limitLabel} still outstanding
                      {ceiling.used > 0 && <> · {ceiling.used.toLocaleString()} KG already recorded</>}
                    </>
                  ) : (
                    <>The full {ceiling.limit.toLocaleString()} KG {ceiling.limitLabel} is already accounted for - nothing outstanding</>
                  )}
                </p>
              )}
            </div>
            <Input label="Date" type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
            <Input label="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            {(form.entryType === "dc" || form.entryType === "receipt") && (
              <>
                <Input label="DC No" value={form.docNo} onChange={(e) => setForm({ ...form, docNo: e.target.value })} />
                <Input label="DC Date" type="date" value={form.docDate} onChange={(e) => setForm({ ...form, docDate: e.target.value })} />
              </>
            )}
            <Input label="Lot / Ref" value={form.lotRef} onChange={(e) => setForm({ ...form, lotRef: e.target.value })} />
          </div>
          <Textarea
            label="Notes"
            required
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="e.g. Additional yarn received against short supply on DC 1180"
          />

          {/* The escape hatch for material that genuinely came from outside the
              plan or the purchase order. Off by default, and what it records is
              written into the entry's own notes. */}
          {ceiling && (
            <label className="flex items-start gap-2 text-[11px] text-ink-600">
              <input
                type="checkbox"
                checked={allowOverLimit}
                onChange={(e) => setAllowOverLimit(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-amber-600"
              />
              <span>
                <b>Extra / recovered source.</b> Tick only if this quantity genuinely comes from outside the {ceiling.limitLabel} - it lifts
                the limit and is recorded on the entry.
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={submit} isLoading={saveEntry.isPending}>
              Update
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
          + Record {ENTRY_LABEL[entryTypes[0]]}
        </Button>
      )}
    </div>
  );
}

function blankEntryForm(entryType: MaterialEntryType) {
  return {
    entryType,
    qty: "",
    entryDate: new Date().toISOString().slice(0, 10),
    supplier: "",
    docNo: "",
    docDate: "",
    lotRef: "",
    notes: "",
  };
}

/** Re-export so stage forms can rebuild a flow from a requirement + entries
 * without importing from two places. */
export { buildRequirementFlow };
export type { MaterialRequirement };
