"use client";

import styled from "styled-components";

/** Base colour per tone - everything else (light/lighter/dark tints, the
 * glossy fill, the bead-like thumb) is derived from this via color-mix, the
 * same recipe the "kawaii" range-slider design this is styled after uses. */
const TONE_BASE: Record<"brand" | "good" | "warn" | "bad", string> = {
  brand: "#155EEF",
  good: "#059669",
  warn: "#D97706",
  bad: "#E11D48",
};

/** Candy-glossy pill track: a couple of tiny bead highlights baked into the
 * background near the start (the decorative texture from the original
 * slider's track), a soft inset shadow, and a thick white ring - all sized
 * off `$h` so sm/md stay proportional. Kept as plain divs (not a real
 * `<input type="range">`) since a native slider can't be dropped inside the
 * clickable `<button>` cards this renders in throughout the app - nesting an
 * interactive control inside another interactive control is invalid HTML
 * and would break those cards' click handling. */
const Track = styled.div<{ $base: string; $h: number }>`
  --base: ${(p) => p.$base};
  --light: color-mix(in srgb, var(--base) 55%, #fff);
  --lighter: color-mix(in srgb, var(--base) 22%, #fff);
  --dark: color-mix(in srgb, var(--base) 90%, #000);

  position: relative;
  flex: 1 1 auto;
  height: ${(p) => p.$h}px;
  min-width: 2rem;
  border-radius: 999px;
  border: 2px solid #fff;
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.08),
    inset 0 1px 3px rgba(15, 23, 42, 0.08);
  background:
    radial-gradient(circle at ${(p) => p.$h * 0.7}px 50%, var(--lighter) ${(p) => p.$h * 0.16}px, transparent ${(p) => p.$h * 0.2}px),
    radial-gradient(circle at ${(p) => p.$h * 1.3}px 50%, var(--lighter) ${(p) => p.$h * 0.16}px, transparent ${(p) => p.$h * 0.2}px),
    #eef2f8;
  overflow: hidden;
`;

const Fill = styled.div<{ $pct: number }>`
  position: absolute;
  inset: 0;
  width: ${(p) => p.$pct}%;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 40%, rgba(0, 0, 0, 0.14) 100%),
    linear-gradient(90deg, var(--dark), var(--base) 55%, var(--light));
  transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1);
`;

/** The glossy round "bead" riding the leading edge of the fill - a purely
 * decorative echo of the kawaii slider's thumb, not an actual control. */
const Thumb = styled.div<{ $pct: number; $size: number }>`
  position: absolute;
  top: 50%;
  left: ${(p) => p.$pct}%;
  width: ${(p) => p.$size}px;
  height: ${(p) => p.$size}px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 28%, #fff 0%, var(--light) 45%, var(--base) 100%);
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.35),
    inset 0 1px 1px rgba(255, 255, 255, 0.85);
  transition: left 0.7s cubic-bezier(0.22, 1, 0.36, 1);
`;

export function ProgressBar({
  value,
  tone = "brand",
  showLabel = false,
  className = "",
  size = "md",
}: {
  value: number;
  tone?: "brand" | "good" | "warn" | "bad";
  showLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const height = size === "sm" ? 8 : 11;
  const thumbSize = size === "sm" ? 14 : 18;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Track $base={TONE_BASE[tone]} $h={height}>
        <Fill $pct={clamped} />
        {clamped > 0 && <Thumb $pct={clamped} $size={thumbSize} />}
      </Track>
      {showLabel && <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-600">{clamped}%</span>}
    </div>
  );
}
