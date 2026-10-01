"use client";

import { toDateKey } from "@/lib/trackingHistory";
import { REPORT_PRESETS, type ReportPreset } from "@/lib/reports";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Input } from "@/components/ui/FormControls";

export interface ReportCustomRange {
  from: string;
  to: string;
}

/** Reports' own, deliberately smaller period picker - Today / Yesterday /
 *  This Week / This Month / Custom Date. (Tracking History's own fuller 8-
 *  preset, datetime-capable control lives in DateRangeControl - this page
 *  asked for a simpler set, not that one trimmed down in the UI.) */
export function ReportPeriodControl({
  preset,
  onPreset,
  custom,
  onCustom,
}: {
  preset: ReportPreset;
  onPreset: (p: ReportPreset) => void;
  custom: ReportCustomRange;
  onCustom: (c: ReportCustomRange) => void;
}) {
  const today = toDateKey(new Date());
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-600">Report Period</p>
      <FilterTabs value={preset} onChange={onPreset} tabs={REPORT_PRESETS.map((p) => ({ key: p.key, label: p.label }))} />
      {preset === "custom" && (
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          <Input label="From" type="date" value={custom.from} max={today} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          <Input label="To" type="date" value={custom.to} max={today} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
