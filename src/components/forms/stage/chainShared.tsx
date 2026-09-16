"use client";

import { forwardRef, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { useEntryUser } from "@/hooks/useEntryUser";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import {
  useCreateLot,
  useCreateTxns,
  useUpdateTxn,
  useRecordAudit,
  useOrderPurchaseOrders,
  diffFields,
  type NewTxn,
} from "@/hooks/useProductionChain";
import type { ChainStage, LotFlow, LotSizeCell } from "@/lib/chain";
import { formatDisplayDate } from "@/lib/workflow";
import { stageQtyLabels } from "@/lib/stageLabels";
import { applyExtraPercent } from "@/lib/sizes";
import { getOrderProductionQty } from "@/lib/orderQty";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/FormControls";
import type { AssignmentWithDetails, Order, ProductionLot, ProductionTxn, TxnType, UnitType } from "@/lib/types";

/**
 * Shared machinery for every quantity-recording stage: never overwrite,
 * always allow editing, always record who/when/why, always show the running
 * cumulative. A stage form supplies a LedgerConfig describing which columns
 * it needs and <StageLedger/> does the rest.
 */

// ---------------------------------------------------------------------------
// Chain strip - the same four numbers at the top of every stage
// ---------------------------------------------------------------------------

export function QtyBox({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: number;
  unit?: UnitType;
  tone?: "good" | "bad" | "warn" | "neutral";
  hint?: string;
}) {
  const color =
    tone === "bad" ? "text-status-bad" : tone === "good" ? "text-status-good" : tone === "warn" ? "text-amber-600" : "text-ink-900";
  return (
    <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
      {unit && <p className="text-[10px] font-medium text-ink-400">{unit}</p>}
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-ink-400">{hint}</p>}
    </div>
  );
}

/** Input → Output → Rejected → Balance. */
export function ChainStrip({ cs, inputHint }: { cs: ChainStage; inputHint?: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QtyBox
          label="Input"
          value={cs.input}
          unit={cs.unit}
          hint={inputHint ?? (cs.recordedIn > 0 ? "counted in here" : cs.inherited > 0 ? "from previous stage" : "order baseline")}
        />
        <QtyBox label="Output" value={cs.output} unit={cs.unit} tone="good" hint="sent on" />
        <QtyBox label="Rejected" value={cs.rejected} unit={cs.unit} tone={cs.rejected > 0 ? "bad" : "neutral"} />
        <QtyBox label="Balance" value={cs.balance} unit={cs.unit} tone={cs.balance > 0 ? "warn" : "good"} hint="still owed" />
      </div>
      {cs.hasMismatch && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The previous stage sent on <b>{cs.inherited.toLocaleString()} {cs.unit}</b> but{" "}
          <b>{cs.recordedIn.toLocaleString()} {cs.unit}</b> was counted in here - a difference of{" "}
          {Math.abs(cs.recordedIn - cs.inherited).toLocaleString()} {cs.unit}. Both figures are kept;
          reconcile before completing this stage.
        </p>
      )}
    </div>
  );
}

