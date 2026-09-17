"use client";

import { useState } from "react";
import { useEntryUser } from "@/hooks/useEntryUser";
import { useToast } from "@/context/ToastContext";
import { useStageChain, useSaveAccessoryRequirement, useSaveAccessoryEntry } from "@/hooks/useProductionChain";
import { useStageEntryBuilder } from "@/hooks/useStageEntryBuilder";
import { buildAccessoryFlows, type AccessoryFlow } from "@/lib/accessories";
import { formatDisplayDate } from "@/lib/workflow";
import { Loader } from "@/components/ui/Loader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/FormControls";
import { StageActions } from "./shared";
import type { StageFormProps } from "./types";
import type { AccessoryEntryType, UnitType } from "@/lib/types";

/**
 * Accessories - a self-contained 4-stage tracker (Required → Purchase →
 * Inward → Dispatch) for buttons, zippers, labels, and every other trim that
 * isn't part of the fabric chain (see MaterialPlanningForm's own note on why
 * accessories were removed from Raw Material Planning).
 *
 * Deliberately kept independent from src/lib/chain.ts / MaterialLedger.tsx -
 * own model, own flow builder (src/lib/accessories.ts), own POST-only API
 * surface. Every entry here is a PERMANENT record: there is no edit or
 * delete control anywhere in this form, matching the "no update/delete"
 * precedent AuditLog already sets (see prisma/schema.prisma's module
 * comment above AccessoryRequirement/AccessoryEntry).
 *
 * The stage itself is a thin pass-through (isPassthrough, no real chain
 * quantity math - see prisma/seed.ts) - Move Forward/Complete below only
 * exists to keep downstream-stage gating consistent, the same way
 * SimpleConfirmForm's does for Pattern Making.
 */
