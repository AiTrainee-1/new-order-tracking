import type { LotSizeCell } from "@/lib/chain";
import type { TxnType } from "@/lib/types";

/**
 * StageLedger's configuration and its draft/grid row model - what a stage
 * form passes in (LedgerConfig) and the plain helpers the ledger uses to tell
 * an empty row from a filled one. Split from chainShared.
 */

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
  /** Draw the rejection column AFTER the rework columns instead of before them
   *  - Sewing / Checking / Ironing / Packing read Line Output, Rework, Rework
   *  Solved, Rejection (PCS), Balance after. */
  rejectionLast?: boolean;
  /** Show the order-quantity position (original, excess, rework, rejection,
   *  remaining) above the entry form. */
  quantityPosition?: boolean;
}

export interface GridCell {
  qtyIn: string;
  qtyOut: string;
  rejected: string;
  rework: string;
  reworkAdd: string;
  reworkSolved: string;
}

export const BLANK_CELL: GridCell = { qtyIn: "", qtyOut: "", rejected: "", rework: "", reworkAdd: "", reworkSolved: "" };

export interface GridRow {
  sizeCode: string;
  target: number;
  /** Pieces rejected at earlier garment stages - already taken off `target`. */
  upstreamRejected: number;
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

export function blankDraft(overrides: Partial<DraftRow> = {}): DraftRow {
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

export function draftHasValue(d: DraftRow): boolean {
  return [d.qtyIn, d.qtyOut, d.rejected, d.rework].some((v) => Number(v) > 0);
}

export function cellHasValue(c: GridCell | undefined): boolean {
  if (!c) return false;
  return [c.qtyIn, c.qtyOut, c.rejected, c.rework, c.reworkAdd, c.reworkSolved].some((v) => Number(v) > 0);
}

export function gridCellDone(
  outLabel: LedgerConfig["outLabel"],
  inLabel: LedgerConfig["inLabel"],
  cell: Pick<LotSizeCell, "qtyOut" | "qtyRejected" | "qtyIn">,
): number {
  if (outLabel) return cell.qtyOut + cell.qtyRejected;
  if (inLabel) return cell.qtyIn;
  return 0;
}

export function gridCellAdding(outLabel: LedgerConfig["outLabel"], inLabel: LedgerConfig["inLabel"], cell: GridCell): number {
  if (outLabel) return (Number(cell.qtyOut) || 0) + (Number(cell.rejected) || 0);
  if (inLabel) return Number(cell.qtyIn) || 0;
  return 0;
}

export function overrideNote(notes: string, overridden: boolean): string | null {
  const base = notes.trim();
  if (!overridden) return base || null;
  return `${base}${base ? " · " : ""}[Over available - recorded as recovered rework / extra source]`;
}
