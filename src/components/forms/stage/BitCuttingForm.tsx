"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useEntryUser } from "@/hooks/useEntryUser";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import { useOrderGroups } from "@/hooks/useOrderGroups";
import { groupForStage } from "@/lib/orderGroups";
import { GroupEntryChip } from "@/components/groups/GroupEntryChip";
import { diffFields, useCreateTxns, useRecordAudit, useStageChain, useUpdateTxn, type NewTxn } from "@/hooks/useProductionChain";
import { useStageEntryBuilder } from "@/hooks/useStageEntryBuilder";
import { formatDisplayDate } from "@/lib/workflow";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/FormControls";
import { DirectionPanel, QtyBox, Section, type StageLedgerHandle } from "./chainShared";
import { StageActions } from "./shared";
import type { StageFormProps } from "./types";
import type { ProductionTxn } from "@/lib/types";
import { Loader } from "@/components/ui/Loader";

/**
 * Bit Cutting - a vendor round trip with exactly two operations, Sent and
 * Receive, and exactly five things to type for each: Vendor Name, DC Name,
 * DC Number, Bit Count (numbers) and Bit KG.
 *
 * No sizes, no lots, no notes, no date picker (an entry is dated the day it
 * is saved). Each entry is ONE production_txns row: the weight goes in the
 * ordinary quantity columns (qty_in for a Sent, qty_out for a Receive, unit
 * KG - which is what lets chain.ts treat this as the KG stage it now is),
 * the count in qty_count, the vendor in ref_name, the DC Number in doc_no and
 * the DC Name in dc_name.
 *
 * Entries recorded back when Bit Cutting was a size-wise PCS stage still sit
 * in the table, marked "earlier", read-only: they are pieces by size, not a
 * Bit Count / Bit KG, so there is nothing sensible to turn them into.
 */

interface BitDraft {
  vendor: string;
  dcName: string;
  dcNo: string;
  count: string;
  kg: string;
}

const BLANK_DRAFT: BitDraft = { vendor: "", dcName: "", dcNo: "", count: "", kg: "" };

type Operation = "send" | "receive";

function draftHasValue(d: BitDraft): boolean {
  return Number(d.count) > 0 || Number(d.kg) > 0;
}

/** Local calendar day as yyyy-MM-dd (toISOString would give the UTC day,
 *  which is yesterday for the first hours of an Indian morning). */
function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const sumOf = (rows: ProductionTxn[], pick: (t: ProductionTxn) => number) => rows.reduce((total, t) => total + (Number(pick(t)) || 0), 0);

const FIELD_LABEL: Record<string, string> = {
  refName: "Vendor Name",
  dcName: "DC Name",
  docNo: "DC Number",
  qtyCount: "Bit Count",
  qtyIn: "Bit KG",
  qtyOut: "Bit KG",
};

