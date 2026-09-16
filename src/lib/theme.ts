import type { CSSProperties } from "react";

/**
 * Shared surface styling for the frosted-glass look used across the app.
 *
 * These are plain inline styles rather than Tailwind theme tokens on purpose:
 * a custom key in the Tailwind theme can lag behind a dev-server reload, and
 * a background quietly failing to paint is how you end up with unreadable
 * text. Colours that only tint (never carry legibility) can stay as Tailwind
 * classes; anything structural lives here.
 */

/** Sign-in backdrop - the fullest expression of the mesh. */
export const authBackground: CSSProperties = {
  backgroundColor: "#EEF3FF",
  backgroundImage: [
    "radial-gradient(at 12% 8%, rgba(56,189,248,0.34) 0px, transparent 55%)",
    "radial-gradient(at 88% 12%, rgba(167,139,250,0.34) 0px, transparent 50%)",
    "radial-gradient(at 78% 88%, rgba(244,114,182,0.28) 0px, transparent 55%)",
    "radial-gradient(at 22% 92%, rgba(45,212,191,0.24) 0px, transparent 50%)",
  ].join(", "),
};

/** In-app backdrop - same palette, dialled back so dense tables stay crisp. */
export const appBackground: CSSProperties = {
  backgroundColor: "#F3F6FD",
  backgroundImage: [
    "radial-gradient(at 8% 4%, rgba(56,189,248,0.20) 0px, transparent 45%)",
    "radial-gradient(at 92% 6%, rgba(167,139,250,0.18) 0px, transparent 42%)",
    "radial-gradient(at 85% 92%, rgba(244,114,182,0.14) 0px, transparent 45%)",
    "radial-gradient(at 10% 96%, rgba(45,212,191,0.14) 0px, transparent 42%)",
  ].join(", "),
  backgroundAttachment: "fixed",
};

/** Sidebar backdrop - a deeper indigo-violet vertical wash (not just a faint
 * tint) so the rail reads as its own zone against both the spatial backdrop
 * behind it and the white cards in front of it. */
export const sidebarBackground: CSSProperties = {
  backgroundImage: [
    "radial-gradient(at 15% 0%, rgba(124,58,237,0.16) 0px, transparent 55%)",
    "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(224,231,255,0.95) 45%, rgba(199,199,250,0.9) 100%)",
  ].join(", "),
};

/** Diagonal highlight laid over a glass panel so it catches light. */
export const glassSheen: CSSProperties = {
  backgroundImage:
    "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0.6) 100%)",
};

/** Primary action gradient: brand blue running into violet. */
export const brandGradient: CSSProperties = {
  backgroundImage: "linear-gradient(120deg, #0B3FAE 0%, #155EEF 45%, #7C3AED 100%)",
};

/** Same ramp, for text via bg-clip-text. */
export const headingGradient: CSSProperties = {
  backgroundImage: "linear-gradient(100deg, #155EEF 0%, #7C3AED 55%, #DB2777 100%)",
};

export const dangerGradient: CSSProperties = {
  backgroundImage: "linear-gradient(120deg, #9F1239 0%, #E11D48 100%)",
};

export type IconTone = "sky" | "amber" | "emerald" | "violet" | "rose" | "slate";

/** Gradient tiles for stat/feature icons. */
export const iconGradient: Record<IconTone, CSSProperties> = {
  sky: { backgroundImage: "linear-gradient(135deg, #38BDF8 0%, #2563EB 100%)" },
  amber: { backgroundImage: "linear-gradient(135deg, #FBBF24 0%, #F97316 100%)" },
  emerald: { backgroundImage: "linear-gradient(135deg, #34D399 0%, #0D9488 100%)" },
  violet: { backgroundImage: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)" },
  rose: { backgroundImage: "linear-gradient(135deg, #FB7185 0%, #E11D48 100%)" },
  slate: { backgroundImage: "linear-gradient(135deg, #94A3B8 0%, #475569 100%)" },
};

/** Faint dot texture layered over a backdrop. */
export const dotTexture: CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgba(16,24,40,0.10) 1px, transparent 1px)",
  backgroundSize: "26px 26px",
};