/** Buyer Order Quantity -> Excess % -> Extra Quantity -> Final Production Quantity. */
export function OrderQtyBanner({ order, assignment }: { order: Order; assignment: AssignmentWithDetails }) {
  const posQuery = useOrderPurchaseOrders(order.id);
  const po = assignment.po;

  const buyerQty = po ? po.quantity : order.totalQty;
  const productionQty = po ? applyExtraPercent(po.quantity, po.extraPercent) : getOrderProductionQty(posQuery.data ?? []) || buyerQty;
  const extraQty = productionQty - buyerQty;
  const extraPercent = buyerQty > 0 ? Math.round((extraQty / buyerQty) * 1000) / 10 : 0;

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/70 bg-white/70 p-2.5 sm:grid-cols-4">
      <QtyBox label="Buyer Order Quantity" value={buyerQty} unit="PCS" hint="reference / comparison only" />
      <QtyBox label="Extra %" value={extraPercent} hint="effective rate across every PO in this order" />
      <QtyBox label="Extra Quantity" value={extraQty} unit="PCS" hint="added on top of buyer order qty" />
      <QtyBox label="Final Production Quantity" value={productionQty} unit="PCS" tone="good" hint="what production actually runs against" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lot-wise and size-wise roll-ups
// ---------------------------------------------------------------------------

export function LotSummaryTable({ cs }: { cs: ChainStage }) {
  const labels = stageQtyLabels(cs.stage.key);
  if (cs.byLot.length === 0) return null;
  const showRework = !!labels.rework && cs.byLot.some((l) => l.qtyRework > 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Lot</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.in}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.out}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.rejected}</th>
            {showRework && <th className="px-3 py-2 text-right font-semibold">{labels.rework}</th>}
            <th className="px-3 py-2 text-right font-semibold">{labels.balance}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cs.byLot.map((l) => (
            <tr key={l.lotId} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{l.lotNo}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.qtyIn.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{l.qtyOut.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-bad">{l.qtyRejected.toLocaleString()}</td>
              {showRework && <td className="px-3 py-2 text-right tabular-nums text-amber-600">{l.qtyRework.toLocaleString()}</td>}
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${l.balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                {l.balance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SizeSummaryTable({ cs }: { cs: ChainStage }) {
  const labels = stageQtyLabels(cs.stage.key);
  if (cs.bySize.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Size</th>
            <th className="px-3 py-2 text-right font-semibold">PO Qty</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.in}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.out}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.rejected}</th>
            <th className="px-3 py-2 text-right font-semibold">{labels.balance}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cs.bySize.map((s) => (
            <tr key={s.sizeCode} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{s.sizeCode}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-500">{s.poQty.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.qtyIn.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{s.qtyOut.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-bad">{s.qtyRejected.toLocaleString()}</td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${s.balance > 0 ? "text-amber-600" : "text-status-good"}`}>
                {s.balance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ink-50 text-xs font-bold text-ink-800">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.poQty).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyIn).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyOut).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.qtyRejected).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(cs.bySize, (s) => s.balance).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ReworkSummaryTable({ cs }: { cs: ChainStage }) {
  const rows = cs.reworkBySize.filter((r) => r.added > 0 || r.solved > 0);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-left font-semibold">Size</th>
            <th className="px-3 py-2 text-right font-semibold">Sent to Rework</th>
            <th className="px-3 py-2 text-right font-semibold">Solved</th>
            <th className="px-3 py-2 text-right font-semibold">Pending</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => (
            <tr key={r.sizeCode} className="bg-white">
              <td className="px-3 py-2 font-semibold text-ink-900">{r.sizeCode}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.added.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums text-status-good">{r.solved.toLocaleString()}</td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.pending > 0 ? "text-amber-600" : "text-status-good"}`}>
                {r.pending.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ink-50 text-xs font-bold text-ink-800">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(rows, (r) => r.added).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(rows, (r) => r.solved).toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{sumBy(rows, (r) => r.pending).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

// ---------------------------------------------------------------------------
// Lot picker
// ---------------------------------------------------------------------------

export function LotSelect({
  lots,
  value,
  onChange,
  orderId,
  poId,
  allowCreate = false,
  label = "Lot",
}: {
  lots: ProductionLot[];
  value: string;
  onChange: (lotId: string) => void;
  orderId: string;
  poId: string | null;
  allowCreate?: boolean;
  label?: string;
}) {
  const appUser = useEntryUser();
  const createLot = useCreateLot();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [lotNo, setLotNo] = useState("");

  async function handleCreate() {
    const trimmed = lotNo.trim();
    if (!trimmed || !appUser) return;
    if (lots.some((l) => l.lotNo.toLowerCase() === trimmed.toLowerCase())) {
      toast.show(`Lot ${trimmed} already exists on this order.`, "error");
      return;
    }
    try {
      const lot = await createLot.mutateAsync({ orderId, poId, lotNo: trimmed });
      onChange(lot.id);
      setLotNo("");
      setAdding(false);
      toast.show(`Lot ${trimmed} created.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not create the lot.", "error");
    }
  }

  if (adding) {
    return (
      <div className="flex items-end gap-2">
        <Input
          label="New lot number"
          value={lotNo}
          onChange={(e) => setLotNo(e.target.value)}
          placeholder="e.g. LOT-001"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
        />
        <Button type="button" size="sm" onClick={handleCreate} isLoading={createLot.isPending} className="mb-0.5">
          Create
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)} className="mb-0.5">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-[9rem]">
          <option value="">- Select lot -</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lotNo}
            </option>
          ))}
        </Select>
        {allowCreate && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} className="mb-0.5">
            + New Lot
          </Button>
        )}
      </div>
      {!allowCreate && lots.length === 0 && (
        <p className="text-[11px] text-amber-700">
          No lots on this order yet. Lots are created at whichever stage this order designated as the
          lot-origin stage - once it does, they appear here.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger configuration
// ---------------------------------------------------------------------------

export interface LedgerConfig {
  lot: "required" | "optional" | "none";
  size: "required" | "optional" | "none";
  inLabel: string | false;
  outLabel: string | false;
  rejectedLabel: string | false;
  reworkLabel: string | false;
  ref: { label: string; presets: string[]; placeholder?: string } | false;
  docLabel: string | false;
  txnType?: TxnType;
  filterByTxnType?: boolean;
  sizeGrid?: boolean;
  sizeGridOrigin?: boolean;
  lotAvailable?: boolean;
  lotSizeAvailable?: boolean;
  allowCreateLot?: boolean;
  dateField?: boolean;
  reworkTracking?: boolean;
}

export interface GridCell {
  qtyIn: string;
  qtyOut: string;
  rejected: string;
  rework: string;
  reworkAdd: string;
  reworkSolved: string;
}

const BLANK_CELL: GridCell = { qtyIn: "", qtyOut: "", rejected: "", rework: "", reworkAdd: "", reworkSolved: "" };

interface GridRow {
  sizeCode: string;
  target: number;
  cutQty: number;
  done: number;
  rework: number;
  remaining: number;
  over: number;
  isComplete: boolean;
  reworkPending: number;
}

export interface DraftRow {
  key: string;
  lotId: string;
  sizeCode: string;
  qtyIn: string;
  qtyOut: string;
  rejected: string;
  rework: string;
  ref: string;
  doc: string;
  txnType: TxnType;
  entryDate: string;
  notes: string;
}

let draftSeq = 0;

function blankDraft(overrides: Partial<DraftRow> = {}): DraftRow {
  draftSeq += 1;
  return {
    key: `draft-${draftSeq}`,
    lotId: "",
    sizeCode: "",
    qtyIn: "",
    qtyOut: "",
    rejected: "",
    rework: "",
    ref: "",
    doc: "",
    txnType: "process",
    entryDate: new Date().toISOString().slice(0, 10),
    notes: "",
    ...overrides,
  };
}

function draftHasValue(d: DraftRow): boolean {
  return [d.qtyIn, d.qtyOut, d.rejected, d.rework].some((v) => Number(v) > 0);
}

function cellHasValue(c: GridCell | undefined): boolean {
  if (!c) return false;
  return [c.qtyIn, c.qtyOut, c.rejected, c.rework, c.reworkAdd, c.reworkSolved].some((v) => Number(v) > 0);
}

function gridCellDone(
  outLabel: LedgerConfig["outLabel"],
  inLabel: LedgerConfig["inLabel"],
  cell: Pick<LotSizeCell, "qtyOut" | "qtyRejected" | "qtyIn">,
): number {
  if (outLabel) return cell.qtyOut + cell.qtyRejected;
  if (inLabel) return cell.qtyIn;
  return 0;
}

function gridCellAdding(outLabel: LedgerConfig["outLabel"], inLabel: LedgerConfig["inLabel"], cell: GridCell): number {
  if (outLabel) return (Number(cell.qtyOut) || 0) + (Number(cell.rejected) || 0);
  if (inLabel) return Number(cell.qtyIn) || 0;
  return 0;
}

function overrideNote(notes: string, overridden: boolean): string | null {
  const base = notes.trim();
  if (!overridden) return base || null;
  return `${base}${base ? " · " : ""}[Over available - recorded as recovered rework / extra source]`;
}

// ---------------------------------------------------------------------------
// The ledger itself
// ---------------------------------------------------------------------------

export interface StageLedgerProps {
  orderId: string;
  poId: string | null;
  sectionId: string;
  unit: UnitType;
  cs: ChainStage;
  lots: ProductionLot[];
  sizes: { sizeCode: string; quantity: number }[];
  config: LedgerConfig;
  onSaved: () => void;
  children?: ReactNode;
  showDetails: boolean;
}

export interface StageLedgerHandle {
  save: () => Promise<boolean>;
  hasPending: () => boolean;
}

export const StageLedger = forwardRef<StageLedgerHandle, StageLedgerProps>(function StageLedger(
  { orderId, poId, sectionId, unit, cs, lots, sizes, config, onSaved, children, showDetails },
  ref,
) {
  const appUser = useEntryUser();
  const toast = useToast();
  const confirm = useConfirm();
  const createTxns = useCreateTxns();
  const updateTxn = useUpdateTxn();
  const recordAudit = useRecordAudit();

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftRow | null>(null);
  const [gridLotId, setGridLotId] = useState("");
  const [gridCells, setGridCells] = useState<Record<string, GridCell>>({});
  const [gridNotes, setGridNotes] = useState("");
  const [gridRef, setGridRef] = useState("");
  const [gridDoc, setGridDoc] = useState("");
  const [gridDate, setGridDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [allowOverLimit, setAllowOverLimit] = useState(false);
  const [expandedLots, setExpandedLots] = useState<Set<string>>(new Set());

  const gridReady = config.lot === "none" || !!gridLotId;

  const gridRows = useMemo<GridRow[]>(() => {
    if (config.sizeGridOrigin) {
      return sizes.map((s) => {
        const doneAllLots = cs.bySize.find((x) => x.sizeCode === s.sizeCode)?.qtyOut ?? 0;
        const remaining = Math.max(s.quantity - doneAllLots, 0);
        const over = Math.max(doneAllLots - s.quantity, 0);
        return {
          sizeCode: s.sizeCode,
          target: s.quantity,
          cutQty: s.quantity,
          done: doneAllLots,
          rework: 0,
          remaining,
          over,
          isComplete: remaining === 0 && over === 0 && (doneAllLots > 0 || over > 0),
          reworkPending: 0,
        };
      });
    }

    if (config.lot === "none") {
      return cs.bySize.map((s) => {
        const done = gridCellDone(config.outLabel, config.inLabel, s);
        const remaining = Math.max(s.cutQty - done, 0);
        const over = Math.max(done - s.cutQty, 0);
        return {
          sizeCode: s.sizeCode,
          target: s.cutQty,
          cutQty: s.cutQty,
          done,
          rework: 0,
          remaining,
          over,
          isComplete: remaining === 0 && over === 0 && (done > 0 || over > 0),
          reworkPending: cs.reworkBySize.find((r) => r.sizeCode === s.sizeCode)?.pending ?? 0,
        };
      });
    }

    if (!gridLotId) return [];

    return cs.byLotSize
      .filter((c) => c.lotId === gridLotId)
      .map((c) => {
        const done = gridCellDone(config.outLabel, config.inLabel, c);
        const remaining = Math.max(c.available - done, 0);
        const over = Math.max(done - c.available, 0);
        return {
          sizeCode: c.sizeCode,
          target: c.available,
          cutQty: c.cutQty,
          done,
          rework: c.qtyRework,
          remaining,
          over,
          isComplete: remaining === 0 && over === 0 && (done > 0 || over > 0),
          reworkPending: 0,
        };
      });
  }, [gridLotId, sizes, cs.byLotSize, cs.bySize, cs.reworkBySize, config.sizeGridOrigin, config.lot, config.outLabel, config.inLabel]);

  const lotSummary = useMemo(() => {
    if (!gridReady || gridRows.length === 0) return null;

    const cells: { qtyIn: number; qtyOut: number; qtyRejected: number }[] =
      config.lot === "none" ? cs.bySize : cs.byLotSize.filter((c) => c.lotId === gridLotId);
    const entered = cells.reduce(
      (acc, c) => ({ qtyIn: acc.qtyIn + c.qtyIn, qtyOut: acc.qtyOut + c.qtyOut, qtyRejected: acc.qtyRejected + c.qtyRejected }),
      { qtyIn: 0, qtyOut: 0, qtyRejected: 0 },
    );

    const rolled = gridRows.reduce(
      (acc, r) => ({ target: acc.target + r.target, remaining: acc.remaining + r.remaining, rework: acc.rework + r.rework, over: acc.over + r.over }),
      { target: 0, remaining: 0, rework: 0, over: 0 },
    );

    const status =
      rolled.over > 0
        ? "Over-recorded"
        : gridRows.every((r) => r.isComplete)
          ? "Complete"
          : gridRows.some((r) => r.done > 0)
            ? "In Progress"
            : "Not Started";

    return { ...entered, ...rolled, status };
  }, [gridReady, gridLotId, gridRows, cs.byLotSize, cs.bySize, config.lot]);

  const visibleTxns = useMemo(
    () => (config.filterByTxnType && config.txnType ? cs.txns.filter((t) => t.txnType === config.txnType) : cs.txns),
    [cs.txns, config.filterByTxnType, config.txnType],
  );

  const refPresets = useMemo(() => {
    if (!config.ref) return [];
    const seen = new Set(config.ref.presets);
    for (const t of cs.txns) if (t.refName) seen.add(t.refName);
    return Array.from(seen);
  }, [config.ref, cs.txns]);

  const entryLotGroups = useMemo(() => {
    const map = new Map<
      string,
      { lotId: string; lotNo: string; sizes: Set<string>; qtyIn: number; qtyOut: number; qtyRejected: number; qtyRework: number; lastDate: string }
    >();
    for (const t of visibleTxns) {
      const lotId = t.lotId ?? "";
      const row = map.get(lotId) ?? {
        lotId,
        lotNo: lots.find((l) => l.id === lotId)?.lotNo ?? "No lot",
        sizes: new Set<string>(),
        qtyIn: 0,
        qtyOut: 0,
        qtyRejected: 0,
        qtyRework: 0,
        lastDate: t.entryDate,
      };
      if (t.sizeCode) row.sizes.add(t.sizeCode);
      row.qtyIn += t.qtyIn;
      row.qtyOut += t.qtyOut;
      row.qtyRejected += t.qtyRejected;
      row.qtyRework += t.qtyRework;
      if (t.entryDate > row.lastDate) row.lastDate = t.entryDate;
      map.set(lotId, row);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, sizeCount: r.sizes.size }))
      .sort((a, b) => a.lotNo.localeCompare(b.lotNo));
  }, [visibleTxns, lots]);

  const detailTxns = useMemo(
    () => (config.sizeGrid ? visibleTxns.filter((t) => expandedLots.has(t.lotId ?? "")) : visibleTxns),
    [config.sizeGrid, visibleTxns, expandedLots],
  );

  const isSaving = createTxns.isPending || updateTxn.isPending;

  function addDraft() {
    setDrafts((prev) => [...prev, blankDraft({ txnType: config.txnType ?? "process", lotId: prev[prev.length - 1]?.lotId ?? "" })]);
  }

  function patchDraft(key: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  const lotFlow = (lotId: string) => cs.byLot.find((l) => l.lotId === lotId) ?? null;
  const lotSizeCell = (lotId: string, sizeCode: string) => cs.byLotSize.find((c) => c.lotId === lotId && c.sizeCode === sizeCode) ?? null;

  function patchCell(sizeCode: string, patch: Partial<GridCell>) {
    setGridCells((prev) => ({ ...prev, [sizeCode]: { ...BLANK_CELL, ...prev[sizeCode], ...patch } }));
  }

  function toTxn(d: DraftRow): NewTxn {
    return {
      orderId,
      poId,
      sectionId,
      lotId: d.lotId || null,
      sizeCode: d.sizeCode || null,
      txnType: d.txnType,
      unit,
      qtyIn: config.inLabel ? Number(d.qtyIn) || 0 : 0,
      qtyOut: config.outLabel ? Number(d.qtyOut) || 0 : 0,
      qtyRejected: config.rejectedLabel ? Number(d.rejected) || 0 : 0,
      qtyRework: config.reworkLabel ? Number(d.rework) || 0 : 0,
      refName: d.ref.trim() || null,
      docNo: d.doc.trim() || null,
      entryDate: d.entryDate,
      notes: d.notes.trim() || null,
      enteredBy: appUser!.id,
      isJobWork: false,
    };
  }

  async function saveDrafts(): Promise<boolean> {
    if (!appUser) return false;
    const usable = drafts.filter(draftHasValue);
    if (usable.length === 0) return true;
    if (config.lot === "required" && usable.some((d) => !d.lotId)) {
      toast.show("Every entry needs a lot - select one or create a new lot.", "error");
      return false;
    }
    if (config.size === "required" && usable.some((d) => !d.sizeCode)) {
      toast.show("Every entry needs a size.", "error");
      return false;
    }
    if (usable.some((d) => !d.notes.trim())) {
      toast.show("Add a note for every entry.", "error");
      return false;
    }

    if (config.lotSizeAvailable && !allowOverLimit) {
      const addedPerCell = new Map<string, number>();
      for (const d of usable) {
        if (!d.lotId || !d.sizeCode) continue;
        const key = `${d.lotId}::${d.sizeCode}`;
        const qty = (Number(d.qtyOut) || 0) + (Number(d.qtyIn) || 0);
        addedPerCell.set(key, (addedPerCell.get(key) ?? 0) + qty);
      }
      for (const [key, adding] of addedPerCell) {
        const [lotId, sizeCode] = key.split("::");
        const cell = lotSizeCell(lotId, sizeCode);
        if (!cell || cell.available <= 0) continue;
        const remaining = Math.max(cell.available - cell.qtyOut - cell.qtyRejected, 0);
        if (adding > remaining) {
          toast.show(
            `${cell.lotNo} / size ${sizeCode}: only ${remaining.toLocaleString()} ${unit} of the ${cell.available.toLocaleString()} accepted by the previous section can still be sent - you entered ${adding.toLocaleString()}.`,
            "error",
          );
          return false;
        }
      }
    }

    if (config.lotAvailable) {
      const fieldOf = (d: DraftRow) => (config.inLabel ? Number(d.qtyIn) : Number(d.qtyOut)) || 0;
      const addedPerLot = new Map<string, number>();
      for (const d of usable) {
        if (!d.lotId) continue;
        addedPerLot.set(d.lotId, (addedPerLot.get(d.lotId) ?? 0) + fieldOf(d));
      }
      for (const [lotId, adding] of addedPerLot) {
        const flow = lotFlow(lotId);
        if (!flow || flow.available <= 0) continue;
        if (adding > flow.remainingAvailable) {
          toast.show(
            `Lot ${flow.lotNo}: only ${flow.remainingAvailable.toLocaleString()} ${unit} still available of the ${flow.available.toLocaleString()} ${unit} received from the previous section - you entered ${adding.toLocaleString()}.`,
            "error",
          );
          return false;
        }
      }
    }

    try {
      const rows = usable.map(toTxn);
      await createTxns.mutateAsync(rows);
      await recordAudit.mutateAsync({
        orderId,
        poId,
        sectionId,
        entity: "production_txn",
        entityId: null,
        action: "create",
        summary: `${usable.length} entr${usable.length === 1 ? "y" : "ies"} added - ${rows.reduce((total, r) => total + r.qtyOut + r.qtyIn, 0).toLocaleString()} ${unit}`,
        changes: null,
        notes: usable.map((d) => d.notes).filter(Boolean).join(" · ") || null,
      });
      setDrafts([]);
      onSaved();
      toast.show(`${usable.length} entr${usable.length === 1 ? "y" : "ies"} saved.`, "success");
      return true;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the entries.", "error");
      return false;
    }
  }

  async function saveGrid(): Promise<boolean> {
    if (!appUser) return false;

    const typedRows = gridRows.filter((r) => cellHasValue(gridCells[r.sizeCode]));
    if (typedRows.length === 0) return true;
    if (config.lot !== "none" && !gridLotId) {
      toast.show("Select a lot first.", "error");
      return false;
    }
    const entryDate = config.dateField ? gridDate : new Date().toISOString().slice(0, 10);
    if (!gridNotes.trim()) {
      toast.show("Add a note for this entry.", "error");
      return false;
    }

    if (!allowOverLimit) {
      const breaches = typedRows
        .map((r) => {
          const cell = gridCells[r.sizeCode] ?? BLANK_CELL;
          const adding = gridCellAdding(config.outLabel, config.inLabel, cell);
          return { row: r, adding, excess: adding - r.remaining };
        })
        .filter((b) => b.excess > 0);

      if (breaches.length > 0) {
        const { row, adding } = breaches[0];
        const ceiling = config.sizeGridOrigin || config.lot === "none" ? `the ${row.target.toLocaleString()} cut for that size` : `the ${row.target.toLocaleString()} the previous section sent on`;
        toast.show(
          `Size ${row.sizeCode}: only ${row.remaining.toLocaleString()} ${unit} left of ${ceiling} - you entered ${adding.toLocaleString()}.${
            config.sizeGridOrigin ? "" : ' Tick "recovered rework / extra source" if this is genuinely extra.'
          }`,
          "error",
        );
        return false;
      }
    }

    const rows: NewTxn[] = typedRows.map((r) => {
      const cell = gridCells[r.sizeCode] ?? BLANK_CELL;
      return {
        orderId,
        poId,
        sectionId,
        lotId: config.lot === "none" ? null : gridLotId,
        sizeCode: r.sizeCode,
        txnType: config.txnType ?? "process",
        unit,
        qtyIn: config.inLabel ? Number(cell.qtyIn) || 0 : 0,
        qtyOut: config.outLabel ? Number(cell.qtyOut) || 0 : 0,
        qtyRejected: config.rejectedLabel ? Number(cell.rejected) || 0 : 0,
        qtyRework: config.reworkLabel ? Number(cell.rework) || 0 : 0,
        refName: config.ref ? gridRef.trim() || null : null,
        docNo: config.docLabel ? gridDoc.trim() || null : null,
        entryDate,
        notes: overrideNote(gridNotes, allowOverLimit),
        enteredBy: appUser!.id,
        isJobWork: false,
      };
    });

    const reworkRows: NewTxn[] = typedRows.flatMap((r) => {
      const cell = gridCells[r.sizeCode] ?? BLANK_CELL;
      const added = Number(cell.reworkAdd) || 0;
      const solved = Number(cell.reworkSolved) || 0;
      if (added === 0 && solved === 0) return [];
      return [
        {
          orderId,
          poId,
          sectionId,
          lotId: null,
          sizeCode: r.sizeCode,
          txnType: "rework" as const,
          unit,
          qtyIn: added,
          qtyOut: solved,
          qtyRejected: 0,
          qtyRework: 0,
          refName: config.ref ? gridRef.trim() || null : null,
          docNo: config.docLabel ? gridDoc.trim() || null : null,
          entryDate,
          notes: gridNotes.trim() || null,
          enteredBy: appUser!.id,
          isJobWork: false,
        },
      ];
    });

    const total = rows.reduce((sum, r) => sum + (r.qtyOut || r.qtyIn), 0);
    const lotNo = lots.find((l) => l.id === gridLotId)?.lotNo ?? "";
    const subject = config.lot === "none" ? gridRef.trim() || "This entry" : `Lot ${lotNo}`;
    const hasMainQty = rows.some((r) => r.qtyIn > 0 || r.qtyOut > 0 || r.qtyRejected > 0 || r.qtyRework > 0);

    try {
      await createTxns.mutateAsync([...rows, ...reworkRows]);
      if (hasMainQty) {
        await recordAudit.mutateAsync({
          orderId,
          poId,
          sectionId,
          entity: "production_txn",
          entityId: null,
          action: "create",
          summary: `${subject}: ${total.toLocaleString()} ${unit} across ${rows.length} size${rows.length === 1 ? "" : "s"}${allowOverLimit ? " (over available - override)" : ""}`,
          changes: null,
          notes: overrideNote(gridNotes, allowOverLimit),
        });
      }
      if (reworkRows.length > 0) {
        const reworkAdded = reworkRows.reduce((s, r) => s + r.qtyIn, 0);
        const reworkSolved = reworkRows.reduce((s, r) => s + r.qtyOut, 0);
        const bits = [reworkAdded > 0 ? `+${reworkAdded} to rework` : null, reworkSolved > 0 ? `${reworkSolved} solved` : null].filter(Boolean).join(", ");
        await recordAudit.mutateAsync({
          orderId,
          poId,
          sectionId,
          entity: "production_txn",
          entityId: null,
          action: "create",
          summary: `${subject}: rework - ${bits} across ${reworkRows.length} size${reworkRows.length === 1 ? "" : "s"}`,
          changes: null,
          notes: gridNotes.trim() || null,
        });
      }
      setGridCells({});
      setGridNotes("");
      setGridRef("");
      setGridDoc("");
      setGridDate(new Date().toISOString().slice(0, 10));
      setAllowOverLimit(false);
      onSaved();
      toast.show(hasMainQty ? `${subject} recorded - ${total.toLocaleString()} ${unit}.` : `${subject}: rework recorded.`, "success");
      return true;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not save the entry.", "error");
      return false;
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      save: () => (config.sizeGrid ? saveGrid() : saveDrafts()),
      hasPending: () => (config.sizeGrid ? gridRows.some((r) => cellHasValue(gridCells[r.sizeCode])) : drafts.some(draftHasValue)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.sizeGrid, drafts, gridCells, gridRows, gridLotId, gridNotes, allowOverLimit],
  );

  function beginEdit(t: ProductionTxn) {
    setEditingId(t.id);
    setEditDraft({
      key: t.id,
      lotId: t.lotId ?? "",
      sizeCode: t.sizeCode ?? "",
      qtyIn: t.qtyIn ? String(t.qtyIn) : "",
      qtyOut: t.qtyOut ? String(t.qtyOut) : "",
      rejected: t.qtyRejected ? String(t.qtyRejected) : "",
      rework: t.qtyRework ? String(t.qtyRework) : "",
      ref: t.refName ?? "",
      doc: t.docNo ?? "",
      txnType: t.txnType,
      entryDate: t.entryDate,
      notes: "",
    });
  }

  async function saveEdit(original: ProductionTxn) {
    if (!editDraft || !appUser) return;
    if (!editDraft.notes.trim()) {
      toast.show("Add a note explaining the correction - it's kept in the audit trail.", "error");
      return;
    }

    const patch = {
      lotId: editDraft.lotId || null,
      sizeCode: editDraft.sizeCode || null,
      qtyIn: config.inLabel ? Number(editDraft.qtyIn) || 0 : 0,
      qtyOut: config.outLabel ? Number(editDraft.qtyOut) || 0 : 0,
      qtyRejected: config.rejectedLabel ? Number(editDraft.rejected) || 0 : 0,
      qtyRework: config.reworkLabel ? Number(editDraft.rework) || 0 : 0,
      refName: editDraft.ref.trim() || null,
      docNo: editDraft.doc.trim() || null,
      entryDate: editDraft.entryDate,
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
                <b>{field.replace(/([A-Z])/g, " $1")}</b>: {String(c.from ?? "-")} → {String(c.to ?? "-")}
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
        summary: `Entry of ${formatDisplayDate(original.entryDate)} corrected`,
        changes,
        notes: editDraft.notes.trim(),
      });
      setEditingId(null);
      setEditDraft(null);
      onSaved();
      toast.show("Entry updated.", "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not update the entry.", "error");
    }
  }

  const lotName = (id: string | null) => lots.find((l) => l.id === id)?.lotNo ?? "-";
  const showLot = config.lot !== "none";
  const showSize = config.size !== "none" && !config.sizeGrid;

  return (
    <div className="space-y-5">
      {showDetails && (
        <>
          <ChainStrip cs={cs} />
          {children}
          {showLot && cs.byLot.length > 0 && (
            <Section title="Lot-wise position">
              <LotSummaryTable cs={cs} />
            </Section>
          )}
          {config.size !== "none" && cs.bySize.length > 0 && (
            <Section title="Size-wise position">
              <SizeSummaryTable cs={cs} />
            </Section>
          )}
        </>
      )}

      <Section
        title="Entries"
        subtitle={
          config.sizeGrid
            ? "One row per lot. Open a lot to see its size-wise detail; every entry is kept and corrections are recorded against the original."
            : "Every entry is kept. Corrections are recorded against the original, never in place of it."
        }
      >
        {config.sizeGrid && entryLotGroups.length > 0 && (
          <div className="mb-3 overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2 text-left font-semibold">Lot</th>
                  <th className="px-3 py-2 text-right font-semibold">Sizes</th>
                  {config.inLabel && <th className="px-3 py-2 text-right font-semibold">{config.inLabel}</th>}
                  {config.outLabel && <th className="px-3 py-2 text-right font-semibold">{config.outLabel}</th>}
                  {config.rejectedLabel && <th className="px-3 py-2 text-right font-semibold">{config.rejectedLabel}</th>}
                  {config.reworkLabel && <th className="px-3 py-2 text-right font-semibold">{config.reworkLabel}</th>}
                  <th className="px-3 py-2 text-left font-semibold">Last entry</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {entryLotGroups.map((g) => {
                  const open = expandedLots.has(g.lotId);
                  return (
                    <tr key={g.lotId} className="bg-white">
                      <td className="px-3 py-2 font-semibold text-ink-900">{g.lotNo}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-500">{g.sizeCount}</td>
                      {config.inLabel && <td className="px-3 py-2 text-right tabular-nums">{g.qtyIn.toLocaleString()}</td>}
                      {config.outLabel && <td className="px-3 py-2 text-right tabular-nums text-status-good">{g.qtyOut.toLocaleString()}</td>}
                      {config.rejectedLabel && <td className="px-3 py-2 text-right tabular-nums text-status-bad">{g.qtyRejected.toLocaleString()}</td>}
                      {config.reworkLabel && <td className="px-3 py-2 text-right tabular-nums text-amber-600">{g.qtyRework.toLocaleString()}</td>}
                      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{formatDisplayDate(g.lastDate)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedLots((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.lotId)) next.delete(g.lotId);
                              else next.add(g.lotId);
                              return next;
                            })
                          }
                        >
                          {open ? "Hide" : "Show More"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {detailTxns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-400">
            {config.sizeGrid && entryLotGroups.length > 0 ? "Open a lot above to see its size-wise entries." : "Nothing recorded here yet."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  {showLot && <th className="px-3 py-2 text-left font-semibold">Lot</th>}
                  {config.size !== "none" && <th className="px-3 py-2 text-left font-semibold">Size</th>}
                  {config.ref && <th className="px-3 py-2 text-left font-semibold">{config.ref.label}</th>}
                  {config.docLabel && <th className="px-3 py-2 text-left font-semibold">{config.docLabel}</th>}
                  {config.inLabel && <th className="px-3 py-2 text-right font-semibold">{config.inLabel}</th>}
                  {config.outLabel && <th className="px-3 py-2 text-right font-semibold">{config.outLabel}</th>}
                  {config.rejectedLabel && <th className="px-3 py-2 text-right font-semibold">{config.rejectedLabel}</th>}
                  <th className="px-3 py-2 text-right font-semibold">Cumulative</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {detailTxns.map((t) => {
                  const i = visibleTxns.indexOf(t);
                  const cumulative = visibleTxns.slice(0, i + 1).reduce((total, x) => total + (config.outLabel ? x.qtyOut : x.qtyIn), 0);
                  const isEditing = editingId === t.id;

                  if (isEditing && editDraft) {
                    return (
                      <tr key={t.id} className="bg-amber-50/60">
                        <td colSpan={12} className="px-3 py-3">
                          <div className="space-y-3">
                            <p className="text-xs font-semibold text-amber-800">Correcting the entry of {formatDisplayDate(t.entryDate)}</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {showLot && (
                                <Select label="Lot" value={editDraft.lotId} onChange={(e) => setEditDraft({ ...editDraft, lotId: e.target.value })}>
                                  <option value="">-</option>
                                  {lots.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.lotNo}
                                    </option>
                                  ))}
                                </Select>
                              )}
                              {config.size !== "none" && (
                                <Select label="Size" value={editDraft.sizeCode} onChange={(e) => setEditDraft({ ...editDraft, sizeCode: e.target.value })}>
                                  <option value="">-</option>
                                  {sizes.map((s) => (
                                    <option key={s.sizeCode} value={s.sizeCode}>
                                      {s.sizeCode}
                                    </option>
                                  ))}
                                </Select>
                              )}
                              {config.inLabel && (
                                <Input label={config.inLabel} type="number" min={0} value={editDraft.qtyIn} onChange={(e) => setEditDraft({ ...editDraft, qtyIn: e.target.value })} />
                              )}
                              {config.outLabel && (
                                <Input label={config.outLabel} type="number" min={0} value={editDraft.qtyOut} onChange={(e) => setEditDraft({ ...editDraft, qtyOut: e.target.value })} />
                              )}
                              {config.rejectedLabel && (
                                <Input label={config.rejectedLabel} type="number" min={0} value={editDraft.rejected} onChange={(e) => setEditDraft({ ...editDraft, rejected: e.target.value })} />
                              )}
                              <Input label="Date" type="date" value={editDraft.entryDate} onChange={(e) => setEditDraft({ ...editDraft, entryDate: e.target.value })} />
                            </div>
                            <Textarea
                              label="Reason for the correction (required)"
                              required
                              rows={2}
                              value={editDraft.notes}
                              onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                              placeholder="e.g. Recount after weighbridge - 12 KG more than first recorded"
                            />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={() => saveEdit(t)} isLoading={isSaving}>
                                Save correction
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={t.id} className="bg-white">
                      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{formatDisplayDate(t.entryDate)}</td>
                      {showLot && <td className="px-3 py-2 font-medium text-ink-900">{lotName(t.lotId)}</td>}
                      {config.size !== "none" && <td className="px-3 py-2 font-medium">{t.sizeCode ?? "-"}</td>}
                      {config.ref && <td className="px-3 py-2">{t.refName ?? "-"}</td>}
                      {config.docLabel && <td className="px-3 py-2">{t.docNo ?? "-"}</td>}
                      {config.inLabel && <td className="px-3 py-2 text-right tabular-nums">{t.qtyIn.toLocaleString()}</td>}
                      {config.outLabel && <td className="px-3 py-2 text-right tabular-nums text-status-good">{t.qtyOut.toLocaleString()}</td>}
                      {config.rejectedLabel && <td className="px-3 py-2 text-right tabular-nums text-status-bad">{t.qtyRejected.toLocaleString()}</td>}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{cumulative.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {t.txnType !== "process" && <Badge tone={t.txnType === "send" ? "external" : "good"}>{t.txnType}</Badge>}
                          <Button type="button" variant="ghost" size="sm" onClick={() => beginEdit(t)}>
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {config.sizeGrid ? (
        <Section
          title="Add new entry"
          subtitle={config.lot === "none" ? "Enter the quantity for every size in one table - there's no lot to pick here." : "Pick the lot - its sizes and quantities are already known, so there's nothing to re-select."}
        >
          <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            {config.lot !== "none" && (
              <LotSelect lots={lots} value={gridLotId} onChange={setGridLotId} orderId={orderId} poId={poId} allowCreate={config.allowCreateLot ?? false} />
            )}

            {(config.ref || config.docLabel || config.dateField) && (
              <div className={`grid grid-cols-1 gap-2 ${config.dateField ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {config.ref && (
                  <Input
                    label={config.ref.label}
                    value={gridRef}
                    onChange={(e) => setGridRef(e.target.value)}
                    placeholder={config.ref.placeholder ?? "Type or pick"}
                    list={config.ref.presets.length ? `grid-ref-${sectionId}` : undefined}
                  />
                )}
                {config.ref && config.ref.presets.length > 0 && (
                  <datalist id={`grid-ref-${sectionId}`}>
                    {config.ref.presets.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                )}
                {config.docLabel && <Input label={config.docLabel} value={gridDoc} onChange={(e) => setGridDoc(e.target.value)} />}
                {config.dateField && <Input label="Date" type="date" value={gridDate} onChange={(e) => setGridDate(e.target.value)} />}
              </div>
            )}

            {lotSummary && (
              <div className="rounded-lg border border-white/80 bg-white p-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  {config.lot === "none" ? "So far at this stage" : "This lot so far, at this stage"}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <MiniStat label={config.sizeGridOrigin || config.lot === "none" ? "Cut Qty" : "Available"} value={lotSummary.target} unit={unit} />
                  {config.inLabel && <MiniStat label={config.inLabel} value={lotSummary.qtyIn} unit={unit} />}
                  {config.outLabel && <MiniStat label={config.outLabel} value={lotSummary.qtyOut} unit={unit} tone="good" />}
                  {config.rejectedLabel && <MiniStat label={config.rejectedLabel} value={lotSummary.qtyRejected} unit={unit} tone="bad" />}
                  {config.reworkLabel && <MiniStat label={config.reworkLabel} value={lotSummary.rework} unit={unit} tone="warn" />}
                  <MiniStat label="Remaining" value={lotSummary.remaining} unit={unit} tone={lotSummary.remaining > 0 ? "warn" : "good"} />
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Status</p>
                    <Badge tone={lotSummary.status === "Over-recorded" ? "bad" : lotSummary.status === "Complete" ? "good" : lotSummary.status === "In Progress" ? "warn" : "neutral"}>
                      {lotSummary.status}
                    </Badge>
                  </div>
                </div>

                {lotSummary.over > 0 && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-snug text-red-800">
                    <b>{lotSummary.over.toLocaleString()} {unit} more has been recorded than this lot was given.</b> Almost always a
                    batch entered twice - open the lot in the Entries list above and correct or remove the duplicate. New entries are
                    blocked for the affected sizes until the totals agree.
                  </p>
                )}
              </div>
            )}

            {gridReady && gridRows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-200 px-3 py-5 text-center text-sm text-ink-400">
                {config.lot === "none" ? "No sizes are set up for this order yet - add the size breakdown before entering here." : "Nothing has reached this lot yet - the size-origin stage hasn't recorded any sizes for it."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-ink-100 bg-white">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="px-3 py-2 text-left font-semibold">Size</th>
                      <th className="px-3 py-2 text-right font-semibold">{config.sizeGridOrigin ? "Target Qty" : "Cut Qty"}</th>
                      {!config.sizeGridOrigin && config.lot !== "none" && <th className="px-3 py-2 text-right font-semibold">Available</th>}
                      {config.lot !== "none" && (
                        <>
                          <th className="px-3 py-2 text-right font-semibold">Done so far</th>
                          <th className="px-3 py-2 text-right font-semibold">Remaining</th>
                        </>
                      )}
                      {config.reworkLabel && <th className="px-3 py-2 text-right font-semibold">{config.reworkLabel} held</th>}
                      {config.inLabel && <th className="px-3 py-2 text-right font-semibold">{config.inLabel}</th>}
                      {config.outLabel && <th className="px-3 py-2 text-right font-semibold">{config.outLabel}</th>}
                      {config.rejectedLabel && <th className="px-3 py-2 text-right font-semibold">{config.rejectedLabel}</th>}
                      {config.reworkLabel && <th className="px-3 py-2 text-right font-semibold">{config.reworkLabel}</th>}
                      {config.reworkTracking && (
                        <>
                          <th className="px-3 py-2 text-right font-semibold">Rework</th>
                          <th className="px-3 py-2 text-right font-semibold">Rework Solved</th>
                        </>
                      )}
                      <th className="px-3 py-2 text-right font-semibold">Balance after</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {gridRows.map((r) => {
                      const cell = gridCells[r.sizeCode] ?? BLANK_CELL;
                      const adding = gridCellAdding(config.outLabel, config.inLabel, cell);
                      const balance = r.remaining - adding;
                      const over = balance < 0;
                      const closed = r.remaining === 0 && (r.done > 0 || r.over > 0);
                      const inputCells = closed ? (
                        <td className="px-3 py-1.5 text-right" colSpan={(config.inLabel ? 1 : 0) + (config.outLabel ? 1 : 0) + (config.rejectedLabel ? 1 : 0) + (config.reworkLabel ? 1 : 0)}>
                          {r.over > 0 ? <Badge tone="bad">Over by {r.over.toLocaleString()}</Badge> : <Badge tone="good">Complete</Badge>}
                        </td>
                      ) : (
                        <>
                          {config.inLabel && (
                            <GridInput
                              value={cell.qtyIn}
                              onChange={(v) => patchCell(r.sizeCode, { qtyIn: v })}
                              invalid={!config.outLabel && over}
                              max={!config.outLabel ? r.remaining : undefined}
                            />
                          )}
                          {config.outLabel && <GridInput value={cell.qtyOut} onChange={(v) => patchCell(r.sizeCode, { qtyOut: v })} invalid={over} max={r.remaining} />}
                          {config.rejectedLabel && <GridInput value={cell.rejected} onChange={(v) => patchCell(r.sizeCode, { rejected: v })} invalid={over} />}
                          {config.reworkLabel && <GridInput value={cell.rework} onChange={(v) => patchCell(r.sizeCode, { rework: v })} />}
                        </>
                      );

                      return (
                        <tr key={r.sizeCode} className={over || r.over > 0 ? "bg-red-50/50" : r.isComplete ? "bg-green-50/40" : undefined}>
                          <td className="px-3 py-1.5 font-semibold text-ink-900">{r.sizeCode}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-ink-500">{r.cutQty.toLocaleString()}</td>
                          {!config.sizeGridOrigin && config.lot !== "none" && <td className="px-3 py-1.5 text-right font-medium tabular-nums text-ink-700">{r.target.toLocaleString()}</td>}
                          {config.lot !== "none" && (
                            <>
                              <td className={`px-3 py-1.5 text-right tabular-nums ${r.over > 0 ? "font-semibold text-status-bad" : ""}`}>{r.done.toLocaleString()}</td>
                              <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${r.remaining > 0 ? "text-amber-600" : "text-status-good"}`}>{r.remaining.toLocaleString()}</td>
                            </>
                          )}
                          {config.reworkLabel && <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{r.rework > 0 ? r.rework.toLocaleString() : "-"}</td>}
                          {inputCells}
                          {config.reworkTracking && (
                            <>
                              <GridInput value={cell.reworkAdd} onChange={(v) => patchCell(r.sizeCode, { reworkAdd: v })} hint={`Pending ${r.reworkPending.toLocaleString()}`} />
                              <GridInput value={cell.reworkSolved} onChange={(v) => patchCell(r.sizeCode, { reworkSolved: v })} />
                            </>
                          )}
                          <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${over ? "text-status-bad" : balance > 0 ? "text-amber-600" : "text-status-good"}`}>{balance.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <Textarea label="Notes" required rows={2} value={gridNotes} onChange={(e) => setGridNotes(e.target.value)} placeholder="Anything the next stage should know about this lot" />

            {!config.sizeGridOrigin && (
              <label className="flex items-start gap-2 text-[11px] text-ink-600">
                <input type="checkbox" checked={allowOverLimit} onChange={(e) => setAllowOverLimit(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-amber-600" />
                <span>
                  <b>Recovered rework / extra source.</b> Tick only if this quantity genuinely comes from outside what the previous
                  stage sent on - it lifts the available-quantity limit and is recorded on the entry.
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={saveGrid} isLoading={isSaving}>
                Save Entry
              </Button>
              <p className="text-[11px] text-ink-500">
                Saves this lot without moving the stage on. Use the <b>Move Forward</b> buttons below to record and hand off in one step.
              </p>
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Add new entry" subtitle="Each row is saved as its own record - nothing above is replaced.">
          <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            {drafts.map((d, i) => (
              <div key={d.key} className="rounded-lg border border-ink-100 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-400">Entry #{i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" className="text-status-bad hover:bg-red-50" onClick={() => removeDraft(d.key)}>
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {showLot && (
                    <div className="col-span-2">
                      <LotSelect lots={lots} value={d.lotId} onChange={(v) => patchDraft(d.key, { lotId: v })} orderId={orderId} poId={poId} allowCreate={config.allowCreateLot ?? false} />
                      {config.lotAvailable && d.lotId && <LotAvailableHint flow={lotFlow(d.lotId)} unit={unit} />}
                    </div>
                  )}
                  {showSize && (
                    <div>
                      <Select label="Size" value={d.sizeCode} onChange={(e) => patchDraft(d.key, { sizeCode: e.target.value })}>
                        <option value="">- Select -</option>
                        {sizes.map((s) => (
                          <option key={s.sizeCode} value={s.sizeCode}>
                            {s.sizeCode}
                          </option>
                        ))}
                      </Select>
                      {config.lotSizeAvailable && d.lotId && d.sizeCode && <CellAvailableHint cell={lotSizeCell(d.lotId, d.sizeCode)} unit={unit} />}
                    </div>
                  )}
                  {config.ref && (
                    <div>
                      <Input label={config.ref.label} list={`ref-${sectionId}`} value={d.ref} onChange={(e) => patchDraft(d.key, { ref: e.target.value })} placeholder={config.ref.placeholder ?? "Type or pick"} />
                      <datalist id={`ref-${sectionId}`}>
                        {refPresets.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                  )}
                  {config.docLabel && <Input label={config.docLabel} value={d.doc} onChange={(e) => patchDraft(d.key, { doc: e.target.value })} />}
                  {config.inLabel && <Input label={`${config.inLabel} (${unit})`} type="number" min={0} value={d.qtyIn} onChange={(e) => patchDraft(d.key, { qtyIn: e.target.value })} />}
                  {config.outLabel && <Input label={`${config.outLabel} (${unit})`} type="number" min={0} value={d.qtyOut} onChange={(e) => patchDraft(d.key, { qtyOut: e.target.value })} />}
                  {config.rejectedLabel && <Input label={config.rejectedLabel} type="number" min={0} value={d.rejected} onChange={(e) => patchDraft(d.key, { rejected: e.target.value })} />}
                  {config.reworkLabel && <Input label={config.reworkLabel} type="number" min={0} value={d.rework} onChange={(e) => patchDraft(d.key, { rework: e.target.value })} />}
                  <Input label="Date" type="date" value={d.entryDate} onChange={(e) => patchDraft(d.key, { entryDate: e.target.value })} />
                </div>
                <div className="mt-2">
                  <Input label="Notes" required value={d.notes} onChange={(e) => patchDraft(d.key, { notes: e.target.value })} placeholder="Kept with this entry in the history" />
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={addDraft}>
                + Add New Entry
              </Button>
              {drafts.length > 0 && (
                <>
                  <Button type="button" size="sm" onClick={saveDrafts} isLoading={isSaving}>
                    {drafts.length > 1 ? `Save ${drafts.length} Entries` : "Save Entry"}
                  </Button>
                  <p className="text-[11px] text-ink-500">
                    Saves what you&apos;ve typed without moving the stage on. Use a <b>Move Forward</b> button below to record and hand off in one step.
                  </p>
                </>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
});

function LotAvailableHint({ flow, unit }: { flow: LotFlow | null; unit: UnitType }) {
  if (!flow) return null;
  if (flow.available <= 0) {
    return <p className="mt-1 text-[11px] text-ink-400">No quantity carried forward for this lot yet - the previous section hasn&apos;t recorded what it received.</p>;
  }
  const recorded = flow.qtyIn > 0 ? flow.qtyIn : flow.qtyOut;
  const exhausted = flow.remainingAvailable <= 0;
  return (
    <p className="mt-1 text-[11px] leading-snug">
      <span className="text-ink-500">Received from previous section </span>
      <b className="tabular-nums text-ink-800">{flow.available.toLocaleString()} {unit}</b>
      {recorded > 0 && (
        <>
          <span className="text-ink-500"> · already recorded here </span>
          <b className="tabular-nums text-ink-800">{recorded.toLocaleString()} {unit}</b>
        </>
      )}
      <span className="text-ink-500"> · </span>
      <b className={`tabular-nums ${exhausted ? "text-status-good" : "text-amber-700"}`}>
        {exhausted ? "fully accounted for" : `${flow.remainingAvailable.toLocaleString()} ${unit} still available`}
      </b>
    </p>
  );
}

function CellAvailableHint({ cell, unit }: { cell: LotSizeCell | null; unit: UnitType }) {
  if (!cell) return <p className="mt-1 text-[11px] text-ink-400">Nothing carried forward for this lot and size yet.</p>;
  const done = cell.qtyOut + cell.qtyRejected;
  const remaining = Math.max(cell.available - done, 0);
  return (
    <p className="mt-1 text-[11px] leading-snug">
      <span className="text-ink-500">Available </span>
      <b className="tabular-nums text-ink-800">{cell.available.toLocaleString()} {unit}</b>
      {done > 0 && (
        <>
          <span className="text-ink-500"> · sent </span>
          <b className="tabular-nums text-ink-800">{done.toLocaleString()}</b>
        </>
      )}
      <span className="text-ink-500"> · </span>
      <b className={`tabular-nums ${remaining > 0 ? "text-amber-700" : "text-status-good"}`}>{remaining > 0 ? `${remaining.toLocaleString()} ${unit} can be sent` : "fully sent"}</b>
    </p>
  );
}

function GridInput({
  value,
  onChange,
  invalid = false,
  max,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  max?: number;
  hint?: ReactNode;
}) {
  return (
    <td className="px-3 py-1.5 text-right">
      {hint && <div className="mb-0.5 text-[10px] text-ink-400">{hint}</div>}
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-24 rounded-lg border px-2 py-1 text-right text-sm outline-none focus:border-brand ${invalid ? "border-status-bad bg-red-50" : "border-ink-200"}`}
      />
    </td>
  );
}

function MiniStat({ label, value, unit, tone }: { label: string; value: number; unit: UnitType; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-status-good" : tone === "bad" ? "text-status-bad" : tone === "warn" ? "text-amber-600" : "text-ink-900";
  return (
    <div>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
        <span className="ml-0.5 text-[9px] font-medium text-ink-400">{unit}</span>
      </p>
    </div>
  );
}

export function DirectionPanel({
  direction,
  step,
  title,
  subtitle,
  children,
}: {
  direction: "out" | "in" | "neutral";
  step?: number;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const skin =
    direction === "out"
      ? { frame: "border-sky-400 bg-sky-50/40", band: "bg-sky-100/80", chip: "bg-sky-600", text: "text-sky-900", arrow: "→" }
      : direction === "in"
        ? { frame: "border-emerald-500 bg-emerald-50/40", band: "bg-emerald-100/80", chip: "bg-emerald-600", text: "text-emerald-900", arrow: "←" }
        : { frame: "border-ink-300 bg-ink-50/60", band: "bg-ink-100/80", chip: "bg-ink-600", text: "text-ink-800", arrow: "✓" };

  return (
    <div className={`overflow-hidden rounded-2xl border-2 ${skin.frame}`}>
      <div className={`flex flex-wrap items-center gap-2.5 px-3 py-2.5 ${skin.band}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm ${skin.chip}`} aria-hidden>
          {skin.arrow}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold uppercase tracking-wide ${skin.text}`}>
            {step != null ? `Step ${step} · ` : ""}
            {title}
          </p>
          <p className="text-[11px] leading-snug text-ink-600">{subtitle}</p>
        </div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600">{title}</h4>
        {subtitle && <p className="text-[11px] leading-snug text-ink-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
