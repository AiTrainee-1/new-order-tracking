"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LinkGlyph } from "./GroupIndicator";

/**
 * The marker on a record that was saved through an Order Group - "Group Entry"
 * in violet, so it reads differently from an ordinary entry at a glance - with a
 * hover/focus tooltip naming the group. Used in Section Activity and in the
 * entry tables of the stage forms.
 *
 * Portalled to <body> in viewport coordinates like the other tooltips: the cards
 * these sit in are frosted panels that would clip a CSS-absolute popover.
 */
export function GroupEntryChip({ groupName, compact = false }: { groupName?: string | null; compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  function show() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAnchor({ top: r.top - 8, left: r.left + r.width / 2 });
  }

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={() => setAnchor(null)}
        onFocus={show}
        onBlur={() => setAnchor(null)}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-violet-300 bg-violet-100 font-bold uppercase tracking-wide text-violet-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
          compact ? "h-5 px-1.5 text-[10px]" : "px-2 py-0.5 text-[10px]"
        }`}
      >
        <LinkGlyph size={compact ? 9 : 10} />
        Group Entry
      </span>
      {anchor &&
        createPortal(
          <div
            style={{ top: anchor.top, left: anchor.left }}
            className="pointer-events-none fixed z-[999] w-60 -translate-x-1/2 -translate-y-full rounded-xl border border-violet-200 bg-white p-3 text-left shadow-[0_24px_50px_-14px_rgba(30,41,90,0.55),0_4px_14px_-4px_rgba(30,41,90,0.35)] ring-1 ring-black/[0.04]"
          >
            <p className="flex items-center gap-1.5 text-xs font-bold text-violet-700">
              <LinkGlyph size={12} /> Group Entry
            </p>
            <p className="mt-1 text-[11px] leading-snug text-ink-700">
              This record was saved through the group{groupName ? <> <b>&ldquo;{groupName}&rdquo;</b></> : ""} and is recorded on every other order in that group at this stage too.
            </p>
            <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-violet-200 bg-white" />
          </div>,
          document.body,
        )}
    </>
  );
}
