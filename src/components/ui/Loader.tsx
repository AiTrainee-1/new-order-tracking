"use client";

import { useId } from "react";
import styled, { keyframes } from "styled-components";
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

/* ---- intro: plays once, in order ---- */
const popIn = keyframes`
  0%   { opacity: 0; transform: scale(0.55) rotate(-6deg); }
  60%  { opacity: 1; transform: scale(1.06) rotate(0deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
`;
const wipeRight = keyframes`
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0 0 0); }
`;
const riseIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/* ---- ambient: loops while the page loads ---- */
const breathe = keyframes`
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.035); }
`;
const glow = keyframes`
  0%, 100% { opacity: 0.45; transform: scale(0.92); }
  50%      { opacity: 0.9;  transform: scale(1.08); }
`;
const orbit = keyframes`
  from { stroke-dashoffset: 0; }
  to   { stroke-dashoffset: -100; }
`;
const orbitTail = keyframes`
  from { stroke-dashoffset: 18; }
  to   { stroke-dashoffset: -82; }
`;
const sweepEmblem = keyframes`
  0%   { transform: translateX(0)      skewX(-18deg); }
  55%  { transform: translateX(2200px) skewX(-18deg); }
  100% { transform: translateX(2200px) skewX(-18deg); }
`;
const sweepName = keyframes`
  0%, 25% { transform: translateX(-100%); }
  75%     { transform: translateX(270%); }
  100%    { transform: translateX(270%); }
`;
const shuttle = keyframes`
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(260%); }
`;
const dot = keyframes`
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40%           { opacity: 1;    transform: translateY(-3px); }
`;

const Wrapper = styled.div<{ $full: boolean }>`
  --emblem-w: ${(p) => (p.$full ? "190px" : "104px")};
  --name-w: ${(p) => (p.$full ? "min(320px, 78vw)" : "min(204px, 70vw)")};
  --label-size: ${(p) => (p.$full ? "0.8125rem" : "0.75rem")};

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${(p) => (p.$full ? "1.35rem" : "0.9rem")};
  ${(p) => (p.$full ? "min-height: 80vh;" : "padding-block: 2.75rem;")}

  .emblem {
    position: relative;
    width: var(--emblem-w);
    aspect-ratio: ${MONOGRAM_BOX.width + MARGIN * 2} / ${MONOGRAM_BOX.height + MARGIN * 2};
    animation: ${popIn} 0.7s cubic-bezier(0.22, 1.2, 0.36, 1) both;
  }

  .emblem > * {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .halo {
    inset: 8% 4%;
    width: auto;
    height: auto;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(89, 183, 233, 0.55), rgba(89, 183, 233, 0) 72%);
    filter: blur(10px);
    animation: ${glow} 3.2s ease-in-out 0.9s infinite;
  }

  .body {
    transform-origin: 50% 50%;
    animation: ${breathe} 3.2s ease-in-out 0.9s infinite;
  }

  .monogram {
    animation: ${wipeRight} 0.75s cubic-bezier(0.65, 0, 0.35, 1) 0.35s both;
  }

  .track {
    fill: none;
    stroke: ${OVAL_BLUE};
    stroke-width: 11;
    stroke-linecap: round;
    stroke-dasharray: 3 30;
    opacity: 0.5;
  }

  .comet,
  .comet-tail {
    fill: none;
    stroke-linecap: round;
    stroke-dasharray: 18 82;
    stroke: ${NAME_BLUE};
    stroke-width: 17;
    animation: ${orbit} 2.4s linear 0.9s infinite;
  }

  .comet-tail {
    stroke-dasharray: 36 64;
    stroke-width: 11;
    opacity: 0.32;
    animation-name: ${orbitTail};
  }

  .emblem-shine {
    animation: ${sweepEmblem} 3.4s ease-in-out 1.1s infinite backwards;
  }

  .name {
    width: var(--name-w);
    aspect-ratio: ${NAME_BOX.width} / ${NAME_BOX.height};
    position: relative;
    animation: ${wipeRight} 1.05s cubic-bezier(0.65, 0, 0.35, 1) 0.7s both;
  }

  .name svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .name-shine {
    transform-box: fill-box;
    animation: ${sweepName} 3.4s ease-in-out 1.8s infinite backwards;
  }

  .thread {
    position: relative;
    width: calc(var(--name-w) * 0.62);
    height: 3px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(35, 160, 216, 0.16);
    animation: ${riseIn} 0.5s ease-out 1.25s both;
  }

  .thread::before {
    content: "";
    position: absolute;
    inset: 0;
    width: 38%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(35, 160, 216, 0), ${NAME_BLUE} 55%, #7fd0f6);
    animation: ${shuttle} 1.5s cubic-bezier(0.45, 0, 0.55, 1) 1.25s infinite;
  }

  .label {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    max-width: 90vw;
    text-align: center;
    font-size: var(--label-size);
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--color-ink-500, #667085);
    animation: ${riseIn} 0.5s ease-out 1.4s both;
  }

  .label i {
    display: inline-block;
    width: 3px;
    height: 3px;
    margin-left: 1px;
    border-radius: 50%;
    background: ${NAME_BLUE};
    font-style: normal;
    animation: ${dot} 1.2s ease-in-out infinite;
  }
  .label i:nth-of-type(2) {
    animation-delay: 0.16s;
  }
  .label i:nth-of-type(3) {
    animation-delay: 0.32s;
  }

  /* Anyone who asked their device for less motion gets the finished logo,
     still, with no intro, orbit, shine or bounce. */
  @media (prefers-reduced-motion: reduce) {
    .emblem,
    .halo,
    .body,
    .monogram,
    .comet,
    .comet-tail,
    .emblem-shine,
    .name,
    .name-shine,
    .thread,
    .thread::before,
    .label,
    .label i {
      animation: none !important;
    }
    .emblem-shine,
    .name-shine,
    .comet,
    .comet-tail {
      display: none;
    }
    .thread::before {
      width: 100%;
    }
    .label i {
      opacity: 0.7;
    }
  }
`;

