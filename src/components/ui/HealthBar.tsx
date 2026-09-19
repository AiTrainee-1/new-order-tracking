/** Legend columns for N tiles, as full class strings so Tailwind can see
 *  them. Container-query thresholds are sized to the longest label ("Not
 *  started" needs ~112px of tile) so nothing truncates, and a 2- or 3-tile
 *  legend never spreads across 5 columns leaving thin tiles. */
function legendColumns(count: number): string {
  if (count <= 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-2 @min-[360px]:grid-cols-3";
  if (count === 4) return "grid-cols-2 @min-[480px]:grid-cols-4";
  return "grid-cols-2 @min-[360px]:grid-cols-3 @min-[600px]:grid-cols-5";
}

export interface HealthSegment {
  key: string;
  label: string;
  color: string;
  count: number;
  /** Render the count in red while it's above zero (delayed, overdue). */
  alert?: boolean;
}

/**
 * A proportional bar plus a legend of count tiles - "how is everything
 * doing" as a picture rather than a row of separate numbers. Shared by the
 * dashboard's fleet overview and the Orders page's delivery outlook so the
 * two read identically. Segments are drawn in the order given, so pass them
 * healthiest to least healthy.
 *
 * Passing `onSelect` makes it a filter: every segment and every non-empty
 * tile becomes a button, the `activeKey` one is outlined, and the rest of
 * the bar dims so it's obvious what the list below is showing. Without it,
 * it's a plain read-only graphic.
 */
export function HealthBar({
  segments,
  total,
  ariaLabel,
  activeKey = null,
  onSelect,
  unitLabel = "orders",
}: {
  segments: HealthSegment[];
  total: number;
  ariaLabel: string;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  /** What each tile's percentage is "of" - "orders", "accessories", "accounts"... */
  unitLabel?: string;
}) {
  const drawn = segments.filter((s) => s.count > 0);
  const dimmed = onSelect !== undefined && activeKey !== null;

  return (
    // @container: the legend tiles size off THIS block's width, not the
    // viewport's - it's narrower beside a sidebar or a second card, so
    // viewport breakpoints would truncate the labels at common laptop widths.
    <div className="@container space-y-5">
      <div role={onSelect ? "group" : "img"} aria-label={ariaLabel} className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-ink-100 p-0.5">
        {drawn.map((s) => {
          const className = `h-full min-w-1.5 rounded-full transition-[flex-grow,opacity] duration-500 ${dimmed && activeKey !== s.key ? "opacity-30" : ""}`;
          const style = { flexGrow: s.count, flexBasis: 0, backgroundColor: s.color };
          return onSelect ? (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              aria-pressed={activeKey === s.key}
              aria-label={`${s.label}: ${s.count}`}
              title={`${s.label}: ${s.count}`}
              className={`${className} cursor-pointer hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50`}
              style={style}
            />
          ) : (
            <div key={s.key} title={`${s.label}: ${s.count}`} className={className} style={style} />
          );
        })}
      </div>

      <div className={`grid gap-2 ${legendColumns(segments.length)}`}>
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
          const active = activeKey === s.key;
          // Empty tiles stay put but aren't clickable - filtering to nothing
          // is a dead end - unless one is somehow still active, so it can be cleared.
          const interactive = onSelect !== undefined && (s.count > 0 || active);
          const tileClass = `block rounded-xl border px-2.5 py-2.5 text-left shadow-[0_8px_20px_-16px_rgba(30,41,90,0.5)] transition-all ${
            active ? "border-transparent bg-white" : "border-white/80 bg-white/70"
          } ${interactive ? "cursor-pointer hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50" : ""} ${
            onSelect && !interactive ? "opacity-60" : ""
          }`;
          const tileStyle = active ? { boxShadow: `0 0 0 2px ${s.color}, 0 12px 24px -14px ${s.color}` } : undefined;
          const content = (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="whitespace-nowrap">{s.label}</span>
              </span>
              <span className={`mt-1 block text-2xl font-bold tabular-nums ${s.alert && s.count > 0 ? "text-red-700" : "text-ink-900"}`}>{s.count}</span>
              <span className="block text-[10px] font-medium text-ink-400">{pct}% of {unitLabel}</span>
            </>
          );
          return interactive ? (
            <button key={s.key} type="button" onClick={() => onSelect(s.key)} aria-pressed={active} className={tileClass} style={tileStyle}>
              {content}
            </button>
          ) : (
            <div key={s.key} className={tileClass} style={tileStyle}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
