/**
 * Shared machinery for every quantity-recording stage: never overwrite,
 * always allow editing, always record who/when/why, always show the running
 * cumulative. A stage form supplies a LedgerConfig describing which columns
 * it needs and <StageLedger/> does the rest.
 *
 * The pieces now live in their own modules - this file re-exports them so
 * the stage forms (and StageDetailPanel) keep importing from one place:
 *   chainDisplay      the chain strip, order-qty banner, roll-up tables, panels
 *   LotSelect         the lot picker
 *   stageLedgerModel  LedgerConfig and the draft/grid row model
 *   StageLedger       the ledger itself (+ stageLedgerParts, its small pieces)
 */

export { ChainStrip, DirectionPanel, LotSummaryTable, OrderQtyBanner, QtyBox, QuantityPosition, ReworkSummaryTable, Section, SizeSummaryTable } from "./chainDisplay";
export { LotSelect } from "./LotSelect";
export type { DraftRow, GridCell, LedgerConfig } from "./stageLedgerModel";
export { StageLedger, type StageLedgerHandle, type StageLedgerProps } from "./StageLedger";
