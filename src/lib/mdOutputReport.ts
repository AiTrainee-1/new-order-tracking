import type { ProductionChain } from "./chain";
import type { Order, UnitType } from "./types";

/**
 * In-house vs. job-work comparison for the MD Output dashboard.
 *
 * Deliberately separate from reportExport.ts (which admin's Output & Reports
 * page also uses) so this never adds an unrequested sheet to admin's
 * downloads - this file exists only for OutputPage's Stage Matrix.
 *
 * `productionTxns.isJobWork` is pure provenance - chain.ts's own arithmetic
 * never reads it, so a stage's real output is always exactly
 * inHouse + jobWork here.
 */

export interface JobWorkComparisonRow {
  stageKey: string;
  stageLabel: string;
  unit: UnitType;
  inHouse: number;
  jobWork: number;
  total: number;
  /** jobWork / total as a percentage; null when the stage has no output yet. */
  pctJobWork: number | null;
}

/** Every stage with any production_txns activity - this naturally excludes
 * the 3 procurement stages (which write material_entries, not txns) and the
 * confirmation-only stages (which write neither). */
export function buildJobWorkComparisonRows(chain: ProductionChain): JobWorkComparisonRow[] {
  return chain.stages
    .filter((cs) => cs.txns.length > 0)
    .map((cs) => {
      const inHouse = cs.txns.filter((t) => !t.isJobWork).reduce((sum, t) => sum + (t.qtyOut || 0), 0);
      const jobWork = cs.txns.filter((t) => t.isJobWork).reduce((sum, t) => sum + (t.qtyOut || 0), 0);
      const total = inHouse + jobWork;
      return {
        stageKey: cs.stage.key,
        stageLabel: cs.stage.label,
        unit: cs.unit,
        inHouse,
        jobWork,
        total,
        pctJobWork: total > 0 ? Math.round((jobWork / total) * 1000) / 10 : null,
      };
    });
}

export function exportJobWorkComparisonCsv(chain: ProductionChain, order: Order): void {
  const rows = buildJobWorkComparisonRows(chain);
  const head = ["Stage", "Unit", "In-House Output", "Job Work Output", "Total Output", "% Job Work"];
  const body = rows.map((r) => [r.stageLabel, r.unit, r.inHouse, r.jobWork, r.total, r.pctJobWork ?? "-"]);
  const csv = [head, ...body].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${order.style}_in-house-vs-job-work`.replace(/[^\w.-]+/g, "_") + ".csv";
  link.click();
  URL.revokeObjectURL(url);
}
