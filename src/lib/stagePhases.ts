export type PhaseKey = "procurement" | "fabric" | "garment";

export interface StagePhase {
  key: PhaseKey;
  label: string;
  hint: string;
  initial: string;
  rail: string;
  band: string;
  chip: string;
  text: string;
}

export const PHASES: StagePhase[] = [
  {
    key: "procurement",
    label: "Order & Procurement",
    hint: "Confirming the order and getting yarn into the store.",
    initial: "1",
    rail: "border-l-cyan-500",
    band: "bg-cyan-50/70",
    chip: "bg-cyan-600",
    text: "text-cyan-900",
  },
  {
    key: "fabric",
    label: "Fabric Production",
    hint: "Knitting through to the fabric store - measured in kilograms, tracked by lot.",
    initial: "2",
    rail: "border-l-blue-500",
    band: "bg-blue-50/70",
    chip: "bg-blue-600",
    text: "text-blue-900",
  },
  {
    key: "garment",
    label: "Garment Production",
    hint: "Cutting onwards - measured in pieces, tracked by lot and size.",
    initial: "3",
    rail: "border-l-emerald-500",
    band: "bg-emerald-50/70",
    chip: "bg-emerald-600",
    text: "text-emerald-900",
  },
];

const PROCUREMENT_KEYS = ["order_confirmation", "raw_material_planning", "po_to_suppliers", "raw_material_inward"];

const FABRIC_KEYS = [
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
];

/** Everything else (cutting through packing) falls into "garment" by
 *  exclusion, same as the old app. */
export function phaseOf(stageKey: string): PhaseKey {
  if (PROCUREMENT_KEYS.includes(stageKey)) return "procurement";
  if (FABRIC_KEYS.includes(stageKey)) return "fabric";
  return "garment";
}
