export type ReportType = "finalOrder" | "userWise" | "stageWise" | "orderWise" | "activity" | "comparison";

export const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: "finalOrder", label: "Final Order Report" },
  { key: "userWise", label: "User-Wise Report" },
  { key: "comparison", label: "Today vs Yesterday" },
  { key: "stageWise", label: "Stage-Wise Report" },
  { key: "orderWise", label: "Order-Wise Report" },
  { key: "activity", label: "Detailed Activity Report" },
];
