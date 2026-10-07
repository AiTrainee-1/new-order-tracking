"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { memberLabel, otherMembers, type OrderGroupView } from "@/lib/orderGroups";

/** The small chain-link glyph used for every "this stage is grouped" marker. */
export function LinkGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
    </svg>
  );
}

/** What the group tooltip says - shared by the standalone indicator and by the
 *  stage tooltips that fold it in. */
export function GroupTooltipBody({ group, orderId, stageLabel }: { group: OrderGroupView; orderId: string; stageLabel: string }) {
  const others = otherMembers(group, orderId);
  const shown = others.slice(0, 8);
  return (
    <div className="text-left">
      <p className="flex items-center gap-1.5 text-xs font-bold text-violet-700">
        <LinkGlyph size={13} /> Grouped stage
      </p>
      <p className="mt-1 text-[11px] leading-snug text-ink-700">
        <b>{stageLabel}</b> on this order is part of the group <b>&ldquo;{group.name}&rdquo;</b>. Data entered here is saved to every order in the group at this stage.
      </p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Also grouped ({others.length})</p>
      <ul className="mt-0.5 space-y-0.5 text-[11px] text-ink-700">
        {shown.map((m) => (
          <li key={m.orderId} className="truncate">
            IO {m.ioNo} · {memberLabel(m)}
          </li>
        ))}
        {others.length > shown.length && <li className="text-ink-400">+{others.length - shown.length} more</li>}
      </ul>
      <p className="mt-2 text-[10px] text-ink-500">Grouped stages: {group.stageKeys.length}</p>
    </div>
  );
}

/**
 * A violet chain-link badge for a stage that belongs to an Order Group, with a
 * hover/focus tooltip naming the group and the other orders in it.
 *
 * Portalled to document.body in fixed (viewport) coordinates for the same
 * reason the stage tooltips are: the cards it sits in are frosted panels with
 * backdrop-blur, which would clip or out-rank a CSS-absolute popover.
 */
export function GroupIndicator({ group, orderId, stageLabel, className = "" }: { group: OrderGroupView; orderId: string; stageLabel: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  function show() {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setAnchor({ top: rect.top - 8, left: rect.left + rect.width / 2 });
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
        role="img"
        aria-label={`${stageLabel} is grouped with ${group.members.length - 1} other order${group.members.length === 2 ? "" : "s"}`}
        onMouseEnter={show}
        onMouseLeave={() => setAnchor(null)}
        className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-violet-300 bg-violet-100 text-violet-700 shadow-[0_2px_6px_-2px_rgba(109,40,217,0.5)] ${className}`}
      >
        <LinkGlyph size={11} />
      </span>
      {anchor &&
        createPortal(
          <div
            style={{ top: anchor.top, left: anchor.left }}
            className="pointer-events-none fixed z-[999] w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-violet-200 bg-white p-3 shadow-[0_24px_50px_-14px_rgba(30,41,90,0.55),0_4px_14px_-4px_rgba(30,41,90,0.35)] ring-1 ring-black/[0.04]"
          >
            <GroupTooltipBody group={group} orderId={orderId} stageLabel={stageLabel} />
            <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-violet-200 bg-white" />
          </div>,
          document.body,
        )}
    </>
  );
}