/** The app's loading screen, built from the U.K. Textiles monogram and name:
 *  the oval pops in, the UKT letters wipe on, the name writes itself across,
 *  and then a stitched thread ring, a comet, a soft light sweep and a sliding
 *  thread bar keep it alive for as long as the page is loading.
 *
 *  `label` (every call site's own message) sits under the artwork, so the
 *  28 places that use <Loader /> keep saying what they are waiting for.
 *  Sizing for `full` and inline is done with CSS variables on the wrapper -
 *  the artwork itself is vector, so it stays sharp at either size. */
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
    <Wrapper $full={full} role="status" aria-live="polite" aria-label={label}>
      <div className="emblem" aria-hidden="true">
        <div className="halo" />

        {/* thread ring: a faint running stitch with a comet travelling round it */}
        <svg viewBox={VIEW}>
          <ellipse className="track" cx={CX} cy={CY} rx={CX + RING_GAP} ry={CY + RING_GAP} />
          <ellipse className="comet-tail" cx={CX} cy={CY} rx={CX + RING_GAP} ry={CY + RING_GAP} pathLength={100} />
          <ellipse className="comet" cx={CX} cy={CY} rx={CX + RING_GAP} ry={CY + RING_GAP} pathLength={100} />
        </svg>

        <svg className="body" viewBox={VIEW}>
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
            <rect className="emblem-shine" x={-260} y={-120} width={260} height={MONOGRAM_BOX.height + 240} fill={`url(#${shineGrad})`} />
          </g>
        </svg>

        <svg className="monogram" viewBox={VIEW}>
          <path d={MONOGRAM_PATH} fillRule="evenodd" fill="#fff" />
        </svg>
      </div>

      <div className="name" aria-hidden="true">
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
            <rect className="name-shine" x={0} y={0} width={NAME_BOX.width * 0.4} height={NAME_BOX.height} fill={`url(#${nameShineGrad})`} />
          </g>
        </svg>
      </div>

      <div className="thread" aria-hidden="true" />

      <p key={label} className="label">
        <span>{text}</span>
        <i />
        <i />
        <i />
      </p>
    </Wrapper>
  );
}
