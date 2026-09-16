"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { iconGradient, type IconTone } from "@/lib/theme";

const SECTION_ACCENT: Record<IconTone, string> = {
  sky: "#38BDF8",
  amber: "#FBBF24",
  emerald: "#34D399",
  violet: "#A78BFA",
  rose: "#FB7185",
  slate: "#94A3B8",
};

/** Small gradient icon chip + label, dropped into a CardHeader/section title
 * so every modernized section across the app (Create Order, Job Work,
 * Assign Work, Account Management) reads the same way. */
export function SectionTitle({ icon, tone, children }: { icon: string; tone: IconTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm shadow-[0_6px_14px_-6px_rgba(15,23,42,0.4)]" style={iconGradient[tone]}>
        {icon}
      </span>
      {children}
    </span>
  );
}

/** The top-accent-bar + corner-glow + fade-in treatment used on every
 * modernized card in the app, parameterized by section tone. */
export function AccentCard({ tone, className = "", children }: { tone: IconTone; className?: string; children: ReactNode }) {
  const color = SECTION_ACCENT[tone];
  return (
    <Card className={`relative animate-fadeInUp overflow-hidden ${className}`}>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: color }} />
      <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: `${color}22` }} />
      {children}
    </Card>
  );
}

/** A hero-style gradient banner header, used at the top of every
 * modernized page. */
export function PageHero({
  icon,
  iconBg,
  title,
  titleGradient,
  description,
  action,
}: {
  icon: string;
  iconBg: string;
  title: string;
  titleGradient: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/70 px-6 py-6 shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),0_4px_12px_-2px_rgba(21,94,239,0.04)] backdrop-blur-md">
      <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-status-good/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-[0_12px_30px_-8px_rgba(15,23,42,0.35)]" style={{ backgroundImage: iconBg }}>
            {icon}
          </span>
          <div>
            <h1 className="bg-clip-text text-2xl font-extrabold tracking-tight text-transparent" style={{ backgroundImage: titleGradient }}>
              {title}
            </h1>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-600">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}
