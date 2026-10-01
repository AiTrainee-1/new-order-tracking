"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import type { ReportType } from "./reportTypes";
import { REPORT_TYPES } from "./reportTypes";

/**
 * The dynamic export control: pick a Report Type and a Format independently
 * of which tab is on screen, so e.g. a quick Excel of Stage-Wise can be
 * pulled without leaving Final Order Report. It defaults to (and follows)
 * the active tab, so by default what's exported IS exactly what's on
 * screen - switching it is the deliberate exception, not the norm.
 */
export function ExportBar({
  activeTab,
  exporting,
  onExport,
}: {
  activeTab: ReportType;
  exporting: "png" | "excel" | null;
  onExport: (type: ReportType, format: "png" | "excel") => void;
}) {
  const [type, setType] = useState<ReportType>(activeTab);
  const [followTab, setFollowTab] = useState(true);

  // "Adjust state when a prop changes" (react.dev's own pattern for this,
  // deliberately run during render rather than an effect): whenever the
  // active tab changes and the export select hasn't been manually pointed
  // at a different report type, follow it - so by default the export
  // matches whatever's on screen without an extra render's lag.
  const [lastSeenTab, setLastSeenTab] = useState(activeTab);
  if (activeTab !== lastSeenTab) {
    setLastSeenTab(activeTab);
    if (followTab) setType(activeTab);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/70 bg-white/70 p-3">
      <Select
        label="Export Report Type"
        className="min-w-[13rem]"
        value={type}
        onChange={(e) => {
          const next = e.target.value as ReportType;
          setType(next);
          setFollowTab(next === activeTab);
        }}
      >
        {REPORT_TYPES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
            {r.key === activeTab ? " (current view)" : ""}
          </option>
        ))}
      </Select>
      <Button variant="secondary" onClick={() => onExport(type, "png")} isLoading={exporting === "png"} disabled={!!exporting}>
        Export PNG
      </Button>
      <Button onClick={() => onExport(type, "excel")} isLoading={exporting === "excel"} disabled={!!exporting}>
        Export Excel
      </Button>
    </div>
  );
}
