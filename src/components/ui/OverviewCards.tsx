import type { ReactNode } from "react";
import type { IconTone } from "@/lib/theme";
import { AccentCard, SectionTitle } from "@/components/ui/SectionCard";
import { CardHeader } from "@/components/ui/Card";
import { HealthBar, type HealthSegment } from "@/components/ui/HealthBar";

/**
 * The two cards every overview row is built from, so the dashboard, Orders,
 * Accessories, Users and Stage Roles all open the same way:
 *
 *   [ HealthOverviewCard - big number + proportional bar + filter tiles ] [ SummaryCard ]
 *
 * Each page supplies its own numbers and wording; the shape stays put.
 */

const BADGE_CLASS = {
  bad: "border-rose-200 bg-rose-50 text-rose-700",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
} as const;

export interface OverviewBadge {
  tone: keyof typeof BADGE_CLASS;
  text: string;
}

/** The wide card: a headline number, a health bar, and a legend of count
 *  tiles. Pass `onSelect` to make the bar and tiles filters (see HealthBar). */
export function HealthOverviewCard({
  tone,
  icon,
  title,
  subtitle,
  headlineLabel,
  headline,
  badge,
  segments,
  total,
  ariaLabel,
  activeKey,
  onSelect,
  unitLabel,
  children,
}: {
  tone: IconTone;
  icon: string;
  title: string;
  subtitle: string;
  headlineLabel: string;
  headline: ReactNode;
  badge?: OverviewBadge | null;
  segments: HealthSegment[];
  total: number;
  ariaLabel: string;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  unitLabel?: string;
  /** Extra content under the tiles. */
  children?: ReactNode;
}) {
  return (
    <AccentCard tone={tone} className="flex flex-col">
      <CardHeader title={<SectionTitle icon={icon} tone={tone}>{title}</SectionTitle>} subtitle={subtitle} />
      <div className="space-y-5 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{headlineLabel}</p>
            <p className="mt-1 text-5xl font-extrabold leading-none tracking-tight text-ink-900 tabular-nums">{headline}</p>
          </div>
          {badge && <span className={`rounded-full border px-3 py-1 text-xs font-bold ${BADGE_CLASS[badge.tone]}`}>{badge.text}</span>}
        </div>

        <HealthBar segments={segments} total={total} ariaLabel={ariaLabel} activeKey={activeKey} onSelect={onSelect} unitLabel={unitLabel} />
        {children}
      </div>
    </AccentCard>
  );
}

export interface SummaryTile {
  label: string;
  value: ReactNode;
  /** Text colour class for the value - defaults to the standard ink. */
  valueClass?: string;
}

/** The narrow card: one big number with a caption, then a 2-column grid of
 *  small tiles. `children` sits under the tiles; `footer` is pinned to the
 *  bottom so a shorter card still lines up with its taller neighbour. */
export function SummaryCard({
  tone,
  icon,
  title,
  subtitle,
  headline,
  headlineLabel,
  tiles,
  children,
  footer,
}: {
  tone: IconTone;
  icon: string;
  title: string;
  subtitle: string;
  headline: ReactNode;
  headlineLabel: string;
  tiles: SummaryTile[];
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <AccentCard tone={tone} className="flex flex-col">
      <CardHeader title={<SectionTitle icon={icon} tone={tone}>{title}</SectionTitle>} subtitle={subtitle} />
      <div className="flex flex-1 flex-col gap-4 px-6 py-5">
        <div className="text-center">
          <p className="text-4xl font-extrabold leading-none tracking-tight text-ink-900 tabular-nums">{headline}</p>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{headlineLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 text-center">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-white/80 bg-white/70 px-2 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t.label}</p>
              <p className={`text-xl font-bold tabular-nums ${t.valueClass ?? "text-ink-900"}`}>{t.value}</p>
            </div>
          ))}
        </div>
        {children}
        {footer && <div className="mt-auto">{footer}</div>}
      </div>
    </AccentCard>
  );
}