export function AccessoriesForm(props: StageFormProps) {
  const { order, assignment, onForwarded, showDetails } = props;
  const { cs, accessoryRequirements, accessoryEntries, isLoading, isError } = useStageChain(
    order.id,
    assignment.poId,
    assignment.sectionId,
  );
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);

  if (isLoading) return <Loader label="Loading the accessories tracker…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn&apos;t load the accessories tracker.</p>;

  const flows = buildAccessoryFlows(accessoryRequirements, accessoryEntries);

  async function forward(isFinal: boolean) {
    await submitMovement({
      base: { qtyReceived: cs!.input, qtyForwarded: cs!.input, notes: null },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  async function savePlan() {
    await submitMovement({
      base: { qtyReceived: cs!.input, qtyForwarded: 0, notes: "Accessories tracker saved - nothing forwarded." },
      action: "plan",
    });
    onForwarded();
  }

  return (
    <div className="space-y-6">
      {showDetails && (
        <p className="text-xs leading-relaxed text-ink-500">
          Track every accessory - buttons, zippers, labels, and the rest - from what&apos;s required through
          purchase, inward and dispatch. Add a name and quantity below in <b>Required</b> and it carries
          forward automatically into Purchase, Inward and Dispatch. Every entry is permanent - there is no
          edit or delete anywhere on this screen.
        </p>
      )}

      {flows.length > 0 && <AccessorySummary flows={flows} />}

      <RequiredSection orderId={order.id} poId={assignment.poId} flows={flows} onSaved={onForwarded} />
      <EntrySection entryType="purchase" orderId={order.id} flows={flows} onSaved={onForwarded} />
      <EntrySection entryType="inward" orderId={order.id} flows={flows} onSaved={onForwarded} />
      <EntrySection entryType="dispatch" orderId={order.id} flows={flows} onSaved={onForwarded} />

      <StageActions
        sectionLabel={assignment.section?.label ?? "Accessories"}
        unitType="PCS"
        balance={0}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
      {flows.length === 0 && (
        <p className="text-center text-[11px] text-amber-700">No accessories added yet - add one under Required to start tracking.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top summary - Required / Purchased / Inward / Dispatched / Balance
// ---------------------------------------------------------------------------

function statusFor(flow: AccessoryFlow): { label: string; tone: "neutral" | "warn" | "good" } {
  const { totals } = flow;
  if (flow.isComplete) return { label: "Complete", tone: "good" };
  if (totals.purchased === 0 && totals.inward === 0 && totals.dispatched === 0) return { label: "Pending", tone: "neutral" };
  return { label: "Partial", tone: "warn" };
}

function AccessorySummary({ flows }: { flows: AccessoryFlow[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="border-l-4 border-l-amber-500 bg-amber-50/70 px-3 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-900">Accessories Summary</p>
        <p className="text-[11px] leading-snug text-ink-600">Required, purchased, inward and dispatched quantities, and what&apos;s still pending at each stage.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-xs">
          <thead>
            <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
              <th className="px-2.5 py-2 text-left font-semibold">Accessory</th>
              <th className="px-2.5 py-2 text-left font-semibold">Unit</th>
              <th className="px-2.5 py-2 text-right font-semibold">Required</th>
              <th className="px-2.5 py-2 text-right font-semibold">Purchased</th>
              <th className="px-2.5 py-2 text-right font-semibold">Bal. to Purchase</th>
              <th className="px-2.5 py-2 text-right font-semibold">Inward</th>
              <th className="px-2.5 py-2 text-right font-semibold">Bal. to Inward</th>
              <th className="px-2.5 py-2 text-right font-semibold">Dispatched</th>
              <th className="px-2.5 py-2 text-right font-semibold">Bal. to Dispatch</th>
              <th className="px-2.5 py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {flows.map((f) => {
              const status = statusFor(f);
              return (
                <tr key={f.requirement.id} className="bg-white">
                  <td className="px-2.5 py-2 font-semibold text-ink-900">{f.requirement.name}</td>
                  <td className="px-2.5 py-2 text-ink-500">{f.requirement.unit}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{f.totals.required.toLocaleString()}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{f.totals.purchased.toLocaleString()}</td>
                  <td className={`px-2.5 py-2 text-right tabular-nums ${f.balanceToPurchase > 0 ? "text-amber-600 font-semibold" : "text-status-good"}`}>
                    {f.balanceToPurchase.toLocaleString()}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{f.totals.inward.toLocaleString()}</td>
                  <td className={`px-2.5 py-2 text-right tabular-nums ${f.balanceToInward > 0 ? "text-amber-600 font-semibold" : "text-status-good"}`}>
                    {f.balanceToInward.toLocaleString()}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{f.totals.dispatched.toLocaleString()}</td>
                  <td className={`px-2.5 py-2 text-right tabular-nums ${f.balanceToDispatch > 0 ? "text-amber-600 font-semibold" : "text-status-good"}`}>
                    {f.balanceToDispatch.toLocaleString()}
                  </td>
                  <td className="px-2.5 py-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Required - the only section that creates new accessories
// ---------------------------------------------------------------------------

function RequiredSection({
  orderId,
  poId,
  flows,
  onSaved,
}: {
  orderId: string;
  poId: string | null;
  flows: AccessoryFlow[];
  onSaved: () => void;
}) {
  const appUser = useEntryUser();
  const toast = useToast();
  const saveRequirement = useSaveAccessoryRequirement();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<UnitType>("PCS");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function addRequirement() {
    const trimmed = name.trim();
    if (!trimmed || !appUser) {
      toast.show("Enter an accessory name.", "error");
      return;
    }
    try {
      await saveRequirement.mutateAsync({
        orderId,
        poId,
        name: trimmed,
        requiredQty: Number(qty) || 0,
        unit,
        requiredDate: date || null,
        sortOrder: flows.length,
        notes: null,
        createdBy: null,
      });
      setName("");
      setQty("");
      onSaved();
      toast.show(`${trimmed} added to Required.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not add it.", "error");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="flex items-start gap-2.5 border-l-4 border-l-sky-500 bg-sky-50/70 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white shadow-sm" aria-hidden>
          1
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Required Accessories</p>
          {open ? (
            <p className="text-[11px] leading-snug text-ink-600">What this order needs - a name and a quantity. Feeds Purchase, Inward and Dispatch below automatically.</p>
          ) : (
            <p className="text-[11px] leading-snug text-ink-600">{flows.length === 0 ? "No accessories added" : `${flows.length} accessor${flows.length === 1 ? "y" : "ies"} required`}</p>
          )}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>

      {open && (
        <div className="space-y-3 p-3">
          <div className="space-y-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input label="Accessory Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Button 18L" autoFocus />
              <Input label="Quantity" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
              <Select label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as UnitType)}>
                <option value="PCS">PCS</option>
                <option value="KG">KG</option>
              </Select>
              <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Button type="button" size="sm" onClick={addRequirement} isLoading={saveRequirement.isPending}>
              + Add Accessory
            </Button>
          </div>

          <div className="space-y-2">
            {flows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-200 px-3 py-5 text-center text-sm text-ink-400">No accessories required yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-ink-100">
                <table className="w-full min-w-[420px] text-xs">
                  <thead>
                    <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
                      <th className="px-2.5 py-2 text-left font-semibold">Accessory</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Required Qty</th>
                      <th className="px-2.5 py-2 text-left font-semibold">Unit</th>
                      <th className="px-2.5 py-2 text-left font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {flows.map((f) => (
                      <tr key={f.requirement.id} className="bg-white">
                        <td className="px-2.5 py-2 font-semibold text-ink-900">{f.requirement.name}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums">{f.requirement.requiredQty.toLocaleString()}</td>
                        <td className="px-2.5 py-2 text-ink-500">{f.requirement.unit}</td>
                        <td className="px-2.5 py-2 text-ink-500">{f.requirement.requiredDate ? formatDisplayDate(f.requirement.requiredDate) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Purchase / Inward / Dispatch - one entry type each, same shared shape
// ---------------------------------------------------------------------------

const STAGE_META: Record<
  AccessoryEntryType,
  { step: number; title: string; hint: string; rail: string; band: string; chip: string; text: string }
> = {
  purchase: {
    step: 2,
    title: "Purchase Accessories",
    hint: "Pick an accessory required above and record what was purchased against it.",
    rail: "border-l-indigo-500",
    band: "bg-indigo-50/70",
    chip: "bg-indigo-600",
    text: "text-indigo-900",
  },
  inward: {
    step: 3,
    title: "Inward Accessories",
    hint: "What actually arrived into store against the purchase.",
    rail: "border-l-teal-500",
    band: "bg-teal-50/70",
    chip: "bg-teal-600",
    text: "text-teal-900",
  },
  dispatch: {
    step: 4,
    title: "Dispatch Accessories",
    hint: "What was sent on for use, and to where.",
    rail: "border-l-rose-500",
    band: "bg-rose-50/70",
    chip: "bg-rose-600",
    text: "text-rose-900",
  },
};

function blankEntryForm() {
  return {
    requirementId: "",
    qty: "",
    entryDate: new Date().toISOString().slice(0, 10),
    vendor: "",
    docNo: "",
    sentTo: "",
  };
}

function EntrySection({
  entryType,
  orderId,
  flows,
  onSaved,
}: {
  entryType: AccessoryEntryType;
  orderId: string;
  flows: AccessoryFlow[];
  onSaved: () => void;
}) {
  const meta = STAGE_META[entryType];
  const appUser = useEntryUser();
  const toast = useToast();
  const saveEntry = useSaveAccessoryEntry();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankEntryForm());

  const selected = flows.find((f) => f.requirement.id === form.requirementId) ?? null;
  const entries = flows.flatMap((f) => f.entries.filter((e) => e.entryType === entryType).map((e) => ({ entry: e, name: f.requirement.name, unit: f.requirement.unit })));
  const entriesSorted = entries.slice().sort((a, b) => b.entry.entryDate.localeCompare(a.entry.entryDate) || b.entry.createdAt.localeCompare(a.entry.createdAt));

  async function submit() {
    if (!appUser) return;
    if (!form.requirementId) {
      toast.show("Select an accessory first.", "error");
      return;
    }
    const qty = Number(form.qty) || 0;
    if (qty <= 0) {
      toast.show("Enter a quantity.", "error");
      return;
    }
    if (entryType === "dispatch" && !form.sentTo.trim()) {
      toast.show("Enter who this was sent to.", "error");
      return;
    }
    try {
      await saveEntry.mutateAsync({
        orderId,
        requirementId: form.requirementId,
        entryType,
        qty,
        entryDate: form.entryDate,
        vendor: entryType === "dispatch" ? null : form.vendor.trim() || null,
        docNo: form.docNo.trim() || null,
        sentTo: entryType === "dispatch" ? form.sentTo.trim() || null : null,
        notes: null,
      });
      setForm(blankEntryForm());
      onSaved();
      toast.show("Saved.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save.", "error");
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className={`flex items-start gap-2.5 border-l-4 px-3 py-2.5 ${meta.rail} ${meta.band}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm ${meta.chip}`} aria-hidden>
          {meta.step}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${meta.text}`}>{meta.title}</p>
          {open ? (
            <p className="text-[11px] leading-snug text-ink-600">{meta.hint}</p>
          ) : (
            <p className="text-[11px] leading-snug text-ink-600">{entries.length === 0 ? "No entries yet" : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} recorded`}</p>
          )}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>

      {open && (
        <div className="space-y-3 p-3">
          {flows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-5 text-center text-sm text-ink-400">Add an accessory under Required first.</p>
          ) : (
            <div className="space-y-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Select
                  label="Accessory"
                  value={form.requirementId}
                  onChange={(e) => setForm({ ...form, requirementId: e.target.value })}
                >
                  <option value="">- Select accessory -</option>
                  {flows.map((f) => (
                    <option key={f.requirement.id} value={f.requirement.id}>
                      {f.requirement.name}
                    </option>
                  ))}
                </Select>
                <Input
                  label={`Quantity${selected ? ` (${selected.requirement.unit})` : ""}`}
                  type="number"
                  min={0}
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                />
                <Input label="Date" type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
                {entryType === "dispatch" ? (
                  <Input label="Sent To" value={form.sentTo} onChange={(e) => setForm({ ...form, sentTo: e.target.value })} />
                ) : (
                  <Input label="Vendor / Purchase Source" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                )}
                <Input label="DC Name" value={form.docNo} onChange={(e) => setForm({ ...form, docNo: e.target.value })} />
              </div>
              {selected && (
                <p className="text-[11px] text-ink-500">
                  Required: <b className="tabular-nums">{selected.requirement.requiredQty.toLocaleString()}</b> {selected.requirement.unit}
                  {entryType === "purchase" && <> · Balance to purchase: <b className="tabular-nums">{selected.balanceToPurchase.toLocaleString()}</b></>}
                  {entryType === "inward" && <> · Balance to inward: <b className="tabular-nums">{selected.balanceToInward.toLocaleString()}</b></>}
                  {entryType === "dispatch" && <> · Balance to dispatch: <b className="tabular-nums">{selected.balanceToDispatch.toLocaleString()}</b></>}
                </p>
              )}
              <Button type="button" size="sm" onClick={submit} isLoading={saveEntry.isPending}>
                + Add {meta.title.split(" ")[0]} Entry
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {entriesSorted.length === 0 ? (
              <p className="text-xs text-ink-400">No entries yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-ink-100">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
                      <th className="px-2.5 py-2 text-left font-semibold">Date</th>
                      <th className="px-2.5 py-2 text-left font-semibold">Accessory</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Qty</th>
                      <th className="px-2.5 py-2 text-left font-semibold">{entryType === "dispatch" ? "Sent To" : "Vendor"}</th>
                      <th className="px-2.5 py-2 text-left font-semibold">DC Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {entriesSorted.map(({ entry, name, unit }) => (
                      <tr key={entry.id} className="bg-white">
                        <td className="whitespace-nowrap px-2.5 py-2 text-ink-500">{formatDisplayDate(entry.entryDate)}</td>
                        <td className="px-2.5 py-2 font-semibold text-ink-900">{name}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums">
                          {entry.qty.toLocaleString()} {unit}
                        </td>
                        <td className="px-2.5 py-2 text-ink-600">{(entryType === "dispatch" ? entry.sentTo : entry.vendor) ?? "-"}</td>
                        <td className="px-2.5 py-2 text-ink-600">{entry.docNo ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
