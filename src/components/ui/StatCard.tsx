import type { ReactNode } from "react";
import { iconGradient, SHADOW_GLASS, SHADOW_GLASS_HOVER, type IconTone } from "@/lib/theme";

type Tone = "neutral" | "good" | "warn" | "bad" | "brand" | "shortage" | "rejected";

/** Left accent rail - the only place raw colour appears on the tile. */
const toneRail: Record<Tone, string> = {
  neutral: "before:bg-ink-300",
  good: "before:bg-good-gradient",
  warn: "before:bg-warn-gradient",
  bad: "before:bg-bad-gradient",
  brand: "before:bg-brand-gradient",
  shortage: "before:bg-status-shortage",
  rejected: "before:bg-status-rejected",
};

/** Values stay black unless the number itself is a problem. */
const toneValueColor: Record<Tone, string> = {
  neutral: "text-ink-900",
  good: "text-ink-900",
  warn: "text-ink-900",
  bad: "text-red-700",
  brand: "text-ink-900",
  shortage: "text-purple-700",
  rejected: "text-red-700",
};

const toneIcon: Record<Tone, IconTone> = {
  neutral: "slate",
  good: "emerald",
  warn: "amber",
  bad: "rose",
  brand: "sky",
  shortage: "violet",
  rejected: "rose",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-4 backdrop-blur-xl transition-shadow ${SHADOW_GLASS} ${SHADOW_GLASS_HOVER} before:absolute before:inset-y-0 before:left-0 before:w-1 ${toneRail[tone]}`}
    >
      <div className="flex items-center justify-between pl-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {icon && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm shadow-md"
            style={iconGradient[toneIcon[tone]]}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={`mt-2 pl-2 text-2xl font-bold tracking-tight ${toneValueColor[tone]}`}>{value}</p>
      {hint && <p className="mt-1 pl-2 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
