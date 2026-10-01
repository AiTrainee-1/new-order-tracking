"use client";

import { DATE_PRESETS, toDateKey, toDateTimeInput, type DatePreset } from "@/lib/trackingHistory";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Input } from "@/components/ui/FormControls";

export interface CustomRangeInput {
  from: string;
  to: string;
  fromTime?: string;
  toTime?: string;
}

/** The date/time filter every report tab (except Today vs Yesterday, which
 *  is always literal) reads from. "Custom Date Range" picks whole days;
 *  "Custom Date + Time" picks exact moments, for when "today's entries so
 *  far" or a shift boundary matters more than a full calendar day. */
export function DateRangeControl({
  preset,
  onPreset,
  custom,
  onCustom,
}: {
  preset: DatePreset;
  onPreset: (p: DatePreset) => void;
  custom: CustomRangeInput;
  onCustom: (c: CustomRangeInput) => void;
}) {
  const today = toDateKey(new Date());
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-600">Date &amp; Time Range</p>
      <FilterTabs value={preset} onChange={onPreset} tabs={DATE_PRESETS.map((p) => ({ key: p.key, label: p.label }))} />

      {preset === "custom" && (
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          <Input label="From" type="date" value={custom.from} max={today} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          <Input label="To" type="date" value={custom.to} max={today} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </div>
      )}

      {preset === "customDateTime" && (
        <div className="mt-3 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="From"
            type="datetime-local"
            value={custom.from && custom.fromTime ? `${custom.from}T${custom.fromTime}` : toDateTimeInput(new Date())}
            max={toDateTimeInput(new Date())}
            onChange={(e) => {
              const [d, t] = e.target.value.split("T");
              onCustom({ ...custom, from: d, fromTime: t });
            }}
          />
          <Input
            label="To"
            type="datetime-local"
            value={custom.to && custom.toTime ? `${custom.to}T${custom.toTime}` : toDateTimeInput(new Date())}
            max={toDateTimeInput(new Date())}
            onChange={(e) => {
              const [d, t] = e.target.value.split("T");
              onCustom({ ...custom, to: d, toTime: t });
            }}
          />
        </div>
      )}
    </div>
  );
}
