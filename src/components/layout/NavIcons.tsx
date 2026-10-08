import type { ReactNode } from "react";

/**
 * The sidebar's icon set: one consistent duotone style (24px grid, 1.8 stroke,
 * round caps) - an outline plus a soft 28% fill on the icon's main body - so
 * each reads as a small illustration of its page on top of its coloured tile,
 * and takes the tile's text colour. Emoji were dropped: they render
 * differently on every device and can't be recoloured.
 */
function icon(children: ReactNode) {
  return function NavIcon({ className }: { className?: string }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

/** The soft duotone body fill. */
const SOFT = { fill: "currentColor", fillOpacity: 0.28 } as const;

export const NAV_ICONS = {
  /** Dashboard: tiles of a live board. */
  dashboard: icon(
    <>
      <rect x="3" y="3" width="8" height="9" rx="2" {...SOFT} />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="12" width="8" height="9" rx="2" {...SOFT} />
      <rect x="3" y="16" width="8" height="5" rx="2" />
    </>,
  ),
  /** Orders: a parcel - the thing being made and shipped. */
  orders: icon(
    <>
      <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" {...SOFT} />
      <path d="M3 8l9 5 9-5M12 13v8" />
      <path d="M7.5 5.5l9 5" />
    </>,
  ),
  /** Accessories: a sew-through button, the trim the stage is named for. */
  accessories: icon(
    <>
      <circle cx="12" cy="12" r="9" {...SOFT} />
      <circle cx="12" cy="12" r="5.6" strokeOpacity={0.55} />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </>,
  ),
  /** Tracking history: a clock running backwards. */
  history: icon(
    <>
      <circle cx="12" cy="12" r="5.2" fill="currentColor" fillOpacity={0.2} stroke="none" />
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>,
  ),
  /** Reports: a page with a bar chart. */
  /** TNA: a calendar with a clock - the plan against the clock. */
  tna: icon(
    <>
      <path d="M21 10V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6" {...SOFT} />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <circle cx="17" cy="17" r="5" fill="currentColor" fillOpacity={0.18} />
      <path d="M17 14.5V17l1.6 1" />
    </>,
  ),
  reports: icon(
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" {...SOFT} />
      <path d="M14 3v5h5" />
      <path d="M9 17v-3M12 17v-5M15 17v-2" />
    </>,
  ),
  /** Users: two people. */
  users: icon(
    <>
      <circle cx="9" cy="8" r="3.5" {...SOFT} />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>,
  ),
  /** Assign work: a clipboard with a ticked job. */
  assign: icon(
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" {...SOFT} />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </>,
  ),
  /** Grouping: boxes pulled into one frame (the "group" gesture). */
  grouping: icon(
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="7" height="5" rx="1" {...SOFT} />
      <rect x="10" y="12" width="7" height="5" rx="1" {...SOFT} />
    </>,
  ),
  /** Stage roles: a name badge - who is responsible for which stage. */
  roles: icon(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" {...SOFT} />
      <circle cx="9" cy="11" r="2.1" />
      <path d="M5.6 16.4a3.6 3.6 0 0 1 6.8 0" />
      <path d="M14.5 10h4M14.5 13.5h3" />
    </>,
  ),
  /** Account management: a shield with a tick - access and security. */
  lock: icon(
    <>
      <path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z" {...SOFT} />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>,
  ),
  home: icon(
    <>
      <path d="M5 10v10h14V10" {...SOFT} />
      <path d="M3 11l9-8 9 8" />
      <path d="M10 20v-5h4v5" />
    </>,
  ),
  /** Data input: a pen on the page. */
  input: icon(
    <>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" {...SOFT} />
      <path d="M12 20h9" />
    </>,
  ),
  createOrder: icon(
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" {...SOFT} />
      <path d="M14 3v5h5M12 11v6M9 14h6" />
    </>,
  ),
  factory: icon(
    <>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" {...SOFT} />
      <path d="M17 18h1M12 18h1M7 18h1" />
    </>,
  ),
  logout: icon(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>,
  ),
  chevronRight: icon(<path d="M9 6l6 6-6 6" />),
  chevronLeft: icon(<path d="M15 6l-6 6 6 6" />),
} as const;

export type NavIconName = Exclude<keyof typeof NAV_ICONS, "logout" | "chevronRight" | "chevronLeft">;