export const SHADOW_GLASS = "shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),0_4px_12px_-2px_rgba(21,94,239,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.90)]";
export const SHADOW_GLASS_HOVER = "hover:shadow-[0_16px_40px_-6px_rgba(15,23,42,0.10),0_6px_16px_-2px_rgba(21,94,239,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.90)]";
export const SHADOW_PANEL =
  "shadow-[0_24px_48px_-12px_rgba(15,23,42,0.14),0_8px_24px_-4px_rgba(124,58,237,0.06),inset_0_2px_2px_0_rgba(255,255,255,1.0)]";
export const SHADOW_BRAND = "shadow-[0_12px_30px_-8px_rgba(21,94,239,0.55)]";

/** Standard frosted card surface. */
export const GLASS_CARD =
  "rounded-2xl border border-white/70 bg-white/80 backdrop-blur-[20px] backdrop-saturate-[1.8] " + SHADOW_GLASS;

/** Frosted card surface + a genuine neomorphic dual shadow, replacing
 * SHADOW_GLASS rather than stacking with it - two `shadow-[...]` utilities on
 * one element don't compose, only the one Tailwind's build ends up ordering
 * last actually wins, so this is one combined class instead of two. */
export const GLASS_CARD_NEO =
  "rounded-2xl border border-white/70 bg-white/80 backdrop-blur-[20px] backdrop-saturate-[1.8] " +
  "shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),0_4px_12px_-2px_rgba(21,94,239,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.90)]";

// ---------------------------------------------------------------------------
// Neomorphism + spatial UI layer
// ---------------------------------------------------------------------------

/** Raised: the surface sits above the canvas, catching light top-left. */
export const SHADOW_NEO_RAISED =
  "shadow-[0_12px_32px_-4px_rgba(15,23,42,0.08),0_4px_12px_-2px_rgba(21,94,239,0.04),inset_0_1px_1px_0_rgba(255,255,255,0.90)]";
/** Raised, larger - for hero cards / the sign-in panel. */
export const SHADOW_NEO_RAISED_LG =
  "shadow-[16px_16px_40px_-12px_rgba(30,41,90,0.22),-10px_-10px_28px_-14px_rgba(255,255,255,0.95)]";
/** Pressed: the surface sits below the canvas, like an inset button or field. */
export const SHADOW_NEO_PRESSED = "shadow-[inset_0_2px_4px_rgba(15,23,42,0.05)]";
/** Floating chip - a small pop, for pills and node badges. */
export const SHADOW_NEO_CHIP =
  "shadow-[0_4px_12px_-4px_rgba(15,23,42,0.10),0_2px_6px_-2px_rgba(21,94,239,0.06)]";

/** Neomorphic surface: soft, same-tone, raised. */
export const NEO_SURFACE = `rounded-[1.75rem] border border-white/60 bg-[#EEF2FA] ${SHADOW_NEO_RAISED}`;

/** Spatial backdrop: layered soft blobs, deliberately deeper and more
 * saturated than a plain white/pastel fill. Used for the in-app layout
 * backdrop (Admin/User shells); the sign-in screen keeps authBackground. */
export const spatialBackground: CSSProperties = {
  backgroundColor: "#DEE6FA",
  backgroundImage: [
    "radial-gradient(at 15% 8%, rgba(99,102,241,0.26) 0px, transparent 52%)",
    "radial-gradient(at 85% 0%, rgba(236,72,153,0.22) 0px, transparent 48%)",
    "radial-gradient(at 92% 88%, rgba(45,212,191,0.26) 0px, transparent 52%)",
    "radial-gradient(at 6% 92%, rgba(251,191,36,0.20) 0px, transparent 48%)",
    "linear-gradient(180deg, #E7ECFB 0%, #D9E2F7 100%)",
  ].join(", "),
  backgroundAttachment: "fixed",
};

/** Stronger heading ramp - three warm-to-cool stops, for the bolder display
 * type the spatial theme calls for. */
export const headingGradientStrong: CSSProperties = {
  backgroundImage: "linear-gradient(105deg, #4338CA 0%, #7C3AED 40%, #DB2777 75%, #F97316 100%)",
};

