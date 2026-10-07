"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useOrdersList, type OrderListRow } from "@/hooks/useOrdersList";
import { useDeleteOrderGroup, useOrderGroups, useSaveOrderGroup } from "@/hooks/useOrderGroups";
import { useStageDefinitions } from "@/hooks/useStageDefinitions";
import { memberLabel, stageUnit, type OrderGroupView } from "@/lib/orderGroups";
import { matchesBuyer } from "@/lib/buyers";
import { PHASES, phaseOf, type PhaseKey } from "@/lib/stagePhases";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { Input } from "@/components/ui/FormControls";
import { FilterIcon, FilterSelect } from "@/components/ui/FilterSelect";
import { Loader } from "@/components/ui/Loader";
import { AccentCard, PageHero, SectionTitle } from "@/components/ui/SectionCard";
import { LinkGlyph } from "@/components/groups/GroupIndicator";

/**
 * Admin-only: group orders so data entered on one at a chosen stage is saved to
 * all of them. The page only ever edits the group definitions - the copying
 * itself happens on the server, when an entry is saved (see
 * lib/server/orderGroups.ts). Orders that are in no group are untouched by
 * anything here.
 *
 * Flow: pick a buyer, pick an IO, tick two or more of its orders, tick the
 * stages the group should cover, save. EVERY stage in the catalog is listed. A
 * stage can be ticked when every selected order has it in its own plan, counted
 * in the same unit, and it isn't already in another group; otherwise it is
 * greyed out with the reason.
 */

/** The catalog in the order the work flows, so the list reads like an order's
 *  own plan rather than alphabetically. Anything new falls to the end. */
const STAGE_ORDER = [
  "order_confirmation",
  "accessories",
  "raw_material_planning",
  "po_to_suppliers",
  "raw_material_inward",
  "knitting",
  "dyeing",
  "brushing",
  "compacting",
  "acid_wash",
  "heat_setting",
  "washing",
  "cpl_wash",
  "lubricant_wash",
  "fabric_inhouse",
  "fabric_inspection",
  "fabric_store",
  "pattern_marker",
  "cutting",
  "bit_cutting",
  "panel_checking",
  "embroidery",
  "garment_die",
  "printing",
  "stone",
  "sewing",
  "checking",
  "ironing",
  "packing",
];

/** Accessories is bought alongside the yarn, so it sits with Order & Procurement here. */
function phaseKeyOf(stageKey: string): PhaseKey {
  return stageKey === "accessories" ? "procurement" : phaseOf(stageKey);
}

const orderLabel = (o: Pick<OrderListRow, "style" | "color">) => `${o.style}${o.color ? ` / ${o.color}` : ""}`;

