export interface StageQtyLabels {
  in: string;
  out: string;
  rejected: string;
  rework: string | false;
  balance: string;
}

const DEFAULT_LABELS: StageQtyLabels = { in: "In", out: "Out", rejected: "Rejected", rework: false, balance: "Balance" };

/** Column headings come from the stage's own vocabulary - a Knitting row
 *  reads Sent/Received, not In/Out. Keyed by the frozen catalog `key` on
 *  each order's stage-plan row, exactly like the old app keyed by
 *  workflow_stages.key. */
const LABELS: Record<string, StageQtyLabels> = {
  raw_material_planning: { in: "Input", out: "Required Plan", rejected: "Dropped", rework: false, balance: "Not Planned" },
  po_to_suppliers: { in: "Required", out: "Planned", rejected: "Cancelled", rework: false, balance: "Yet to Order" },
  raw_material_inward: { in: "Planned", out: "Received", rejected: "Rejected", rework: false, balance: "Yet to Arrive" },
  knitting: { in: "Sent", out: "Received", rejected: "Wastage", rework: false, balance: "With Knitter" },
  dyeing: { in: "Sent", out: "Received", rejected: "Reject", rework: false, balance: "With Dyer" },
  brushing: { in: "Sent", out: "Received", rejected: "Reject", rework: false, balance: "With Brusher" },
  compacting: { in: "Sent", out: "Received", rejected: "Reject", rework: false, balance: "With Compactor" },
  fabric_inhouse: { in: "Sent by Processor", out: "Received", rejected: "Reject", rework: false, balance: "Short in Transit" },
  fabric_inspection: { in: "Sent for Testing", out: "Passed", rejected: "Rejected", rework: false, balance: "Untested" },
  fabric_store: { in: "Received", out: "Final Approved Qty", rejected: "Reject", rework: false, balance: "Unaccounted" },
  cutting: { in: "Fabric Issued", out: "Cut", rejected: "Wastage", rework: false, balance: "Left to Cut" },
  panel_checking: { in: "Checked", out: "Accepted", rejected: "Rejected", rework: "Rework", balance: "Left to Check" },
  embroidery: { in: "Sent", out: "Received", rejected: "Rejected", rework: false, balance: "With Vendor" },
  garment_die: { in: "Sent", out: "Received", rejected: "Rejected", rework: false, balance: "With Vendor" },
  printing: { in: "Sent", out: "Received", rejected: "Rejected", rework: false, balance: "With Vendor" },
  stone: { in: "Sent", out: "Received", rejected: "Rejected", rework: false, balance: "With Vendor" },
  sewing: { in: "Line Input", out: "Line Output", rejected: "Rejected", rework: "Rework", balance: "On the Line" },
  checking: { in: "Checked", out: "Accepted", rejected: "Rejected", rework: "Rework", balance: "Left to Check" },
  ironing: { in: "Input", out: "Pressed", rejected: "Damaged", rework: false, balance: "Left to Press" },
  packing: { in: "Input", out: "Packed", rejected: "Damaged", rework: false, balance: "Left to Pack" },
};

export function stageQtyLabels(stageKey: string | undefined | null): StageQtyLabels {
  return (stageKey && LABELS[stageKey]) || DEFAULT_LABELS;
}