/** Bubbly node fills for the Production Workflow Pipeline. */
export const bubbleGradient = {
  good: "radial-gradient(circle at 32% 28%, #6EE7B7 0%, #10B981 55%, #047857 100%)",
  partial: "radial-gradient(circle at 32% 28%, #FCD34D 0%, #F59E0B 55%, #B45309 100%)",
  current: "radial-gradient(circle at 32% 28%, #93C5FD 0%, #3B82F6 55%, #1D4ED8 100%)",
  idle: "radial-gradient(circle at 32% 28%, #FFFFFF 0%, #E2E8F0 70%, #CBD5E1 100%)",
} as const;

/** Same bubbles, one shade deeper - for the node the user has clicked into. */
export const bubbleGradientSelected = {
  good: "radial-gradient(circle at 32% 28%, #34D399 0%, #059669 55%, #065F46 100%)",
  partial: "radial-gradient(circle at 32% 28%, #FBBF24 0%, #D97706 55%, #92400E 100%)",
  current: "radial-gradient(circle at 32% 28%, #60A5FA 0%, #2563EB 55%, #1E40AF 100%)",
  idle: "radial-gradient(circle at 32% 28%, #E2E8F0 0%, #CBD5E1 65%, #94A3B8 100%)",
} as const;

/** Card status colouring - used on Order cards and Data Input assignment
 * cards so the same four states always mean the same colour everywhere. */
export type CardStatusTone = "notStarted" | "started" | "completed" | "yourTurn";

export const cardStatusSoftBg: Record<CardStatusTone, CSSProperties> = {
  notStarted: { backgroundImage: "linear-gradient(160deg, #F4F6F9 0%, #E8ECF1 100%)" },
  started: { backgroundImage: "linear-gradient(160deg, #EFF5FF 0%, #DDEAFE 100%)" },
  completed: { backgroundImage: "linear-gradient(160deg, #EDFCF5 0%, #D6F5E6 100%)" },
  yourTurn: { backgroundImage: "linear-gradient(160deg, #FFFBEB 0%, #FDF0C8 100%)" },
};

export const cardStatusAccent: Record<CardStatusTone, string> = {
  notStarted: "#64748B",
  started: "#155EEF",
  completed: "#059669",
  yourTurn: "#D97706",
};

export const cardStatusBorder: Record<CardStatusTone, string> = {
  notStarted: "border-slate-300/60",
  started: "border-blue-300/60",
  completed: "border-emerald-300/60",
  yourTurn: "border-amber-300/60",
};

export const cardStatusShadow: Record<CardStatusTone, string> = {
  notStarted: "shadow-[0_10px_24px_-16px_rgba(71,85,105,0.4)]",
  started: "shadow-[0_10px_24px_-16px_rgba(21,94,239,0.4)]",
  completed: "shadow-[0_10px_24px_-16px_rgba(5,150,105,0.4)]",
  yourTurn: "shadow-[0_10px_24px_-16px_rgba(217,119,6,0.4)]",
};

export const cardStatusLabel: Record<CardStatusTone, string> = {
  notStarted: "Not started",
  started: "Started",
  completed: "Completed",
  yourTurn: "Your turn",
};

/** Maps an order's overall production status onto the same four card
 * colours everywhere a per-order card shows its progress - gray/blue/orange/
 * green always mean the same thing (not started / on track / needs
 * attention / done), instead of every card list inventing its own rule. */
export function orderStatusToCardTone(status: "not_started" | "on_track" | "due_soon" | "delayed" | "completed"): CardStatusTone {
  if (status === "completed") return "completed";
  if (status === "not_started") return "notStarted";
  if (status === "due_soon" || status === "delayed") return "yourTurn";
  return "started";
}

/** Same four-colour language for lists that only know an order's visibility
 * and delivery urgency (no progress data loaded) - hidden reads as gray,
 * an approaching/overdue delivery as orange, everything else as blue. */
export function orderUrgencyToCardTone(isHidden: boolean, urgency: "overdue" | "urgent" | "soon" | "safe" | "none"): CardStatusTone {
  if (isHidden) return "notStarted";
  if (urgency === "overdue" || urgency === "urgent" || urgency === "soon") return "yourTurn";
  return "started";
}