export default function GroupingPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const ordersQuery = useOrdersList({ includeStagePlan: true });
  const groupsQuery = useOrderGroups();
  const catalogQuery = useStageDefinitions();
  const saveGroup = useSaveOrderGroup();
  const deleteGroup = useDeleteOrderGroup();

  const [buyerId, setBuyerId] = useState("");
  const [ioNo, setIoNo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stageKeys, setStageKeys] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const orders = ordersQuery.data;
  const groups = groupsQuery.data;

  const buyerOrders = useMemo(() => (orders ?? []).filter((o) => matchesBuyer(o, buyerId)), [orders, buyerId]);
  const ioNumbers = useMemo(() => Array.from(new Set(buyerOrders.map((o) => o.ioNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [buyerOrders]);
  const ordersForIo = useMemo(() => buyerOrders.filter((o) => o.ioNo === ioNo).sort((a, b) => orderLabel(a).localeCompare(orderLabel(b))), [buyerOrders, ioNo]);

  const selectedOrders = useMemo(() => ordersForIo.filter((o) => selectedIds.has(o.id)), [ordersForIo, selectedIds]);

  // Every catalog stage's label - for naming a group's stages.
  const stageLabelByKey = useMemo(() => new Map((catalogQuery.data ?? []).map((s) => [s.key, s.label])), [catalogQuery.data]);

  /** Which group (other than the one being edited) already owns an order's stage. */
  const groupOf = useMemo(() => {
    const map = new Map<string, OrderGroupView>();
    for (const g of groups ?? []) {
      if (g.id === editingId) continue;
      for (const m of g.members) for (const key of g.stageKeys) map.set(`${m.orderId}::${key}`, g);
    }
    return map;
  }, [groups, editingId]);

  // One row per catalog stage - all of them - with whether (and why not) it can
  // be ticked for the selected orders.
  const stageOptions = useMemo(() => {
    const rank = (key: string) => {
      const i = STAGE_ORDER.indexOf(key);
      return i === -1 ? STAGE_ORDER.length : i;
    };
    return (catalogQuery.data ?? [])
      .map((def) => {
        const plans = selectedOrders.map((o) => (o.stagePlan ?? []).find((p) => p.key === def.key));
        let reason: string | null = null;
        if (plans.some((p) => !p)) {
          const missing = selectedOrders.filter((o) => !(o.stagePlan ?? []).some((p) => p.key === def.key));
          reason = `Not in the plan of ${missing.length === selectedOrders.length ? "any of these orders" : missing.map(orderLabel).join(", ")}`;
        } else if (new Set(plans.map((p) => stageUnit(p!))).size > 1) {
          reason = "Counted in different units on these orders";
        } else {
          const taken = selectedOrders.map((o) => groupOf.get(`${o.id}::${def.key}`)).find(Boolean);
          if (taken) reason = `Already in the group "${taken.name}"`;
        }
        return { key: def.key, label: def.label, reason };
      })
      .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
  }, [catalogQuery.data, selectedOrders, groupOf]);

  const selectedBuyerKey = selectedOrders.length > 0 ? (selectedOrders[0].buyerId ?? "") : null;

  function resetForm() {
    setSelectedIds(new Set());
    setStageKeys(new Set());
    setName("");
    setEditingId(null);
  }

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // A stage ticked for one selection may not apply to the next - the page
    // re-validates the ticks below, but drop them rather than keep stale ones.
    setStageKeys(new Set());
  }

  function toggleStage(key: string) {
    setStageKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startEdit(group: OrderGroupView) {
    const member = (orders ?? []).find((o) => o.id === group.members[0]?.orderId);
    setBuyerId(member?.buyerId ?? "");
    setIoNo(group.ioNo);
    setSelectedIds(new Set(group.members.map((m) => m.orderId)));
    setStageKeys(new Set(group.stageKeys));
    setName(group.name);
    setEditingId(group.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const ticked = stageOptions.filter((s) => stageKeys.has(s.key) && !s.reason).map((s) => s.key);
  const canSave = selectedOrders.length >= 2 && ticked.length >= 1;

  async function handleSave() {
    if (!canSave) return;
    try {
      await saveGroup.mutateAsync({ id: editingId ?? undefined, input: { name: name.trim() || undefined, orderIds: selectedOrders.map((o) => o.id), stageKeys: ticked } });
      toast.success(editingId ? "Group updated." : "Group created.");
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the group.");
    }
  }

  async function handleDissolve(group: OrderGroupView) {
    const ok = await confirm({
      title: "Dissolve this group?",
      tone: "danger",
      confirmLabel: "Dissolve group",
      message: (
        <>
          <p>
            <b>&ldquo;{group.name}&rdquo;</b> will stop linking its {group.members.length} orders.
          </p>
          <p className="mt-2">Every entry already saved stays exactly as it is on each order. From now on, an entry on one of them will no longer be saved to the others, and a correction will only change that one order.</p>
        </>
      ),
    });
    if (!ok) return;
    try {
      await deleteGroup.mutateAsync(group.id);
      if (editingId === group.id) resetForm();
      toast.success("Group dissolved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not dissolve the group.");
    }
  }

  const visibleGroups = (groups ?? []).filter((g) => !ioNo || g.ioNo === ioNo);

  if (ordersQuery.isLoading || groupsQuery.isLoading || catalogQuery.isLoading) return <Loader full label="Loading…" />;
  if (ordersQuery.isError || groupsQuery.isError || catalogQuery.isError) return <p className="text-sm text-status-bad">Couldn&apos;t load orders, groups or stages.</p>;

  return (
    <div className="space-y-6">
      <PageHero
        icon="🔗"
        iconBg="linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)"
        title="Grouping"
        titleGradient="linear-gradient(100deg, #7C3AED 0%, #2563EB 60%, #0EA5E9 100%)"
        description="Group orders under one IO and pick the stages they share. Data entered on any order in the group at one of those stages is saved to all of them. Orders that aren't grouped work exactly as before."
      />

      <AccentCard tone="violet" className="p-5">
        <p className="mb-3">
          <SectionTitle icon="📦" tone="violet">
            Step 1 - Pick the buyer and IO
          </SectionTitle>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BuyerFilter
            value={buyerId}
            onChange={(id) => {
              setBuyerId(id);
              setIoNo("");
              resetForm();
            }}
          />
          <FilterSelect
            label="IO / No"
            icon={FilterIcon.order}
            value={ioNo}
            onChange={(next) => {
              setIoNo(next);
              resetForm();
            }}
            searchable
            searchPlaceholder="Search IO numbers…"
            options={[{ value: "", label: "Select an IO…" }, ...ioNumbers.map((n) => ({ value: n, label: n, hint: `${buyerOrders.filter((o) => o.ioNo === n).length} orders` }))]}
          />
        </div>

        {ioNo && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Orders under IO {ioNo} ({ordersForIo.length}) - tick the ones to group
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {ordersForIo.map((o) => {
                const checked = selectedIds.has(o.id);
                const differentBuyer = selectedBuyerKey !== null && !checked && (o.buyerId ?? "") !== selectedBuyerKey;
                const groupedAt = (o.stagePlan ?? []).filter((p) => groupOf.has(`${o.id}::${p.key}`));
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                      checked ? "border-violet-400 bg-violet-50 shadow-[0_6px_16px_-10px_rgba(109,40,217,0.6)]" : "border-ink-200 bg-white/70 hover:border-violet-300"
                    } ${differentBuyer ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={checked} disabled={differentBuyer} onChange={() => toggleOrder(o.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{o.style}</span>
                      <span className="block truncate text-xs text-ink-500">
                        {o.color ?? "No colour"} · {o.totalQty.toLocaleString()} pcs{o.buyer ? ` · ${o.buyer.name}` : " · no buyer"}
                      </span>
                      {differentBuyer && <span className="block text-[11px] text-status-bad">Different buyer - can&apos;t be grouped with the selected orders</span>}
                      {groupedAt.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {groupedAt.map((p) => (
                            <span key={p.key} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              <LinkGlyph size={9} />
                              {p.label}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </AccentCard>

      {selectedOrders.length >= 2 && (
        <AccentCard tone="amber" className="p-5">
          <p className="mb-1">
            <SectionTitle icon="🗂️" tone="amber">
              Step 2 - Which stages does this group cover?
            </SectionTitle>
          </p>
          <p className="mb-3 text-xs text-ink-500">
            Only the ticked stages are shared between these {selectedOrders.length} orders. Every stage is listed; one is greyed out only when it can&apos;t be shared (a selected order doesn&apos;t
            have it in its plan, or it is already in another group). For Order Confirmation and Pattern Making, confirming on one order confirms all of them. For every other stage, the data entered
            is shared and Move Forward / Complete stays separate on each order.
          </p>
          {stageOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-500">No stages found.</p>
          ) : (
            <div className="space-y-3">
              {PHASES.map((phase) => {
                const rows = stageOptions.filter((s) => phaseKeyOf(s.key) === phase.key);
                if (rows.length === 0) return null;
                return (
                  <div key={phase.key} className={`rounded-lg border-l-4 ${phase.rail} ${phase.band} p-3`}>
                    <p className={`mb-2 text-xs font-bold ${phase.text}`}>{phase.label}</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {rows.map((s) => (
                        <label key={s.key} className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 ${s.reason ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-white/60"}`}>
                          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={!s.reason && stageKeys.has(s.key)} disabled={!!s.reason} onChange={() => toggleStage(s.key)} />
                          <span className="min-w-0 text-sm text-ink-800">
                            {s.label}
                            {s.reason && <span className="block text-[11px] text-status-bad">{s.reason}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AccentCard>
      )}

      {selectedOrders.length >= 1 && (
        <AccentCard tone="emerald" className="p-5">
          <p className="mb-3">
            <SectionTitle icon="✅" tone="emerald">
              {editingId ? "Step 3 - Save your changes" : "Step 3 - Create the group"}
            </SectionTitle>
          </p>
          <Input label="Group name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={`IO ${ioNo} · …`} />

          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-xs leading-relaxed text-violet-900">
            <p>
              <b>{selectedOrders.length}</b> order{selectedOrders.length === 1 ? "" : "s"} · <b>{ticked.length}</b> stage{ticked.length === 1 ? "" : "s"}
              {ticked.length > 0 && <> ({ticked.map((k) => stageLabelByKey.get(k) ?? k).join(", ")})</>}
            </p>
            <p className="mt-1.5">
              Grouping applies to entries saved <b>from now on</b>. Entries already recorded on these orders are not copied or changed. Marking a stage forward or complete stays separate on each order.
            </p>
          </div>

          <div className="-mx-5 -mb-5 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-white/70 bg-gradient-to-r from-emerald-50/70 to-white/70 px-5 py-4">
            <p className="text-xs text-ink-600">{canSave ? "Ready to save." : selectedOrders.length < 2 ? "Select at least two orders." : "Tick at least one stage."}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={resetForm}>
                {editingId ? "Cancel editing" : "Clear"}
              </Button>
              <Button onClick={handleSave} isLoading={saveGroup.isPending} disabled={!canSave}>
                {editingId ? "Save changes" : "Create group"}
              </Button>
            </div>
          </div>
        </AccentCard>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold text-ink-900">
          <SectionTitle icon="🔗" tone="violet">
            {ioNo ? `Groups under IO ${ioNo}` : "All groups"} ({visibleGroups.length})
          </SectionTitle>
        </h2>
        {visibleGroups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 bg-white/60 px-4 py-8 text-center text-sm text-ink-500">{ioNo ? "No groups under this IO yet." : "No groups yet."}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleGroups.map((g) => (
              <div key={g.id} className={`rounded-2xl border bg-white/80 p-4 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)] ${editingId === g.id ? "border-violet-400 ring-2 ring-violet-200" : "border-white/70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
                        <LinkGlyph size={12} />
                      </span>
                      <span className="truncate">{g.name}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      IO {g.ioNo}
                      {g.buyerName ? ` · ${g.buyerName}` : ""} · {g.entryCount} entr{g.entryCount === 1 ? "y" : "ies"} saved through this group
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(g)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDissolve(g)}>
                      Dissolve
                    </Button>
                  </div>
                </div>

                {g.members.length < 2 && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">Only one order is left in this group, so it isn&apos;t copying anything. Add an order or dissolve it.</p>}

                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Stages</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.stageKeys.map((k) => (
                    <Badge key={k} tone="info">
                      {stageLabelByKey.get(k) ?? k}
                    </Badge>
                  ))}
                </div>

                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Orders ({g.members.length})</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.members.map((m) => (
                    <span key={m.orderId} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                      {memberLabel(m)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
