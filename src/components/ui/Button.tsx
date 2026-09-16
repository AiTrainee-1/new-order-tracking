"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { brandGradient, dangerGradient, SHADOW_BRAND } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: `relative overflow-hidden text-white ${SHADOW_BRAND} hover:-translate-y-px hover:brightness-110 hover:shadow-[0_16px_40px_-10px_rgba(21,94,239,0.65)] disabled:opacity-60 disabled:hover:translate-y-0`,
  secondary:
    "border border-white/80 bg-white/70 text-ink-800 shadow-[0_8px_20px_-14px_rgba(30,41,90,0.45)] backdrop-blur-md hover:bg-white hover:text-brand disabled:opacity-60",
  ghost: "bg-transparent text-ink-600 hover:bg-white/70 hover:text-ink-900 disabled:text-ink-300",
  danger:
    "relative overflow-hidden text-white shadow-[0_12px_30px_-8px_rgba(225,29,72,0.5)] hover:-translate-y-px hover:brightness-110 disabled:opacity-60 disabled:hover:translate-y-0",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 rounded-lg",
  md: "text-sm px-5 py-2.5 rounded-xl",
  lg: "text-base px-6 py-3 rounded-xl",
};

const sizeGapClasses: Record<Size, string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
};

/** The blob colour each gooey variant surges in with - a shade brighter than
 * its base gradient, so the motion reads against the fill instead of
 * disappearing into it. */
const blobColor: Partial<Record<Variant, string>> = {
  primary: "#2F7BFF",
  danger: "#F87171",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className = "", children, disabled, style, ...rest }, ref) => {
    // Gradients ride as inline styles so they can't be lost to a stale config.
    const gradient =
      variant === "primary" ? brandGradient : variant === "danger" ? dangerGradient : undefined;
    const gooey = blobColor[variant];

    return (
      <button
        ref={ref}
        style={{ ...gradient, ...style }}
        className={`group inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:cursor-not-allowed whitespace-nowrap active:scale-[0.98] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        disabled={disabled || isLoading}
        {...rest}
      >
        {gooey && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            style={{ filter: "url(#uk-goo)" }}
          >
            <GooBlob color={gooey} left="-6%" delay="0ms" />
            <GooBlob color={gooey} left="32%" delay="60ms" />
            <GooBlob color={gooey} left="68%" delay="25ms" />
          </span>
        )}
        <span className={`relative z-10 inline-flex items-center justify-center ${sizeGapClasses[size]}`}>
          {isLoading && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {children}
        </span>
      </button>
    );
  },
);
Button.displayName = "Button";

function GooBlob({ color, left, delay }: { color: string; left: string; delay: string }) {
  return (
    <span
      className="absolute bottom-0 h-full w-[38%] origin-bottom scale-125 translate-y-[130%] rounded-full transition-transform duration-500 ease-out group-hover:translate-y-0"
      style={{ left, backgroundColor: color, transitionDelay: delay }}
    />
  );
}

/**
 * The gooey SVG filter every primary/danger Button references via
 * `url(#uk-goo)`. An SVG `id` must be unique document-wide for the reference
 * to reliably resolve, so this is mounted exactly once at the app root (see
 * app/layout.tsx) rather than inside Button itself - every button in the app
 * shares this one filter definition.
 */
export function GooeyDefs() {
  return (
    <svg aria-hidden focusable="false" style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <filter id="uk-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </defs>
    </svg>
  );
}
