"use client";

import { useId, type CSSProperties } from "react";
import styles from "./Loader.module.css";
import { MONOGRAM_BOX, MONOGRAM_PATH, NAME_BOX, NAME_PATH, OVAL_PATH } from "./loader/brandPaths";

/** Brand blues, sampled from the company's own letterhead. */
const OVAL_BLUE = "#59b7e9";
const NAME_BLUE = "#23a0d8";

/* Extended view box so the thread ring can orbit outside the oval while every
   layer (oval, monogram, ring) keeps the same coordinates and lines up. */
const MARGIN = 120;
const VIEW = `${-MARGIN} ${-MARGIN} ${MONOGRAM_BOX.width + MARGIN * 2} ${MONOGRAM_BOX.height + MARGIN * 2}`;
const CX = MONOGRAM_BOX.width / 2;
const CY = MONOGRAM_BOX.height / 2;
const RING_GAP = 78;
const EMBLEM_RATIO = `${MONOGRAM_BOX.width + MARGIN * 2} / ${MONOGRAM_BOX.height + MARGIN * 2}`;
const NAME_RATIO = `${NAME_BOX.width} / ${NAME_BOX.height}`;

/** Brand colours handed to the stylesheet as custom properties. */
const WRAPPER_STYLE = { "--oval-blue": OVAL_BLUE, "--name-blue": NAME_BLUE } as CSSProperties;

/** The app's loading screen, built from the U.K. Textiles monogram and name:
 *  the oval pops in, the UKT letters wipe on, the name writes itself across,
 *  and then a stitched thread ring, a comet, a soft light sweep and a sliding
 *  thread bar keep it alive for as long as the page is loading.
 *
 *  `label` (every call site's own message) sits under the artwork, so the
 *  28 places that use <Loader /> keep saying what they are waiting for.
 *  Sizing for `full` and inline is done with CSS variables on the wrapper
 *  (see Loader.module.css) - the artwork itself is vector, so it stays sharp
 *  at either size. */
export function Loader({ label = "Loading…", full = false }: { label?: string; full?: boolean }) {
  // Unique per instance: two loaders on one screen must not share clip/gradient ids.
  const uid = useId().replace(/:/g, "");
  const ovalClip = `uk-oval-${uid}`;
  const ovalFill = `uk-oval-fill-${uid}`;
  const shineGrad = `uk-shine-${uid}`;
  const nameClip = `uk-name-${uid}`;
  const nameShineGrad = `uk-name-shine-${uid}`;

  // "Loading…" -> "Loading" + animated dots; a label that doesn't end in an
  // ellipsis keeps its own text and gets the dots after it.
  const text = label.replace(/(\.{3}|…)\s*$/, "");

  return (
    <div className={`${styles.wrapper} ${full ? styles.full : styles.inline}`} style={WRAPPER_STYLE} role="status" aria-live="polite" aria-label={label}>
      <div className={styles.emblem} style={{ aspectRatio: EMBLEM_RATIO }} aria-hidden="true">
        <div className={styles.halo} />

        {/* thread ring: a faint running stitch with a comet travelling round it */}
        <svg viewBox={VIEW}>
          <ellipse className={styles.track} cx={CX} cy={CY} rx={CX + RING_GAP} ry={CY + RING_GAP} />
          <ellipse className={styles.cometTail} cx={CX} cy={CY} rx={CX + RING_GAP} ry={CY + RING_GAP} pathLength={100} />
          <ellipse className={styles.comet} cx={CX} cy={CY} rx={CX + RING_GAP} ry={CY + RING_GAP} pathLength={100} />
        </svg>

        <svg className={styles.body} viewBox={VIEW}>
          <defs>
            <clipPath id={ovalClip}>
              <path d={OVAL_PATH} fillRule="evenodd" />
            </clipPath>
            <linearGradient id={ovalFill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6cc3ee" />
              <stop offset="1" stopColor="#4aaee3" />
            </linearGradient>
            <linearGradient id={shineGrad} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={OVAL_PATH} fillRule="evenodd" fill={`url(#${ovalFill})`} />
          <g clipPath={`url(#${ovalClip})`}>
            <rect className={styles.emblemShine} x={-260} y={-120} width={260} height={MONOGRAM_BOX.height + 240} fill={`url(#${shineGrad})`} />
          </g>
        </svg>

        <svg className={styles.monogram} viewBox={VIEW}>
          <path d={MONOGRAM_PATH} fillRule="evenodd" fill="#fff" />
        </svg>
      </div>

      <div className={styles.name} style={{ aspectRatio: NAME_RATIO }} aria-hidden="true">
        <svg viewBox={`0 0 ${NAME_BOX.width} ${NAME_BOX.height}`}>
          <defs>
            <clipPath id={nameClip}>
              <path d={NAME_PATH} fillRule="evenodd" />
            </clipPath>
            <linearGradient id={nameShineGrad} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={NAME_PATH} fillRule="evenodd" fill={NAME_BLUE} />
          <g clipPath={`url(#${nameClip})`}>
            <rect className={styles.nameShine} x={0} y={0} width={NAME_BOX.width * 0.4} height={NAME_BOX.height} fill={`url(#${nameShineGrad})`} />
          </g>
        </svg>
      </div>

      <div className={styles.thread} aria-hidden="true" />

      <p key={label} className={styles.label}>
        <span>{text}</span>
        <i />
        <i />
        <i />
      </p>
    </div>
  );
}
