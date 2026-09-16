import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand" | "external" | "shortage";

// Dual-tone pills: a translucent tinted background, high-contrast text, and a
// matching border - the "Loom Spatial Glass" status-badge recipe.
const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-500/10 text-slate-600 border border-slate-500/25",
  good: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/25",
  warn: "bg-amber-500/10 text-amber-700 border border-amber-500/25",
  bad: "bg-rose-500/10 text-rose-700 border border-rose-500/25",
  info: "bg-blue-500/10 text-blue-700 border border-blue-500/25",
  brand: "bg-brand-gradient text-white shadow-sm",
  external: "bg-cyan-500/10 text-cyan-700 border border-cyan-500/25",
  shortage: "bg-purple-500/10 text-purple-700 border border-purple-500/25",
};

const dotClasses: Partial<Record<Tone, string>> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  info: "bg-blue-500",
};

export function Badge({
  tone = "neutral",
  pulse = false,
  children,
}: {
  tone?: Tone;
  /** Small pulsing dot for a status that's actively live (in progress, active). */
  pulse?: boolean;
  children: ReactNode;
}) {
  const dot = pulse ? dotClasses[tone] : undefined;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${toneClasses[tone]}`}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dot}`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
        </span>
      )}
      {children}
    </span>
  );
}
