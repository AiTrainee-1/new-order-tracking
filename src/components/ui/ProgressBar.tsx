"use client";

import type { CSSProperties } from "react";
import styles from "./ProgressBar.module.css";

/** Base colour per tone - everything else (light/lighter/dark tints, the
 * glossy fill, the bead-like thumb) is derived from this via color-mix, the
 * same recipe the "kawaii" range-slider design this is styled after uses.
 *
 * Kept as plain divs (not a real `<input type="range">`) since a native
 * slider can't be dropped inside the clickable `<button>` cards this renders
 * in throughout the app - nesting an interactive control inside another
 * interactive control is invalid HTML and would break those cards' click
 * handling. Styles live in ProgressBar.module.css. */
const TONE_BASE: Record<"brand" | "good" | "warn" | "bad", string> = {
  brand: "#155EEF",
  good: "#059669",
  warn: "#D97706",
  bad: "#E11D48",
};

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
  const trackStyle = {
    "--base": TONE_BASE[tone],
    "--h": `${height}px`,
    "--pct": `${clamped}%`,
    "--thumb": `${thumbSize}px`,
  } as CSSProperties;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={styles.track} style={trackStyle}>
        <div className={styles.fill} />
        {clamped > 0 && <div className={styles.thumb} />}
      </div>
      {showLabel && <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-600">{clamped}%</span>}
    </div>
  );
}
