"use client";

import { useRouter } from "next/navigation";

/** Consistent back-navigation control for any drill-down page. Pass `to` for a
 * fixed destination (e.g. a list page); omit it to just pop browser history,
 * or pass `onClick` for in-page "back to list" behavior.
 *
 * A real button, not a bare text link - raised off the page with its own
 * shadow and border, so it reads as a control you press rather than a piece
 * of body copy that happens to be clickable. */
export function BackButton({
  to,
  onClick,
  label = "Back",
}: {
  to?: string;
  onClick?: () => void;
  label?: string;
}) {
  const router = useRouter();

  function handleClick() {
    if (onClick) return onClick();
    if (to) return router.push(to);
    router.back();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 py-2 pl-2.5 pr-4 text-sm font-semibold text-ink-700 shadow-[3px_3px_8px_-3px_rgba(30,41,90,0.25),-2px_-2px_6px_-3px_rgba(255,255,255,0.9)] backdrop-blur-md transition-all duration-150 hover:-translate-x-0.5 hover:text-brand active:translate-x-0 active:shadow-[inset_2px_2px_5px_-2px_rgba(30,41,90,0.25)]"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 transition-colors group-hover:bg-brand/10 group-hover:text-brand">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label}
    </button>
  );
}
