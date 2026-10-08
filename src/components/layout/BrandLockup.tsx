"use client";

import { useId } from "react";
import Link from "next/link";
import { MONOGRAM_BOX, MONOGRAM_PATH, NAME_BOX, NAME_PATH, OVAL_PATH } from "@/components/ui/loader/brandPaths";

/**
 * The sidebar's header: the company's own oval monogram and its hand-lettered
 * "U.K.Textiles" name (both traced to vector from the letterhead, so they stay
 * crisp at any size), with the portal name as a badge beneath.
 *
 * The monogram's centre sits on the same line as the nav icons below it (the
 * rail's 12px padding + a 56px slot -> x = 40px), and is all that remains when
 * the rail is collapsed. A light sweep crosses it on hover.
 */
export function BrandLockup({ href, portalLabel, collapsed }: { href: string; portalLabel: string; collapsed: boolean }) {
  const uid = useId().replace(/:/g, "");
  const ovalFill = `uk-bl-oval-${uid}`;
  const ovalClip = `uk-bl-clip-${uid}`;
  const shine = `uk-bl-shine-${uid}`;
  const nameFill = `uk-bl-name-${uid}`;

  return (
    <Link
      href={href}
      aria-label={`U.K. Textiles - ${portalLabel}`}
      className="group/brand flex h-[72px] items-center gap-3 rounded-none px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
    >
      {/* Monogram */}
      <span className="relative flex w-14 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-x-1 inset-y-0 rounded-full bg-[radial-gradient(closest-side,rgba(89,183,233,0.5),rgba(89,183,233,0))] opacity-0 blur-[6px] transition-opacity duration-300 group-hover/brand:opacity-100"
        />
        <svg
          viewBox={`0 0 ${MONOGRAM_BOX.width} ${MONOGRAM_BOX.height}`}
          className="relative h-auto w-11 overflow-visible drop-shadow-[0_4px_6px_rgba(35,160,216,0.35)] transition-transform duration-300 group-hover/brand:scale-105"
          aria-hidden
        >
          <defs>
            <linearGradient id={ovalFill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6cc3ee" />
              <stop offset="1" stopColor="#47aae0" />
            </linearGradient>
            <clipPath id={ovalClip}>
              <path d={OVAL_PATH} fillRule="evenodd" />
            </clipPath>
            <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.6" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={OVAL_PATH} fillRule="evenodd" fill={`url(#${ovalFill})`} />
          <path d={MONOGRAM_PATH} fillRule="evenodd" fill="#fff" />
          <g clipPath={`url(#${ovalClip})`}>
            <rect
              x={-420}
              y={-60}
              width={420}
              height={MONOGRAM_BOX.height + 120}
              fill={`url(#${shine})`}
              style={{ transition: "transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)" }}
              className="[transform:translateX(0)_skewX(-18deg)] group-hover/brand:[transform:translateX(2300px)_skewX(-18deg)]"
            />
          </g>
        </svg>
      </span>

      {/* Name + portal */}
      <span className={`min-w-0 ${collapsed ? "md:hidden" : ""}`}>
        <svg
          viewBox={`0 0 ${NAME_BOX.width} ${NAME_BOX.height}`}
          className="block h-auto w-[96px] overflow-visible"
          role="img"
          aria-label="U.K. Textiles"
        >
          <defs>
            <linearGradient id={nameFill} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1388c4" />
              <stop offset="1" stopColor="#2ba6e0" />
            </linearGradient>
          </defs>
          <path d={NAME_PATH} fillRule="evenodd" fill={`url(#${nameFill})`} />
        </svg>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-brand transition-colors duration-200 group-hover/brand:bg-brand/15">
          <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-brand" />
          {portalLabel}
        </span>
      </span>
    </Link>
  );
}