export function BitCuttingForm(props: StageFormProps) {
  const { order, assignment, stageProgress, onForwarded, showDetails } = props;
  const { cs, isLoading, isError } = useStageChain(order.id, assignment.poId, assignment.sectionId);
  const { submitMovement, isPending } = useStageEntryBuilder(order, assignment);
  const sentPanel = useRef<StageLedgerHandle>(null);
  const receivePanel = useRef<StageLedgerHandle>(null);
  const toast = useToast();

  if (isLoading) return <Loader label="Loading this stage…" />;
  if (isError || !cs) return <p className="text-sm text-status-bad">Couldn&apos;t load this stage&apos;s data.</p>;

  // New-style rows (KG) live on the stage itself; rows from when it was a
  // size-wise PCS stage were set apart by chain.ts into cs.pcs.
  const rows = cs.txns;
  const earlier = cs.pcs?.txns ?? [];

  const sent = rows.filter((t) => t.txnType === "send");
  const received = rows.filter((t) => t.txnType === "receive");
  const earlierSent = earlier.filter((t) => t.txnType === "send");
  const earlierReceived = earlier.filter((t) => t.txnType === "receive");

  const sentKg = sumOf(sent, (t) => t.qtyIn);
  const receivedKg = sumOf(received, (t) => t.qtyOut);
  const sentCount = sumOf(sent, (t) => t.qtyCount) + sumOf(earlierSent, (t) => t.qtyIn);
  const receivedCount = sumOf(received, (t) => t.qtyCount) + sumOf(earlierReceived, (t) => t.qtyOut);
  const withVendorKg = Math.max(sentKg - receivedKg, 0);
  const withVendorCount = Math.max(sentCount - receivedCount, 0);

  async function saveBoth(): Promise<boolean> {
    if (!(await sentPanel.current?.save())) return false;
    return (await receivePanel.current?.save()) ?? true;
  }

  async function forward(isFinal: boolean) {
    if (!(await saveBoth())) return;
    const alreadyLogged = stageProgress?.qtyForwarded ?? 0;
    await submitMovement({
      base: {
        qtyReceived: cs!.input,
        qtyCompletedToday: Math.max(receivedKg - alreadyLogged, 0),
        qtyForwarded: Math.max(receivedKg - alreadyLogged, 0),
        isSentOutside: true,
        notes: null,
      },
      action: isFinal ? "complete" : "forward",
    });
    onForwarded();
  }

  async function savePlan() {
    const hadPending = (sentPanel.current?.hasPending() ?? false) || (receivePanel.current?.hasPending() ?? false);
    if (!(await saveBoth())) return;
    await submitMovement({
      base: { qtyReceived: cs!.input, qtyForwarded: 0, notes: "Plan saved - nothing forwarded." },
      action: "plan",
    });
    onForwarded();
    if (!hadPending) toast.show("Progress saved. Nothing moved on.", "success");
  }

  return (
    <div className="space-y-6">
      {showDetails && (
        <>
          <p className="text-xs leading-relaxed text-ink-500">
            Bits are sent out to the cutting vendor and come back. For each Sent and each Receive, enter the vendor, the DC name and number, and how many bits and how
            many kilograms there were.
          </p>

          <Section title="Position">
            <div className="grid grid-cols-3 gap-2">
              <QtyBox label="Bit Count sent" value={sentCount} unit="Nos" />
              <QtyBox label="Bit Count received" value={receivedCount} unit="Nos" tone="good" />
              <QtyBox label="Bit Count with vendor" value={withVendorCount} unit="Nos" tone={withVendorCount > 0 ? "warn" : "good"} />
              <QtyBox label="Bit KG sent" value={sentKg} unit="KG" />
              <QtyBox label="Bit KG received" value={receivedKg} unit="KG" tone="good" />
              <QtyBox label="Bit KG with vendor" value={withVendorKg} unit="KG" tone={withVendorKg > 0 ? "warn" : "good"} />
            </div>
          </Section>
        </>
      )}

      <DirectionPanel direction="out" step={1} title="Sent" subtitle="What went out to the vendor.">
        <BitOperationPanel
          ref={sentPanel}
          operation="send"
          orderId={order.id}
          poId={assignment.poId}
          sectionId={assignment.sectionId}
          rows={sent}
          earlierRows={earlierSent}
          onSaved={onForwarded}
        />
      </DirectionPanel>

      <DirectionPanel direction="in" step={2} title="Receive" subtitle="What came back from the vendor.">
        <BitOperationPanel
          ref={receivePanel}
          operation="receive"
          orderId={order.id}
          poId={assignment.poId}
          sectionId={assignment.sectionId}
          rows={received}
          earlierRows={earlierReceived}
          onSaved={onForwarded}
        />
      </DirectionPanel>

      <StageActions
        sectionLabel={assignment.section?.label ?? "Bit Cutting"}
        unitType="KG"
        balance={withVendorKg}
        isLoading={isPending}
        onSavePlan={savePlan}
        onMoveForward={() => forward(false)}
        onComplete={() => forward(true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One operation (Sent or Receive): its entry form and its table
// ---------------------------------------------------------------------------

interface BitOperationPanelProps {
  operation: Operation;
  orderId: string;
  poId: string | null;
  sectionId: string;
  rows: ProductionTxn[];
  earlierRows: ProductionTxn[];
  onSaved: () => void;
}

const BitOperationPanel = forwardRef<StageLedgerHandle, BitOperationPanelProps>(function BitOperationPanel(
  { operation, orderId, poId, sectionId, rows, earlierRows, onSaved },
  ref,
) {
  const appUser = useEntryUser();
  const toast = useToast();
  const confirm = useConfirm();
  const createTxns = useCreateTxns();
  const updateTxn = useUpdateTxn();
  const recordAudit = useRecordAudit();
  // Whether Bit Cutting is in an Order Group for this order right now - decides
  // if a row is shown as a group entry and if a correction is warned as shared.
  const { data: allGroups } = useOrderGroups();
  const liveGroup = groupForStage(allGroups, orderId, "bit_cutting");
  const isGroupEntry = (t: ProductionTxn) => !!liveGroup && t.groupId === liveGroup.id;

  const [draft, setDraft] = useState<BitDraft>(BLANK_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BitDraft>(BLANK_DRAFT);
  const [reason, setReason] = useState("");

  const opLabel = operation === "send" ? "Sent" : "Received";
  const kgOf = (t: ProductionTxn) => (operation === "send" ? t.qtyIn : t.qtyOut);

  async function save(): Promise<boolean> {
    if (!appUser) return false;
    if (!draftHasValue(draft)) return true;
    const kg = Number(draft.kg) || 0;
    const count = Number(draft.count) || 0;
    const row: NewTxn = {
      orderId,
      poId,
      sectionId,
      lotId: null,
      sizeCode: null,
      txnType: operation,
      unit: "KG",
      qtyIn: operation === "send" ? kg : 0,
      qtyOut: operation === "receive" ? kg : 0,
      qtyRejected: 0,
      qtyRework: 0,
      qtyCount: count,
      refName: draft.vendor.trim() || null,
      docNo: draft.dcNo.trim() || null,
      dcName: draft.dcName.trim() || null,
      entryDate: todayKey(),
      notes: null,
      enteredBy: appUser.id,
      isJobWork: false,
    };
    try {
      await createTxns.mutateAsync([row]);
      await recordAudit.mutateAsync({
        orderId,
        poId,
        sectionId,
        entity: "production_txn",
        entityId: null,
        action: "create",
        summary: `Bit Cutting ${opLabel.toLowerCase()}: ${count.toLocaleString()} nos · ${kg.toLocaleString()} KG`,
        changes: null,
        notes: null,
      });
      setDraft(BLANK_DRAFT);
      onSaved();
      toast.show(`${opLabel} entry saved.`, "success");
      return true;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the entry.", "error");
      return false;
    }
  }

  useImperativeHandle(ref, () => ({ save, hasPending: () => draftHasValue(draft) }));

  function beginEdit(t: ProductionTxn) {
    setEditingId(t.id);
    setReason("");
    setEditDraft({
      vendor: t.refName ?? "",
      dcName: t.dcName ?? "",
      dcNo: t.docNo ?? "",
      count: t.qtyCount ? String(t.qtyCount) : "",
      kg: kgOf(t) ? String(kgOf(t)) : "",
    });
  }

  async function saveEdit(original: ProductionTxn) {
    if (!appUser) return;
    if (!draftHasValue(editDraft)) {
      toast.show("Enter a Bit Count or a Bit KG.", "error");
      return;
    }
    if (!reason.trim()) {
      toast.show("Add a note explaining the correction - it's kept in the audit trail.", "error");
      return;
    }
    const kg = Number(editDraft.kg) || 0;
    const patch = {
      qtyIn: operation === "send" ? kg : 0,
      qtyOut: operation === "receive" ? kg : 0,
      qtyCount: Number(editDraft.count) || 0,
      refName: editDraft.vendor.trim() || null,
      docNo: editDraft.dcNo.trim() || null,
      dcName: editDraft.dcName.trim() || null,
    };
    const changes = diffFields(original as unknown as Record<string, unknown>, patch);
    if (!changes) {
      setEditingId(null);
      return;
    }
    const ok = await confirm({
      title: "Update this entry?",
      message: (
        <>
          <p>The original figures are kept in the audit trail alongside your note.</p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {Object.entries(changes).map(([field, c]) => (
              <li key={field}>
                <b>{FIELD_LABEL[field] ?? field}</b>: {String(c.from ?? "-")} → {String(c.to ?? "-")}
              </li>
            ))}
          </ul>
        </>
      ),
      confirmLabel: "Save correction",
      cancelLabel: "Go back",
    });
    if (!ok) return;
    try {
      await updateTxn.mutateAsync({ id: original.id, orderId, patch });
      await recordAudit.mutateAsync({
        orderId,
        poId,
        sectionId,
        entity: "production_txn",
        entityId: original.id,
        action: "update",
        summary: `Bit Cutting ${opLabel.toLowerCase()} entry of ${formatDisplayDate(original.entryDate)} corrected`,
        changes,
        notes: reason.trim(),
      });
      setEditingId(null);
      onSaved();
      toast.show("Entry corrected.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the correction.", "error");
    }
  }

  const empty = rows.length === 0 && earlierRows.length === 0;

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-ink-100 bg-white p-3">
        <BitFields value={draft} onChange={setDraft} />
        <Button type="button" size="sm" onClick={() => void save()} isLoading={createTxns.isPending}>
          Save Entry
        </Button>
      </div>

      {empty ? (
        <p className="text-xs text-ink-400">Nothing recorded here yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="bg-ink-50 uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Vendor Name</th>
                <th className="px-3 py-2 text-left font-semibold">DC Name</th>
                <th className="px-3 py-2 text-left font-semibold">DC Number</th>
                <th className="px-3 py-2 text-right font-semibold">Bit Count (Nos)</th>
                <th className="px-3 py-2 text-right font-semibold">Bit KG</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {earlierRows.map((t) => (
                <tr key={t.id} className="bg-ink-50/50">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{formatDisplayDate(t.entryDate)}</td>
                  <td className="px-3 py-2">{t.refName ?? "-"}</td>
                  {/* Recorded before there was a separate DC Number: its single
                      "DC Name" field is what sits in doc_no. */}
                  <td className="px-3 py-2">{t.docNo ?? "-"}</td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(operation === "send" ? t.qtyIn : t.qtyOut).toLocaleString()}
                    {t.sizeCode ? <span className="ml-1 text-ink-400">· size {t.sizeCode}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-400">-</td>
                  <td className="px-3 py-2 text-right">
                    <Badge tone="neutral">earlier</Badge>
                  </td>
                </tr>
              ))}
              {rows.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className="bg-amber-50/60">
                    <td colSpan={7} className="space-y-3 px-3 py-3">
                      <p className="text-xs font-semibold text-amber-800">Correcting the entry of {formatDisplayDate(t.entryDate)}</p>
                      {isGroupEntry(t) && (
                        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                          This is a group entry (&ldquo;{liveGroup!.name}&rdquo;). Saving the correction changes it on every other order in the group too.
                        </p>
                      )}
                      <BitFields value={editDraft} onChange={setEditDraft} />
                      <Textarea
                        label="Reason for the correction (required)"
                        required
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Recount at the gate - 4 KG more than first recorded"
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => void saveEdit(t)} isLoading={updateTxn.isPending}>
                          Save correction
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className={isGroupEntry(t) ? "bg-violet-50/70" : "bg-white"}>
                    <td className={`whitespace-nowrap px-3 py-2 text-ink-500 ${isGroupEntry(t) ? "border-l-4 border-l-violet-500" : ""}`}>{formatDisplayDate(t.entryDate)}</td>
                    <td className="px-3 py-2 font-medium text-ink-900">{t.refName ?? "-"}</td>
                    <td className="px-3 py-2">{t.dcName ?? "-"}</td>
                    <td className="px-3 py-2">{t.docNo ?? "-"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.qtyCount > 0 ? t.qtyCount.toLocaleString() : "-"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{kgOf(t) > 0 ? kgOf(t).toLocaleString() : "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isGroupEntry(t) && <GroupEntryChip groupName={liveGroup!.name} compact />}
                        <Button type="button" variant="ghost" size="sm" onClick={() => beginEdit(t)}>
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

/** The five fields - the same set whether adding or correcting an entry. */
function BitFields({ value, onChange }: { value: BitDraft; onChange: (next: BitDraft) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Input label="Vendor Name" value={value.vendor} onChange={(e) => onChange({ ...value, vendor: e.target.value })} placeholder="Unit / vendor name" />
      <Input label="DC Name" value={value.dcName} onChange={(e) => onChange({ ...value, dcName: e.target.value })} />
      <Input label="DC Number" value={value.dcNo} onChange={(e) => onChange({ ...value, dcNo: e.target.value })} />
      <Input label="Bit Count (Numbers)" type="number" min={0} value={value.count} onChange={(e) => onChange({ ...value, count: e.target.value })} />
      <Input label="Bit KG (KG)" type="number" min={0} value={value.kg} onChange={(e) => onChange({ ...value, kg: e.target.value })} />
    </div>
  );
}
